// Orchestration tests (LYR-187 R5 / LYR-198).
//
// The scouts themselves are stubbed at bundle time — their behaviour is
// covered by their own tests, and what matters here is the wiring: S1 gates
// the rest, one scout failing never takes the others down, results are
// readable while other scouts are still running, and the run is time-capped.
//
// Nothing here touches the network, an ATS, OpenAI, or Supabase.
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
let aggregate
let tmpDir

before(async () => {
  const cacheRoot = path.resolve(here, '../../../../..', 'node_modules/.cache')
  fs.mkdirSync(cacheRoot, { recursive: true })
  tmpDir = fs.mkdtempSync(path.join(cacheRoot, 'orchestrator-test-'))

  /* The scouts are driven by globals the tests set, so each case can shape a
     coverage profile exactly — including ones that are hard to find in the
     wild, like "S2 throws". */
  fs.writeFileSync(
    path.join(tmpDir, 's1-stub.mjs'),
    `export const runS1 = (domain) => globalThis.__s1(domain)`,
  )
  fs.writeFileSync(
    path.join(tmpDir, 's2-stub.mjs'),
    `export const getJobPostings = (domain, region) => globalThis.__s2(domain, region)`,
  )

  const entry = path.join(tmpDir, 'entry.ts')
  fs.writeFileSync(
    entry,
    `export { runResearch, RUN_BUDGET_MS } from ${JSON.stringify(path.join(here, '../orchestrator.ts'))}\n` +
      `export { createFactStore } from ${JSON.stringify(path.join(here, '../factStore.ts'))}\n` +
      `export { aggregate } from ${JSON.stringify(path.join(here, '../aggregate.ts'))}\n`,
  )

  const outfile = path.join(tmpDir, 'bundle.mjs')
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    packages: 'external',
    /* A resolve plugin rather than `alias` — esbuild's alias only rewrites bare
       package specifiers, and these are relative imports inside the module
       under test. The `$` anchors matter: without them the s1 filter would
       also swallow './scouts/s1Derive', which the orchestrator needs for real. */
    plugins: [
      {
        name: 'stub-scouts',
        setup(build) {
          build.onResolve({ filter: /scouts\/s1$/ }, () => ({
            path: path.join(tmpDir, 's1-stub.mjs'),
          }))
          build.onResolve({ filter: /scouts\/s2$/ }, () => ({
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
  ;({ runResearch, createFactStore, aggregate } = await import(
    pathToFileURL(outfile).href
  ))
})

after(() => {
  delete globalThis.__s1
  delete globalThis.__s2
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
})

const scoutResult = (scout, status, facts = null, notes) => ({
  scout,
  status,
  facts,
  sourcesAttempted: [],
  durationMs: 1,
  costUsd: 0,
  ...(notes ? { notes } : {}),
})

const s1Facts = (region = 'GCC', vertical = 'legal') => ({
  country: { value: 'AE', provenance: {} },
  region: { value: region, provenance: {} },
  vertical: { value: vertical, provenance: {} },
  sizeBand: { value: '11-50', provenance: {} },
})

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

beforeEach(() => {
  globalThis.__s1 = async () => scoutResult('S1', 'FULL', s1Facts())
  globalThis.__s2 = async () =>
    scoutResult('S2', 'FULL', { topTaskVerbs: [], repeatPostings: [] })
})

// ── S1 gates everything ─────────────────────────────────────────────────────

test('S1 completes before S2 is dispatched', async () => {
  const order = []
  globalThis.__s1 = async () => {
    order.push('s1:start')
    await delay(20)
    order.push('s1:end')
    return scoutResult('S1', 'FULL', s1Facts())
  }
  globalThis.__s2 = async () => {
    order.push('s2:start')
    return scoutResult('S2', 'FULL')
  }

  await runResearch('acmelaw.com')

  assert.deepEqual(order, ['s1:start', 's1:end', 's2:start'])
})

test('S2 receives the region S1 resolved', async () => {
  let seen
  globalThis.__s1 = async () =>
    scoutResult('S1', 'FULL', s1Facts('UK', 'accounting'))
  globalThis.__s2 = async (domain, region) => {
    seen = { domain, region }
    return scoutResult('S2', 'FULL')
  }

  await runResearch('acmelaw.co.uk')

  assert.deepEqual(seen, { domain: 'acmelaw.co.uk', region: 'UK' })
})

test('an S1 that determined no region still dispatches, defaulting to OTHER', async () => {
  /* The card's documented fallback: downstream uses default routing and marks
     confidence low. Not dispatching at all would lose S2 entirely for every
     company whose country we could not read — which is most of them. */
  let seen
  globalThis.__s1 = async () =>
    scoutResult('S1', 'PARTIAL', {
      country: null,
      region: null,
      vertical: null,
      sizeBand: null,
    })
  globalThis.__s2 = async (domain, region) => {
    seen = region
    return scoutResult('S2', 'NONE')
  }

  const run = await runResearch('mystery.io')

  assert.equal(seen, 'OTHER')
  assert.equal(run.summary.coverage.S2, 'NONE')
})

// ── isolation ───────────────────────────────────────────────────────────────

test('S2 throwing does not take down the run', async () => {
  globalThis.__s2 = async () => {
    throw new Error('ATS exploded')
  }

  const run = await runResearch('acmelaw.com')

  assert.equal(run.summary.coverage.S1, 'FULL')
  assert.equal(run.summary.coverage.S2, 'ERROR')
  const s2 = await run.store.get('S2')
  assert.match(s2.notes, /threw: ATS exploded/)
})

test('S1 throwing still lets the rest run', async () => {
  globalThis.__s1 = async () => {
    throw new Error('enrichment down')
  }

  const run = await runResearch('acmelaw.com')

  assert.equal(run.summary.coverage.S1, 'ERROR')
  assert.equal(run.summary.coverage.S2, 'FULL')
  assert.equal(run.summary.confidenceTier, 'MODERATE')
})

test('runResearch never rejects, whatever the scouts do', async () => {
  for (const misbehaviour of [
    () => {
      throw new Error('sync throw')
    },
    async () => {
      throw new Error('async throw')
    },
    async () => null,
    async () => ({ nonsense: true }),
  ]) {
    globalThis.__s2 = misbehaviour
    const run = await runResearch('acmelaw.com')
    assert.ok(run.summary.confidenceTier)
  }
})

// ── streaming ───────────────────────────────────────────────────────────────

test('S1 is readable from the store while S2 is still running', async () => {
  /* The whole reason results are not batched: the panel renders off S1 at
     ~500ms while S2 is still crawling. */
  const store = createFactStore()
  let s2Released
  globalThis.__s2 = async () => {
    await new Promise((resolve) => {
      s2Released = resolve
    })
    return scoutResult('S2', 'FULL')
  }

  const pending = runResearch('acmelaw.com', { store })

  /* Give S1 time to land while S2 stays blocked. */
  await delay(40)
  const midRun = await store.get('S1')
  assert.equal(midRun.status, 'FULL', 'S1 must be readable mid-run')
  assert.equal(await store.get('S2'), null, 'S2 must still be pending')

  const midCoverage = aggregate(await store.all())
  assert.deepEqual(midCoverage.coverage, { S1: 'FULL' })

  s2Released()
  const run = await pending
  assert.deepEqual(run.summary.coverage, { S1: 'FULL', S2: 'FULL' })
})

// ── the wall-clock cap ──────────────────────────────────────────────────────

test('a scout that never resolves becomes ERROR with a reason, not a hang', async () => {
  globalThis.__s2 = () => new Promise(() => {})

  const startedAt = Date.now()
  const run = await runResearch('acmelaw.com', { budgetMs: 300 })
  const elapsed = Date.now() - startedAt

  assert.ok(elapsed < 3_000, `run took ${elapsed}ms — the cap did not fire`)
  assert.equal(run.summary.coverage.S2, 'ERROR')
  const s2 = await run.store.get('S2')
  assert.match(s2.notes, /did not finish within/)
})

test('a slow S1 eats its own budget rather than extending the total', async () => {
  globalThis.__s1 = () => new Promise(() => {})
  globalThis.__s2 = () => new Promise(() => {})

  const startedAt = Date.now()
  const run = await runResearch('acmelaw.com', { budgetMs: 300 })
  const elapsed = Date.now() - startedAt

  assert.ok(elapsed < 3_000, `run took ${elapsed}ms`)
  assert.equal(run.summary.confidenceTier, 'THIN')
})

// ── integration: three coverage profiles ────────────────────────────────────

test('integration: RICH, MODERATE and THIN runs end to end', async () => {
  /* The three profiles the downstream writer branches on. Each must be
     reachable through the real orchestrator, not just through aggregate(). */

  // RICH — S1 corroborates a FULL S2.
  globalThis.__s1 = async () => scoutResult('S1', 'FULL', s1Facts())
  globalThis.__s2 = async () =>
    scoutResult('S2', 'FULL', {
      topTaskVerbs: [{ value: 'chase' }, { value: 'reconcile' }],
      repeatPostings: [{ role: 'paralegal', count: 2, months: 5 }],
    })
  const rich = await runResearch('richfirm.com')
  assert.equal(rich.summary.confidenceTier, 'RICH')
  assert.deepEqual(rich.summary.manualWorkIndicators, ['chase', 'reconcile'])
  assert.equal(rich.summary.turnoverSignals[0].role, 'paralegal')

  // MODERATE — S1 found the company, S2 confirmed they are not hiring.
  globalThis.__s2 = async () =>
    scoutResult('S2', 'NONE', null, 'careers page found, no roles listed')
  const moderate = await runResearch('quietfirm.com')
  assert.equal(moderate.summary.confidenceTier, 'MODERATE')
  assert.equal(moderate.summary.gaps[0].status, 'NONE')

  // THIN — nothing anywhere. No external claim may be made.
  globalThis.__s1 = async () =>
    scoutResult('S1', 'ERROR', null, 'site unreachable')
  globalThis.__s2 = async () =>
    scoutResult('S2', 'ERROR', null, 'no slug matched')
  const thin = await runResearch('ghost.example')
  assert.equal(thin.summary.confidenceTier, 'THIN')
  assert.equal(thin.summary.coverageScore, 0)
  assert.equal(thin.summary.gaps.length, 2)

  assert.notEqual(rich.summary.confidenceTier, moderate.summary.confidenceTier)
  assert.notEqual(moderate.summary.confidenceTier, thin.summary.confidenceTier)
})

test('the run reports its own duration and carries the domain', async () => {
  const run = await runResearch('acmelaw.com')
  assert.equal(run.domain, 'acmelaw.com')
  assert.equal(typeof run.durationMs, 'number')
  assert.ok(run.durationMs >= 0)
})

test('a scout that throws synchronously is contained like any other', async () => {
  /* Regression: `run(ctx)` was passed to the deadline wrapper as a promise, so
     a scout throwing before its first await threw while the array was still
     being built — escaping Promise.allSettled and taking the whole run down.
     The wrapper takes a thunk now. */
  globalThis.__s2 = () => {
    throw new Error('sync throw')
  }

  const run = await runResearch('acmelaw.com')

  assert.equal(run.summary.coverage.S1, 'FULL')
  assert.equal(run.summary.coverage.S2, 'ERROR')
  assert.match((await run.store.get('S2')).notes, /threw: sync throw/)
})
