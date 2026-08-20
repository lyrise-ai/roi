// Tests for the research analyst (LYR-216).
//
// Nothing here calls a model. The `ai` SDK and the repo's llm module are
// aliased to stubs at bundle time, the same way `scouts/__tests__/s2.test.mjs`
// does it, so what is under test is the machinery around the model rather than
// its judgement — which is the only part that can be pinned down at all, since
// the whole point of this card is that the output is no longer reproducible.
//
// The load-bearing property is GROUNDING: a finding whose sourceUrl is not in
// the fact store never reaches a prospect. Streaming is where that rule is
// easiest to lose, so it is asserted on the streaming path specifically, not
// just on the returned object.
//
//   Run:  node --test src/lib/roi/research/__tests__/researchAnalyst.test.mjs
//
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { before, beforeEach, test } from 'node:test'

import * as esbuild from 'esbuild'

const here = path.dirname(fileURLToPath(import.meta.url))

let assessResearch
let createResearchAnalyst
let clearAssessmentCache

before(async () => {
  /* The persistent cache layer is best-effort and must stay out of these
     tests; a developer with a populated .env would otherwise hit the real
     project. Memory-only is also how a bare `node --test` runs in CI. */
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY

  const cacheRoot = path.resolve(here, '../../../../..', 'node_modules/.cache')
  fs.mkdirSync(cacheRoot, { recursive: true })
  const tmpDir = fs.mkdtempSync(path.join(cacheRoot, 'analyst-test-'))

  /* `streamObject` is driven by a global the tests set. It returns whatever
     shape the test wants, including a stream that throws partway. */
  fs.writeFileSync(
    path.join(tmpDir, 'ai-stub.mjs'),
    `export const jsonSchema = (s) => s
     export const streamObject = (args) => {
       globalThis.__calls.push(args)
       if (!globalThis.__stream) throw new Error('no stream configured')
       return globalThis.__stream(args)
     }`,
  )
  fs.writeFileSync(
    path.join(tmpDir, 'llm-stub.mjs'),
    `export const getAnalystModel = () => 'stub-analyst-model'`,
  )

  const outfile = path.join(tmpDir, 'bundle.mjs')
  await esbuild.build({
    entryPoints: [path.join(here, '../researchAnalyst.ts')],
    bundle: true,
    packages: 'external',
    alias: {
      ai: path.join(tmpDir, 'ai-stub.mjs'),
      '@/src/lib/roi/llm': path.join(tmpDir, 'llm-stub.mjs'),
    },
    platform: 'node',
    format: 'esm',
    outfile,
  })
  ;({ assessResearch, createResearchAnalyst, clearAssessmentCache } =
    await import(pathToFileURL(outfile).href))
})

beforeEach(() => {
  globalThis.__calls = []
  globalThis.__stream = null
  clearAssessmentCache()
})

// ── fixtures ─────────────────────────────────────────────────────────────────

const POSTING_URL = 'https://acme.example/jobs/paralegal'
const OTHER_URL = 'https://acme.example/jobs/bookkeeper'

/* An S2 result carrying two real postings, so the fact store contains exactly
   two citable URLs and nothing else. */
const s2Result = (postings = [POSTING_URL, OTHER_URL]) => ({
  S2: {
    scout: 'S2',
    status: 'FULL',
    facts: {
      postings: postings.map((url, i) => ({
        title: `Role ${i}`,
        sourceUrl: url,
        excerpt: 'chasing outstanding client documents',
        taskVerbs: ['chase'],
        namedSystems: [],
      })),
    },
    sourcesAttempted: [],
    durationMs: 10,
    costUsd: 0,
  },
})

const finding = (url, headline = 'a real thing about this firm') => ({
  headline,
  kind: 'hiring',
  sourceUrl: url,
  excerpt: null,
})

/* The SDK exposes `partialObjectStream` as an async ITERABLE, not a method, so
   the stub must too — a generator function sitting on that property would make
   every `for await` throw and every test pass for the wrong reason.

   Findings are revealed one at a time, the way a JSON stream parser does it:
   element N is only structurally complete once N+1 has started. */
