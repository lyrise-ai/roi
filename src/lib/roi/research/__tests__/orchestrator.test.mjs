// Orchestration tests (LYR-187 R5 / LYR-198).
//
// The scouts are aliased to stubs at bundle time, so these test the wiring and
// nothing else: that S1 gates S2, that results stream as they land rather than
// arriving in a batch at the end, and that no scout failure mode can take down
// the run. Those are the properties the scan panel is built on.
//
//   Run:  node --test src/lib/roi/research/__tests__/orchestrator.test.mjs
//
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { after, before, beforeEach, test } from 'node:test'

import * as esbuild from 'esbuild'

const here = path.dirname(fileURLToPath(import.meta.url))

let runResearch
let createFactStore
let tmpDir

before(async () => {
  const cacheRoot = path.resolve(here, '../../../../..', 'node_modules/.cache')
  fs.mkdirSync(cacheRoot, { recursive: true })
  tmpDir = fs.mkdtempSync(path.join(cacheRoot, 'orchestrator-test-'))

  /* Both scouts are driven by globals the tests set, and both record the order
     they were called in so the gating assertion is about observed behaviour
     rather than about timing luck. */
  fs.writeFileSync(
    path.join(tmpDir, 's1-stub.mjs'),
    `export const runS1 = (domain) => {
       globalThis.__calls.push('S1')
       return globalThis.__s1(domain)
     }`,
  )
  fs.writeFileSync(
    path.join(tmpDir, 's2-stub.mjs'),
    `export const getJobPostings = (domain, region) => {
       globalThis.__calls.push('S2')
       globalThis.__s2Region = region
       return globalThis.__s2(domain, region)
     }`,
  )

  const entry = path.join(tmpDir, 'entry.ts')
  fs.writeFileSync(
    entry,
    `export { runResearch, RUN_BUDGET_MS } from ${JSON.stringify(path.join(here, '../orchestrator.ts'))}\n` +
      `export { createFactStore } from ${JSON.stringify(path.join(here, '../factStore.ts'))}\n`,
  )

  const outfile = path.join(tmpDir, 'bundle.mjs')
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    packages: 'external',
    /* esbuild's `alias` only accepts package names, so the scouts are swapped
       with a resolver plugin instead. The `$` anchors matter: `./scouts/s1`
       must not also capture `./scouts/s1Derive`. */
    plugins: [
      {
        name: 'stub-scouts',
        setup(build) {
          build.onResolve({ filter: /\/scouts\/s1$/ }, () => ({
            path: path.join(tmpDir, 's1-stub.mjs'),
          }))
          build.onResolve({ filter: /\/scouts\/s2$/ }, () => ({
            path: path.join(tmpDir, 's2-stub.mjs'),
          }))
        },
      },
    ],
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'silent',
  })
  ;({ runResearch, createFactStore } = await import(
    pathToFileURL(outfile).href
  ))
})

after(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
})

const s1Result = (status = 'FULL', region = 'GCC') => ({
  scout: 'S1',
  status,
  facts: {
    country: { value: 'AE' },
    region: { value: region },
    vertical: { value: 'legal' },
    sizeBand: null,
  },
  sourcesAttempted: [],
  durationMs: 5,
  costUsd: 0,
})

const s2Result = (status = 'FULL') => ({
  scout: 'S2',
  status,
  facts: { postings: [{ title: 'Paralegal', taskVerbs: ['chase'] }] },
  sourcesAttempted: [],
  durationMs: 5,
  costUsd: 0,
})

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

beforeEach(() => {
  globalThis.__calls = []
  globalThis.__s2Region = undefined
  globalThis.__s1 = async () => s1Result()
  globalThis.__s2 = async () => s2Result()
})

// ── S1 gates everything ──────────────────────────────────────────────────────

test('S1 completes before S2 is dispatched', async () => {
  /* Not a timing coincidence: S2 must not be called until S1 has resolved,
     because S2 picks its sources by region. */
  let s1Done = false
  globalThis.__s1 = async () => {
    await sleep(30)
    s1Done = true
    return s1Result()
  }
  globalThis.__s2 = async () => {
    assert.equal(s1Done, true, 'S2 dispatched before S1 resolved')
    return s2Result()
  }

  await runResearch('acmelaw.com')

  assert.deepEqual(globalThis.__calls, ['S1', 'S2'])
})

