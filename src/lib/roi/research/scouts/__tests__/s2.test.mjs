// Cascade and contract tests for S2 (LYR-187 R3 / LYR-196).
//
// Nothing here touches the network, an ATS, or OpenAI. `fetch` is stubbed, and
// the `ai` SDK plus the repo's llm module are aliased to stubs at bundle time
// so extraction is deterministic — the extraction model's judgement is not
// what these tests are about. What they pin down is the cascade: L1 fan-out,
// the NONE-vs-miss distinction that the old system collapsed, L2 fallback, and
// the promise that a raw JD body never leaves the scout.
//
//   Run:  node --test src/lib/roi/research/scouts/__tests__/s2.test.mjs
//
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { after, afterEach, before, beforeEach, test } from 'node:test'

import * as esbuild from 'esbuild'

const here = path.dirname(fileURLToPath(import.meta.url))

let getJobPostings
let clearArtifactCache
let tmpDir
const realFetch = globalThis.fetch

before(async () => {
  const cacheRoot = path.resolve(
    here,
    '../../../../../..',
    'node_modules/.cache',
  )
  fs.mkdirSync(cacheRoot, { recursive: true })
  tmpDir = fs.mkdtempSync(path.join(cacheRoot, 's2-test-'))

  /* `generateObject` is driven by a global the tests set, so extraction is a
     fixture rather than a model call. `jsonSchema` is identity — the real one
     only tags the object for the SDK. */
  fs.writeFileSync(
    path.join(tmpDir, 'ai-stub.mjs'),
    `export const jsonSchema = (s) => s
     export const generateObject = async (args) => {
       if (globalThis.__extract) return globalThis.__extract(args)
       throw new Error('no extractor configured')
     }`,
  )
  fs.writeFileSync(
    path.join(tmpDir, 'llm-stub.mjs'),
    `export const getFastModel = () => 'stub-fast-model'
     export const getResearchModel = () => 'stub-research-model'`,
  )

  const entry = path.join(tmpDir, 'entry.ts')
  fs.writeFileSync(
    entry,
    `export { getJobPostings } from ${JSON.stringify(path.join(here, '../s2.ts'))}\n` +
      `export { clearArtifactCache } from ${JSON.stringify(path.join(here, '../../artifactCache.ts'))}\n`,
  )

  const outfile = path.join(tmpDir, 'bundle.mjs')
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    packages: 'external',
    alias: {
      ai: path.join(tmpDir, 'ai-stub.mjs'),
      '@/src/lib/roi/llm': path.join(tmpDir, 'llm-stub.mjs'),
    },
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'silent',
  })
  ;({ getJobPostings, clearArtifactCache } = await import(
    pathToFileURL(outfile).href
  ))
})

after(() => {
  globalThis.fetch = realFetch
  delete globalThis.__extract
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
})

let calls
function stubFetch(handler) {
  calls = []
  globalThis.fetch = async (url, init) => {
    calls.push(String(url))
    return handler(String(url), init)
  }
}

const json = (body) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
})
const notFound = () => ({
  ok: false,
  status: 404,
  json: async () => ({}),
  text: async () => '',
})

const GREENHOUSE_JOB = {
  title: 'Paralegal',
  /* A realistic JD body. Deliberately not a one-liner: `extractPosting` skips
     the model for bodies under 80 chars, since paying for a call to read
     nothing is worse than returning the title alone. */
  content:
    '<p>As a paralegal you will chase outstanding client documents, reconcile matter records in 3E, ' +
    'and collate bundles ahead of filing deadlines. You will support four fee earners across the ' +
    'commercial litigation team and maintain the matter inbox.</p>',
  absolute_url: 'https://boards.greenhouse.io/acmelaw/jobs/1',
  first_published: '2026-03-03T00:00:00Z',
  location: { name: 'Dubai' },
}

/* A fixed extraction result, so assertions are about the cascade rather than
   about what a model happened to say. */
function extractAs(overrides = {}) {
  globalThis.__extract = async ({ prompt }) => ({
    object: {
      excerpt: prompt.includes('chase outstanding client documents')
        ? 'chase outstanding client documents'
        : '',
      taskVerbs: ['chase', 'reconcile'],
      namedSystems: [{ name: '3E', category: 'practice management' }],
      statedVolumes: [],
      ...overrides,
    },
  })
}