function partials(object, onTick = () => {}) {
  return (async function* gen() {
    const findings = object.findings ?? []
    for (let i = 0; i < findings.length; i += 1) {
      await onTick(i)
      yield { ...object, findings: findings.slice(0, i + 1) }
    }
    yield object
  })()
}

/* A `streamObject` stub. Pass an object, or a function of the call args for
   the cases where the response depends on what was sent. */
const stream = (objectOrFn, onTick) => (args) => ({
  partialObjectStream: partials(
    typeof objectOrFn === 'function' ? objectOrFn(args) : objectOrFn,
    onTick,
  ),
})

/* A stream that yields whatever `steps` contains and then throws. */
const failingStream = (steps = []) => () => ({
  partialObjectStream: (async function* gen() {
    for (const step of steps) yield step
    throw new Error('upstream 500')
  })(),
})

// ── grounding ────────────────────────────────────────────────────────────────

test('a finding citing a URL not in the fact store is dropped', async () => {
  globalThis.__stream = stream({
    findings: [
      finding(POSTING_URL, 'kept — this URL is in the research'),
      finding('https://acme.example/invented', 'dropped — never retrieved'),
    ],
    manualWorkSignals: ['chasing client documents'],
    confidenceTier: 'RICH',
    reasoning: 'two dated postings',
    gaps: [],
  })

  const out = await assessResearch('acme.example', s2Result())

  assert.equal(out.findings.length, 1)
  assert.equal(out.findings[0].sourceUrl, POSTING_URL)
})

test('the citation check runs on the streaming path, not only at the end', async () => {
  const emitted = []
  globalThis.__stream = stream({
    findings: [
      finding('https://acme.example/invented', 'invented'),
      finding(POSTING_URL, 'real'),
      finding(OTHER_URL, 'also real'),
    ],
    manualWorkSignals: [],
    confidenceTier: 'RICH',
    reasoning: '',
    gaps: [],
  })

  await assessResearch('acme.example', s2Result(), {
    onFinding: (f) => emitted.push(f.sourceUrl),
  })

  /* The invented one never reaches the consumer at all — it is not filtered
     out of a batch afterwards, it is never handed over. */
  assert.deepEqual(emitted, [POSTING_URL, OTHER_URL])
})

test('findings stream incrementally rather than arriving in one batch', async () => {
  /* Records how many findings had been emitted by the time each stream tick
     began. If everything were flushed at the end, every entry would be 0. */
  const emittedAtTick = []
  let count = 0

  globalThis.__stream = stream(
    {
      findings: [
        finding(POSTING_URL, 'first'),
        finding(OTHER_URL, 'second'),
        finding(POSTING_URL, 'third'),
      ],
      manualWorkSignals: [],
      confidenceTier: 'RICH',
      reasoning: '',
      gaps: [],
    },
    (i) => {
      emittedAtTick[i] = count
    },
  )

  await assessResearch('acme.example', s2Result(), {
    onFinding: () => {
      count += 1
    },
  })

  /* By the third tick at least one finding is already in the prospect's
     hands, which is the whole point of the sidebar painting early. */
  assert.equal(emittedAtTick[0], 0)
  assert.ok(
    emittedAtTick[2] > 0,
    `expected findings before the stream ended, got ${JSON.stringify(emittedAtTick)}`,
  )
  assert.equal(count, 3)
})

test('every finding dropped forces THIN even when the model claimed RICH', async () => {
  globalThis.__stream = stream({
    findings: [
      finding('https://elsewhere.example/a', 'invented'),
      finding('https://elsewhere.example/b', 'also invented'),
    ],
    manualWorkSignals: ['plenty of manual work'],
    confidenceTier: 'RICH',
    reasoning: 'I am very confident',
    gaps: [],
  })

  const out = await assessResearch('acme.example', s2Result())

  assert.deepEqual(out.findings, [])
  assert.equal(out.confidenceTier, 'THIN')
})

