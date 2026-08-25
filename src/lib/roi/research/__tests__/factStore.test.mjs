// Tests for the research fact store (LYR-187 R1 / LYR-194).
//
// The thing that matters most here: you can read the store while scouts are
// still writing to it. The side panel starts drawing S1's results after about
// half a second, while S2 is still working. A store that only answered once
// every scout had finished would break that entirely.
//
//   Run:  node --test src/lib/roi/research/__tests__/factStore.test.mjs
//
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { after, before, test } from 'node:test'

import * as esbuild from 'esbuild'

const here = path.dirname(fileURLToPath(import.meta.url))

let createFactStore
let tmpDir

before(async () => {
  /* See artifactCache.test.mjs: the bundle leaves its imports unresolved, so it
     has to sit where Node can still find node_modules from. */
  const cacheRoot = path.resolve(here, '../../../../..', 'node_modules/.cache')
  fs.mkdirSync(cacheRoot, { recursive: true })
  tmpDir = fs.mkdtempSync(path.join(cacheRoot, 'fact-store-test-'))
  const outfile = path.join(tmpDir, 'factStore.mjs')
  await esbuild.build({
    entryPoints: [path.join(here, '../factStore.ts')],
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'silent',
  })
  ;({ createFactStore } = await import(pathToFileURL(outfile).href))
})

after(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
})

function result(scout, status, facts = {}) {
  return {
    scout,
    status,
    facts,
    sourcesAttempted: [{ source: 'test', outcome: 'hit', ms: 1 }],
    durationMs: 1,
    costUsd: 0,
  }
}

test('get returns null for a scout that has not reported', async () => {
  const store = createFactStore()
  assert.equal(await store.get('S2'), null)
})

test('put then get round-trips the result', async () => {
  const store = createFactStore()
  const s1 = result('S1', 'FULL', { country: 'AE' })

  await store.put('S1', s1)

  assert.deepEqual(await store.get('S1'), s1)
})

test('facts are readable while other scouts are still running', async () => {
  const store = createFactStore()

  /* S1 finishes fast and everything else waits on it; S2 is slow on purpose.
     The panel has to be able to read S1 before S2 finishes — that is the whole
     point of writing results in as they land instead of all at the end. */
  const slowS2 = (async () => {
    await new Promise((resolve) => setTimeout(resolve, 30))
    await store.put('S2', result('S2', 'FULL', { postings: [1, 2, 3] }))
  })()

  await store.put('S1', result('S1', 'FULL', { country: 'AE' }))

  const midRun = await store.get('S1')
  assert.equal(midRun.facts.country, 'AE')
  assert.equal(await store.get('S2'), null, 'S2 should still be pending')
  assert.deepEqual(await store.coverage(), { S1: 'FULL' })

  await slowS2
  assert.deepEqual(await store.coverage(), { S1: 'FULL', S2: 'FULL' })
})

test('all() returns only the scouts that have reported', async () => {
  const store = createFactStore()
  await store.put('S1', result('S1', 'PARTIAL'))
  await store.put('S2', result('S2', 'NONE'))

  const all = await store.all()

  assert.deepEqual(Object.keys(all).sort(), ['S1', 'S2'])
  assert.equal(all.S1.status, 'PARTIAL')
  assert.equal(all.S2.status, 'NONE')
})

test('coverage reports NONE and ERROR distinctly', async () => {
  const store = createFactStore()

  /* "Not hiring", which the report may say out loud, against "we could not
     reach the job board", which the report must stay quiet about. Treating
     these as the same thing is how the old system talked itself into inventing
     job postings. */
  await store.put('S2', result('S2', 'NONE'))
  await store.put('S3', result('S3', 'ERROR'))

  const coverage = await store.coverage()

  assert.equal(coverage.S2, 'NONE')
  assert.equal(coverage.S3, 'ERROR')
  assert.notEqual(coverage.S2, coverage.S3)
})

test('a pending scout is absent from coverage, not reported as NONE', async () => {
  const store = createFactStore()
  await store.put('S1', result('S1', 'FULL'))

  const coverage = await store.coverage()

  assert.equal('S2' in coverage, false, 'pending must differ from NONE')
})

test('put overwrites an earlier result for the same scout', async () => {
  const store = createFactStore()
  await store.put('S2', result('S2', 'ERROR'))
  await store.put('S2', result('S2', 'FULL', { postings: [1] }))

  assert.equal((await store.get('S2')).status, 'FULL')
})

test('two stores do not share state', async () => {
  const a = createFactStore()
  const b = createFactStore()

  await a.put('S1', result('S1', 'FULL'))

  assert.equal(await b.get('S1'), null)
})