beforeEach(() => {
  clearArtifactCache()
  delete process.env.FIRECRAWL_API_KEY
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  extractAs()
})

afterEach(() => {
  globalThis.fetch = realFetch
})

// ── L1 fan-out ───────────────────────────────────────────────────────────────

test('all six ATS platforms are attempted for every slug candidate', async () => {
  stubFetch(() => notFound())

  const result = await getJobPostings('acme-law.com')

  const platforms = new Set(
    result.sourcesAttempted
      .filter((a) => !a.source.startsWith('careers'))
      .map((a) => a.source.split(':')[0]),
  )
  assert.deepEqual([...platforms].sort(), [
    'ashby',
    'greenhouse',
    'lever',
    'personio',
    'recruitee',
    'workable',
  ])

  /* Two slug candidates for a hyphenated domain, six platforms each. */
  const slugs = new Set(
    result.sourcesAttempted
      .filter((a) => a.source.includes(':'))
      .map((a) => a.source.split(':')[1]),
  )
  assert.deepEqual([...slugs].sort(), ['acme-law', 'acmelaw'])
})

test('Greenhouse is called with content=true', async () => {
  /* Without it the response is titles only, and the JD body is the entire
     value of this scout. */
  stubFetch(() => notFound())
  await getJobPostings('acmelaw.com')

  const gh = calls.find((u) => u.includes('boards-api.greenhouse.io'))
  assert.ok(gh, 'greenhouse must be attempted')
  assert.ok(gh.includes('content=true'), gh)
})

test('a Greenhouse board with roles produces typed facts', async () => {
  stubFetch((url) =>
    url.includes('greenhouse') ? json({ jobs: [GREENHOUSE_JOB] }) : notFound(),
  )

  const result = await getJobPostings('acmelaw.com')

  assert.equal(result.scout, 'S2')
  assert.equal(result.status, 'FULL')
  assert.equal(result.facts.postings.length, 1)

  const posting = result.facts.postings[0]
  assert.equal(posting.title, 'Paralegal')
  assert.equal(posting.location, 'Dubai')
  assert.equal(posting.sourceUrl, 'https://boards.greenhouse.io/acmelaw/jobs/1')
  assert.deepEqual(posting.taskVerbs, ['chase', 'reconcile'])
  assert.equal(result.facts.topTaskVerbs[0].value, 'chase')
  assert.equal(result.facts.namedSystems[0].value.name, '3E')
  assert.equal(result.facts.functionDistribution.legal, 1)
})

test('the richest board wins when several answer', async () => {
  /* A stale Lever board alongside a live Greenhouse one is common. */
  stubFetch((url) => {
    if (url.includes('greenhouse')) {
      return json({
        jobs: [GREENHOUSE_JOB, { ...GREENHOUSE_JOB, title: 'Bookkeeper' }],
      })
    }
    if (url.includes('lever')) {
      return json([
        {
          text: 'Old Role',
          descriptionPlain: 'x',
          hostedUrl: 'https://jobs.lever.co/acmelaw/1',
        },
      ])
    }
    return notFound()
  })

  const result = await getJobPostings('acmelaw.com')

  assert.equal(result.facts.postings.length, 2)
  assert.ok(
    result.facts.postings.every((p) => p.sourceUrl.includes('greenhouse')),
  )
})

// ── NONE vs miss vs ERROR — the rule the old system broke ────────────────────

test('a board that exists with no open roles is NONE, not ERROR', async () => {
  /* 200 with an empty array is the company telling us it is not hiring. That
     is information a writer may state. */
  stubFetch((url) =>
    url.includes('greenhouse') ? json({ jobs: [] }) : notFound(),
  )

  const result = await getJobPostings('acmelaw.com')

  assert.equal(result.status, 'NONE')
  assert.notEqual(result.status, 'ERROR')
  assert.deepEqual(result.facts.postings, [])
  assert.match(result.notes, /greenhouse board found with no open roles/)
})

test('a 404 board is a miss, not a finding', async () => {
  stubFetch(() => notFound())
  const result = await getJobPostings('acmelaw.com')

  assert.ok(
    result.sourcesAttempted.every((a) => a.outcome === 'miss'),
    'every 404 must record as a miss',
  )
  assert.equal(result.status, 'NONE')
})