// ── degradation ──────────────────────────────────────────────────────────────

test('zero retrieved sources means no model call at all', async () => {
  const out = await assessResearch('acme.example', {
    S2: {
      scout: 'S2',
      status: 'ERROR',
      facts: null,
      sourcesAttempted: [],
      durationMs: 1,
      costUsd: 0,
      notes: 'careers page 403',
    },
  })

  assert.equal(globalThis.__calls.length, 0)
  assert.equal(out.confidenceTier, 'THIN')
  /* An ERROR is reported as a gap in our looking, not as an empty company. */
  assert.deepEqual(out.gaps, ['S2: careers page 403'])
})

test('a model that throws degrades to THIN and never rejects', async () => {
  globalThis.__stream = failingStream()

  const out = await assessResearch('acme.example', s2Result())

  assert.equal(out.confidenceTier, 'THIN')
  assert.deepEqual(out.findings, [])
})

test('a stream that dies halfway keeps the findings that were verified', async () => {
  globalThis.__stream = failingStream([
    { findings: [finding(POSTING_URL, 'arrived'), finding(OTHER_URL, 'tail')] },
  ])

  const out = await assessResearch('acme.example', s2Result())

  /* The first is complete because a later one had started; the tail never
     completed and is not claimed. */
  assert.equal(out.findings.length, 1)
  assert.equal(out.findings[0].headline, 'arrived')
  assert.equal(out.confidenceTier, 'THIN')
})

test('a stream that reports an error but does not reject is still a failure', async () => {
  /* `partialObjectStream` is documented as unvalidated, and the SDK surfaces a
     stream-stopping error through `onError` rather than always rejecting. If
     that path were treated as success, a truncated assessment would be cached
     for a day and look complete. */
  globalThis.__stream = (args) => ({
    partialObjectStream: (async function* gen() {
      yield {
        findings: [finding(POSTING_URL, 'arrived'), finding(OTHER_URL, 'tail')],
      }
      args.onError({ error: new Error('provider closed the stream') })
    })(),
  })

  const out = await assessResearch('acme.example', s2Result())
  assert.equal(out.confidenceTier, 'THIN')
  assert.equal(out.findings.length, 1, 'verified findings are still kept')

  /* And crucially, not cached — a second call re-runs. */
  await assessResearch('acme.example', s2Result())
  assert.equal(globalThis.__calls.length, 2)
})

// ── caching ──────────────────────────────────────────────────────────────────

test('identical research is assessed once, and replays through onFinding', async () => {
  const body = {
    findings: [finding(POSTING_URL, 'cached finding')],
    manualWorkSignals: [],
    confidenceTier: 'MODERATE',
    reasoning: '',
    gaps: [],
  }
  globalThis.__stream = stream(body)

  const first = await assessResearch('acme.example', s2Result())

  const replayed = []
  const second = await assessResearch('acme.example', s2Result(), {
    onFinding: (f) => replayed.push(f.headline),
  })

  assert.equal(globalThis.__calls.length, 1, 'second run must not re-bill')
  assert.deepEqual(second.findings, first.findings)
  /* A cache hit must paint the sidebar exactly as a live run does. */
  assert.deepEqual(replayed, ['cached finding'])
})

test('research that actually changed re-runs rather than serving the old key', async () => {
  globalThis.__stream = stream({
    findings: [finding(POSTING_URL, 'one')],
    manualWorkSignals: [],
    confidenceTier: 'MODERATE',
    reasoning: '',
    gaps: [],
  })

  await assessResearch('acme.example', s2Result([POSTING_URL]))
  await assessResearch('acme.example', s2Result([POSTING_URL, OTHER_URL]))

  assert.equal(globalThis.__calls.length, 2)
})