test("S2 receives S1's region", async () => {
  globalThis.__s1 = async () => s1Result('FULL', 'GCC')
  await runResearch('acmelaw.com')
  assert.equal(globalThis.__s2Region, 'GCC')
})

test('S2 still runs when S1 could not determine a region', async () => {
  /* A failed S1 degrades routing to defaults; it does not cancel the run. */
  globalThis.__s1 = async () => ({
    ...s1Result('ERROR'),
    facts: { country: null, region: null, vertical: null, sizeBand: null },
  })

  const run = await runResearch('acmelaw.com')

  assert.deepEqual(globalThis.__calls, ['S1', 'S2'])
  assert.equal(globalThis.__s2Region, undefined)
  assert.equal(run.summary.coverage.S2, 'FULL')
})

// ── streaming ────────────────────────────────────────────────────────────────

test('results stream as they land, not in a batch at the end', async () => {
  /* The scan panel renders off S1 while S2 is still crawling. If the callback
     only fired at the end, the panel would be a spinner instead. */
  const seen = []
  globalThis.__s2 = async () => {
    await sleep(40)
    return s2Result()
  }

  const run = await runResearch('acmelaw.com', {
    onScoutResolved: (result) =>
      seen.push({ scout: result.scout, at: Date.now() }),
  })

  assert.deepEqual(
    seen.map((s) => s.scout),
    ['S1', 'S2'],
  )
  assert.ok(seen[1].at - seen[0].at >= 30, 'S1 must land well before S2')
  assert.equal(run.summary.confidenceTier, 'RICH')
})

test('the store is readable while a later scout is still running', async () => {
  /* The whole point of streaming: the panel queries the store for S1 at ~1s
     and renders, while S2 is still crawling. The store is injected so the
     assertion can happen mid-run rather than after it. */
  const store = createFactStore()

  let s1VisibleWhileS2Pending = null
  globalThis.__s2 = async () => {
    /* S2 is still working here — ask the store what it already knows. */
    s1VisibleWhileS2Pending = {
      s1: await store.get('S1'),
      s2: await store.get('S2'),
      coverage: await store.coverage(),
    }
    await sleep(20)
    return s2Result()
  }

  await runResearch('acmelaw.com', { store })

  assert.equal(s1VisibleWhileS2Pending.s1.status, 'FULL')
  assert.equal(
    s1VisibleWhileS2Pending.s2,
    null,
    'S2 must still be pending at that point',
  )
  assert.deepEqual(s1VisibleWhileS2Pending.coverage, { S1: 'FULL' })
  assert.equal((await store.get('S2')).status, 'FULL')
})

test('a throwing consumer callback does not fail the run', async () => {
  const run = await runResearch('acmelaw.com', {
    onScoutResolved: () => {
      throw new Error('panel blew up')
    },
  })
  assert.equal(run.summary.coverage.S1, 'FULL')
  assert.equal(run.summary.coverage.S2, 'FULL')
})

// ── isolation ────────────────────────────────────────────────────────────────

test('a scout that throws becomes ERROR, not an exception', async () => {
  globalThis.__s2 = async () => {
    throw new Error('greenhouse exploded')
  }

  const run = await runResearch('acmelaw.com')

  assert.equal(run.summary.coverage.S2, 'ERROR')
  assert.equal(run.summary.coverage.S1, 'FULL')
  assert.deepEqual(run.summary.gaps, [
    { scout: 'S2', reason: 'greenhouse exploded' },
  ])
})

test('S1 throwing does not stop S2 from running', async () => {
  globalThis.__s1 = async () => {
    throw new Error('pdl down')
  }

  const run = await runResearch('acmelaw.com')

  assert.equal(run.summary.coverage.S1, 'ERROR')
  assert.equal(run.summary.coverage.S2, 'FULL')
  assert.deepEqual(globalThis.__calls, ['S1', 'S2'])
})

test('a hung scout is capped and marked ERROR with a reason', async () => {
  /* The backstop: a scout that never resolves costs one row, not the run. */
  globalThis.__s2 = () => new Promise(() => {})

  const startedAt = Date.now()
  const run = await runResearch('acmelaw.com', { budgetMs: 1_200 })
  const elapsed = Date.now() - startedAt

  assert.equal(run.summary.coverage.S2, 'ERROR')
  assert.ok(elapsed < 5_000, `run took ${elapsed}ms`)
  assert.match(run.summary.gaps[0].reason, /budget/)
})