test('a non-hiring company never returns fabricated postings', async () => {
  stubFetch(() => notFound())
  const result = await getJobPostings('acmelaw.com')

  assert.deepEqual(result.facts.postings, [])
  assert.deepEqual(result.facts.topTaskVerbs, [])
  assert.deepEqual(result.facts.namedSystems, [])
  assert.deepEqual(result.facts.repeatPostings, [])
})

test('a junk domain is ERROR before anything is attempted', async () => {
  stubFetch(() => notFound())
  const result = await getJobPostings('not a domain')

  assert.equal(result.status, 'ERROR')
  assert.equal(calls.length, 0)
})

test('one platform throwing does not take down the sweep', async () => {
  stubFetch((url) => {
    if (url.includes('lever')) throw new Error('ECONNRESET')
    if (url.includes('greenhouse')) return json({ jobs: [GREENHOUSE_JOB] })
    return notFound()
  })

  const result = await getJobPostings('acmelaw.com')

  assert.equal(result.status, 'FULL')
  assert.equal(result.facts.postings.length, 1)
})

// ── L2 careers page ──────────────────────────────────────────────────────────

test('L2 fires when L1 returns nothing', async () => {
  const careersHtml = `<html><body>${'We are hiring a paralegal to chase outstanding client documents and reconcile records. '.repeat(8)}</body></html>`
  stubFetch((url) => {
    if (url.includes('/careers'))
      return { ok: true, status: 200, text: async () => careersHtml }
    return notFound()
  })

  const result = await getJobPostings('acmelaw.com')

  assert.equal(result.status, 'FULL')
  assert.equal(result.facts.postings.length, 1)
  assert.equal(
    result.facts.postings[0].sourceUrl,
    'https://acmelaw.com/careers',
  )
  assert.ok(
    result.sourcesAttempted.some(
      (a) => a.source === 'careers/careers' && a.outcome === 'hit',
    ),
  )
})

test('L2 is skipped entirely when L1 found roles', async () => {
  stubFetch((url) =>
    url.includes('greenhouse') ? json({ jobs: [GREENHOUSE_JOB] }) : notFound(),
  )

  await getJobPostings('acmelaw.com')

  assert.ok(
    !calls.some((u) => u.includes('/careers')),
    'must not crawl when an ATS answered',
  )
})

test('a careers page that renders almost nothing is a miss, not a finding', async () => {
  /* A nav-only shell or a soft-404 must not read as "we found their jobs". */
  stubFetch((url) => {
    if (url.includes('/careers'))
      return {
        ok: true,
        status: 200,
        text: async () => '<html><body><nav>Home</nav></body></html>',
      }
    return notFound()
  })

  const result = await getJobPostings('acmelaw.com')

  assert.equal(result.status, 'NONE')
  assert.ok(
    result.sourcesAttempted.some(
      (a) => a.source.startsWith('careers') && a.outcome === 'miss',
    ),
  )
})

// ── extraction contract ──────────────────────────────────────────────────────

test('raw JD text never travels downstream', async () => {
  stubFetch((url) =>
    url.includes('greenhouse') ? json({ jobs: [GREENHOUSE_JOB] }) : notFound(),
  )

  const result = await getJobPostings('acmelaw.com')
  const serialized = JSON.stringify(result.facts)

  assert.ok(!serialized.includes('<p>'), 'no markup may survive')
  assert.ok(
    !serialized.includes(
      'You will chase outstanding client documents and reconcile matter records in 3E.',
    ),
    'the full JD body must not be carried downstream',
  )
})

test('excerpt is kept only when it is genuinely verbatim', async () => {
  stubFetch((url) =>
    url.includes('greenhouse') ? json({ jobs: [GREENHOUSE_JOB] }) : notFound(),
  )

  const result = await getJobPostings('acmelaw.com')
  assert.equal(
    result.facts.postings[0].excerpt,
    'chase outstanding client documents',
  )
})

test('a paraphrased excerpt is dropped rather than quoted', async () => {
  /* The excerpt exists so a writer can quote. An excerpt that is not in the
     source is a fabricated quote, which is worse than no quote at all. */
  extractAs({ excerpt: 'The firm handles a great deal of document chasing.' })
  stubFetch((url) =>
    url.includes('greenhouse') ? json({ jobs: [GREENHOUSE_JOB] }) : notFound(),
  )

  const result = await getJobPostings('acmelaw.com')
  assert.equal(result.facts.postings[0].excerpt, 'Paralegal')
})