test('a failed assessment is not cached', async () => {
  globalThis.__stream = failingStream()
  await assessResearch('acme.example', s2Result())

  globalThis.__stream = stream({
    findings: [finding(POSTING_URL, 'recovered')],
    manualWorkSignals: [],
    confidenceTier: 'MODERATE',
    reasoning: '',
    gaps: [],
  })
  const out = await assessResearch('acme.example', s2Result())

  assert.equal(globalThis.__calls.length, 2)
  assert.equal(out.findings[0].headline, 'recovered')
})

// ── the incremental analyst ──────────────────────────────────────────────────

test('the analyst assesses as scouts land, not once at the end', async () => {
  const s1 = {
    scout: 'S1',
    status: 'FULL',
    facts: {
      country: {
        value: 'AE',
        provenance: { sourceUrl: 'https://acme.example/about' },
      },
    },
    sourcesAttempted: [],
    durationMs: 5,
    costUsd: 0,
  }

  globalThis.__stream = stream((args) => ({
    findings: args.prompt.includes('/jobs/')
      ? [finding(POSTING_URL, 'from the postings')]
      : [finding('https://acme.example/about', 'from firmographics')],
    manualWorkSignals: [],
    confidenceTier: 'MODERATE',
    reasoning: '',
    gaps: [],
  }))

  const painted = []
  const analyst = createResearchAnalyst('acme.example', {
    onFinding: (f) => painted.push(f.headline),
  })

  analyst.onScoutResolved(s1)
  /* The S1 pass must complete before S2 lands, or the queued run would
     snapshot both and there would be nothing incremental to observe. */
  await analyst.settled()
  assert.deepEqual(painted, ['from firmographics'])

  analyst.onScoutResolved(s2Result().S2)
  const out = await analyst.settled()

  assert.equal(globalThis.__calls.length, 2)
  /* The union, in the order the prospect saw them — not just the last pass. */
  assert.deepEqual(painted, ['from firmographics', 'from the postings'])
  assert.equal(out.findings.length, 2)
})

test('a finding already shown is not repeated when the next scout lands', async () => {
  globalThis.__stream = stream({
    findings: [finding(POSTING_URL, 'the same finding')],
    manualWorkSignals: [],
    confidenceTier: 'MODERATE',
    reasoning: '',
    gaps: [],
  })

  const painted = []
  const analyst = createResearchAnalyst('acme.example', {
    onFinding: (f) => painted.push(f.headline),
  })

  analyst.onScoutResolved(s2Result([POSTING_URL]).S2)
  await analyst.settled()
  analyst.onScoutResolved(s2Result([POSTING_URL, OTHER_URL]).S2)
  const out = await analyst.settled()

  assert.deepEqual(painted, ['the same finding'])
  assert.equal(out.findings.length, 1)
})

test('a consumer callback that throws does not fail the run', async () => {
  globalThis.__stream = stream({
    findings: [finding(POSTING_URL, 'kept')],
    manualWorkSignals: [],
    confidenceTier: 'MODERATE',
    reasoning: '',
    gaps: [],
  })

  const analyst = createResearchAnalyst('acme.example', {
    onFinding: () => {
      throw new Error('the sidebar blew up')
    },
  })

  analyst.onScoutResolved(s2Result().S2)
  const out = await analyst.settled()

  assert.equal(out.findings.length, 1)
})

test('onScoutResolved returns immediately rather than blocking the run', async () => {
  let released
  const gate = new Promise((resolve) => {
    released = resolve
  })

  globalThis.__stream = () => ({
    partialObjectStream: (async function* gen() {
      await gate
      yield {
        findings: [finding(POSTING_URL, 'eventually')],
        manualWorkSignals: [],
        confidenceTier: 'MODERATE',
        reasoning: '',
        gaps: [],
      }
    })(),
  })

  const analyst = createResearchAnalyst('acme.example')
  analyst.onScoutResolved(s2Result().S2)

  /* If this were awaited internally, the orchestrator could not land the next
     scout until a model call finished. */
  let settled = false
  const pending = analyst.settled().then((out) => {
    settled = true
    return out
  })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(settled, false)

  released()
  const out = await pending
  assert.equal(out.findings.length, 1)
})