test('both scouts failing is THIN, and says why', async () => {
  globalThis.__s1 = async () => {
    throw new Error('site unreachable')
  }
  globalThis.__s2 = async () => {
    throw new Error('all boards 404')
  }

  const run = await runResearch('acmelaw.com')

  assert.equal(run.summary.confidenceTier, 'THIN')
  assert.equal(run.summary.coverageScore, 0)
  assert.equal(run.summary.gaps.length, 2)
})

// ── coverage profiles ────────────────────────────────────────────────────────

test('three companies with different coverage produce three different tiers', async () => {
  const profiles = [
    { s1: 'FULL', s2: 'FULL', expected: 'RICH' },
    { s1: 'FULL', s2: 'NONE', expected: 'MODERATE' },
    { s1: 'ERROR', s2: 'ERROR', expected: 'THIN' },
  ]

  for (const profile of profiles) {
    globalThis.__calls = []
    globalThis.__s1 = async () =>
      profile.s1 === 'ERROR'
        ? { ...s1Result('ERROR'), facts: { region: null } }
        : s1Result(profile.s1)
    globalThis.__s2 = async () =>
      profile.s2 === 'ERROR'
        ? { ...s2Result('ERROR'), facts: null }
        : { ...s2Result(profile.s2), facts: { postings: [] } }

    const run = await runResearch('acmelaw.com')
    assert.equal(
      run.summary.confidenceTier,
      profile.expected,
      `${profile.s1}/${profile.s2} should be ${profile.expected}`,
    )
  }
})

test('the run reports its own duration', async () => {
  const run = await runResearch('acmelaw.com')
  assert.equal(typeof run.durationMs, 'number')
  assert.equal(run.domain, 'acmelaw.com')
})

// ── per-scout budgets (LYR-210) ──────────────────────────────────────────────

test('a hung S1 cannot starve S2 of its budget', async () => {
  /* The bug this replaces: S1 was handed the whole run budget and S2 got
     whatever remained, floored at 1s. A hung S1 therefore meant S2 timed out
     before its first network call returned, and the company scored THIN
     because *both* scouts appeared to fail — when only one had. THIN is the
     tier that tells the observation generator to make no external claim at
     all, so we were staying silent about companies we could have spoken
     about, purely over our own scheduling.

     S2 here takes 2s, which the old remainder budget would never have
     allowed. */
  globalThis.__s1 = () => new Promise(() => {})
  globalThis.__s2 = async () => {
    await new Promise((resolve) => setTimeout(resolve, 2_000))
    return {
      scout: 'S2',
      status: 'FULL',
      facts: { postings: [{ title: 'Paralegal' }] },
      sourcesAttempted: [],
      durationMs: 2_000,
      costUsd: 0,
    }
  }

  const run = await runResearch('acmelaw.com')

  assert.equal(
    run.summary.coverage.S1,
    'ERROR',
    'S1 should blow its own budget',
  )
  assert.equal(run.summary.coverage.S2, 'FULL', 'S2 must still get to look')
  assert.notEqual(
    run.summary.confidenceTier,
    'THIN',
    'scheduling must not push a company to THIN',
  )
})

test('S1 is capped well below the whole run budget', async () => {
  /* S1 targets ~1s and its observed p90 is under 5s, so it has no business
     holding a run open for the full 30s. */
  globalThis.__s1 = () => new Promise(() => {})
  globalThis.__s2 = async () => ({
    scout: 'S2',
    status: 'NONE',
    facts: null,
    sourcesAttempted: [],
    durationMs: 1,
    costUsd: 0,
  })

  const startedAt = Date.now()
  await runResearch('acmelaw.com')
  const elapsed = Date.now() - startedAt

  assert.ok(elapsed < 15_000, `run took ${elapsed}ms — S1 was not capped`)
})

test('an explicitly small budget still bounds both scouts', async () => {
  /* Per-scout budgets must not silently override a caller asking for a fast
     run. */
  globalThis.__s1 = () => new Promise(() => {})
  globalThis.__s2 = () => new Promise(() => {})

  const startedAt = Date.now()
  const run = await runResearch('acmelaw.com', { budgetMs: 1_000 })
  const elapsed = Date.now() - startedAt

  assert.ok(elapsed < 6_000, `run took ${elapsed}ms despite a 1s budget`)
  assert.equal(run.summary.coverage.S1, 'ERROR')
  assert.equal(run.summary.coverage.S2, 'ERROR')
})