test('excerpt is capped at 200 chars', async () => {
  const long = 'x'.repeat(600)
  stubFetch((url) =>
    url.includes('greenhouse')
      ? json({ jobs: [{ ...GREENHOUSE_JOB, content: `<p>${long}</p>` }] })
      : notFound(),
  )
  extractAs({ excerpt: long })

  const result = await getJobPostings('acmelaw.com')
  assert.equal(result.facts.postings[0].excerpt.length, 200)
})

test('extraction failing loses the verbs, not the posting', async () => {
  globalThis.__extract = async () => {
    throw new Error('rate limited')
  }
  stubFetch((url) =>
    url.includes('greenhouse') ? json({ jobs: [GREENHOUSE_JOB] }) : notFound(),
  )

  const result = await getJobPostings('acmelaw.com')

  assert.equal(result.facts.postings.length, 1)
  assert.equal(result.facts.postings[0].title, 'Paralegal')
  assert.deepEqual(result.facts.postings[0].taskVerbs, [])
  /* Postings but no duty signal is PARTIAL — honest, and it cannot support a
     quoted observation. */
  assert.equal(result.status, 'PARTIAL')
})

test('extraction is capped so one huge board cannot run away', async () => {
  const jobs = Array.from({ length: 40 }, (_, i) => ({
    ...GREENHOUSE_JOB,
    title: `Paralegal ${i}`,
    absolute_url: `https://boards.greenhouse.io/acmelaw/jobs/${i}`,
    first_published: new Date(Date.now() - i * 86_400_000).toISOString(),
  }))
  stubFetch((url) => (url.includes('greenhouse') ? json({ jobs }) : notFound()))

  const result = await getJobPostings('acmelaw.com')

  assert.equal(result.facts.postings.length, 12)
  assert.match(result.notes, /40 postings found, newest 12 extracted/)
  /* Newest first, so the cap keeps the most quotable ones. */
  assert.equal(result.facts.postings[0].title, 'Paralegal 0')
})

// ── the non-negotiable ───────────────────────────────────────────────────────

test('LinkedIn is never called from any path', async () => {
  for (const behaviour of [
    () => notFound(),
    (url) =>
      url.includes('greenhouse')
        ? json({ jobs: [GREENHOUSE_JOB] })
        : notFound(),
    (url) =>
      url.includes('/careers')
        ? {
            ok: true,
            status: 200,
            text: async () =>
              `<html>${'hiring paralegals to chase documents '.repeat(20)}</html>`,
          }
        : notFound(),
  ]) {
    clearArtifactCache()
    stubFetch(behaviour)
    await getJobPostings('acmelaw.com')
    assert.ok(
      !calls.some((u) => u.toLowerCase().includes('linkedin')),
      'LinkedIn must never be called',
    )
  }
})

test('the result carries the coverage fields the aggregator reads', async () => {
  stubFetch(() => notFound())
  const result = await getJobPostings('acmelaw.com', 'GCC')

  assert.equal(result.scout, 'S2')
  assert.equal(typeof result.durationMs, 'number')
  assert.equal(result.costUsd, 0)
  assert.ok(Array.isArray(result.sourcesAttempted))
  for (const attempt of result.sourcesAttempted) {
    assert.ok(['hit', 'miss', 'blocked', 'error'].includes(attempt.outcome))
    assert.equal(typeof attempt.ms, 'number')
  }
})

test('the careers sweep is bounded so one slow site cannot stall the run', async () => {
  /* In the first live run an unbounded sequential sweep took 153 seconds on a
     single company. The orchestrator caps a whole run at ~30s, so the fallback
     tier gets a fraction of that and records the paths it never reached. */
  stubFetch(async (url) => {
    if (
      url.includes('/careers') ||
      url.includes('/jobs') ||
      url.includes('/join-us') ||
      url.includes('/vacancies')
    ) {
      await new Promise((resolve) => setTimeout(resolve, 30))
      return { ok: false, status: 404, text: async () => '' }
    }
    return notFound()
  })

  const startedAt = Date.now()
  const result = await getJobPostings('slowfirm.com')
  const elapsed = Date.now() - startedAt

  assert.equal(result.status, 'NONE')
  assert.ok(elapsed < 20_000, `sweep took ${elapsed}ms`)
  assert.ok(result.sourcesAttempted.some((a) => a.source.startsWith('careers')))
})
