// Unit tests for the derived facts and the confidence model
// (LYR-187 R5 / LYR-198).
//
// confidenceTier is the honesty mechanism of the whole research system: it
// decides whether a downstream writer may be specific, must hedge, or must say
// nothing external at all. It is pure arithmetic over scout statuses precisely
// so it can be pinned here rather than hoped for at runtime.
//
//   Run:  node --test src/lib/roi/research/__tests__/aggregate.test.mjs
//
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { after, before, test } from 'node:test'

import * as esbuild from 'esbuild'

const here = path.dirname(fileURLToPath(import.meta.url))

let a
let tmpDir

before(async () => {
  const cacheRoot = path.resolve(here, '../../../../..', 'node_modules/.cache')
  fs.mkdirSync(cacheRoot, { recursive: true })
  tmpDir = fs.mkdtempSync(path.join(cacheRoot, 'aggregate-test-'))
  const outfile = path.join(tmpDir, 'aggregate.mjs')
  await esbuild.build({
    entryPoints: [path.join(here, '../aggregate.ts')],
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'silent',
  })
  a = await import(pathToFileURL(outfile).href)
})

after(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
})

const result = (scout, status, facts = null, notes) => ({
  scout,
  status,
  facts,
  sourcesAttempted: [],
  durationMs: 1,
  costUsd: 0,
  ...(notes ? { notes } : {}),
})

// ── NONE vs ERROR must score differently ────────────────────────────────────

test('NONE scores higher than ERROR, and ERROR scores zero', () => {
  /* NONE is a finding — they are not hiring, and a writer may say so. ERROR is
     a blind spot. Scoring them alike is what let the old system treat "we
     couldn't reach the ATS" as licence to describe a hiring pattern. */
  assert.ok(a.STATUS_SCORES.NONE > a.STATUS_SCORES.ERROR)
  assert.equal(a.STATUS_SCORES.ERROR, 0)
  assert.ok(a.STATUS_SCORES.FULL > a.STATUS_SCORES.PARTIAL)
  assert.ok(a.STATUS_SCORES.PARTIAL > a.STATUS_SCORES.NONE)

  assert.notEqual(
    a.coverageScore({ S1: 'FULL', S2: 'NONE' }),
    a.coverageScore({ S1: 'FULL', S2: 'ERROR' }),
  )
})

test('S2 is weighted heaviest', () => {
  /* A job posting is the company describing its own work in its own words;
     everything else is inference about it. */
  assert.ok(a.SCOUT_WEIGHTS.S2 > a.SCOUT_WEIGHTS.S1)

  const s2Strong = a.coverageScore({ S1: 'NONE', S2: 'FULL' })
  const s1Strong = a.coverageScore({ S1: 'FULL', S2: 'NONE' })
  assert.ok(s2Strong > s1Strong, `${s2Strong} should beat ${s1Strong}`)
})

// ── coverageScore ───────────────────────────────────────────────────────────

test('coverageScore spans 0..1 at the extremes', () => {
  assert.equal(a.coverageScore({ S1: 'FULL', S2: 'FULL' }), 1)
  assert.equal(a.coverageScore({ S1: 'ERROR', S2: 'ERROR' }), 0)
  assert.equal(a.coverageScore({}), 0)
})

test('a scout that has not reported is excluded, not counted as zero', () => {
  /* Mid-run the panel reads this while S2 is still crawling. An incomplete run
     is incomplete, not bad. */
  assert.equal(a.coverageScore({ S1: 'FULL' }), 1)
  assert.ok(
    a.coverageScore({ S1: 'FULL' }) >
      a.coverageScore({ S1: 'FULL', S2: 'ERROR' }),
  )
})

test('unbuilt scouts carry no weight, so registering them changes nothing', () => {
  const withoutS3 = a.coverageScore({ S1: 'FULL', S2: 'FULL' })
  const withS3 = a.coverageScore({ S1: 'FULL', S2: 'FULL', S3: 'ERROR' })
  assert.equal(withS3, withoutS3)
})

// ── confidenceTier ──────────────────────────────────────────────────────────

test('RICH needs S2 FULL and corroboration from another scout', () => {
  assert.equal(a.confidenceTier({ S1: 'FULL', S2: 'FULL' }), 'RICH')
  assert.equal(a.confidenceTier({ S1: 'PARTIAL', S2: 'FULL' }), 'RICH')
})

test('S2 FULL alone is not RICH — nothing corroborates it', () => {
  assert.equal(a.confidenceTier({ S2: 'FULL' }), 'MODERATE')
  assert.equal(a.confidenceTier({ S1: 'ERROR', S2: 'FULL' }), 'MODERATE')
  assert.equal(a.confidenceTier({ S1: 'NONE', S2: 'FULL' }), 'MODERATE')
})

test('S2 thin or absent is MODERATE, however good the rest is', () => {
  assert.equal(a.confidenceTier({ S1: 'FULL', S2: 'PARTIAL' }), 'MODERATE')
  assert.equal(a.confidenceTier({ S1: 'FULL', S2: 'NONE' }), 'MODERATE')
  assert.equal(a.confidenceTier({ S1: 'FULL', S2: 'ERROR' }), 'MODERATE')
  assert.equal(a.confidenceTier({ S1: 'FULL' }), 'MODERATE')
})

test('THIN when nothing was found — the state the old system could not reach', () => {
  /* THIN means the reveal makes NO external claim and uses only what the user
     typed. It has to be reachable, or the system writes something plausible
     about a company it knows nothing about. */
  assert.equal(a.confidenceTier({}), 'THIN')
  assert.equal(a.confidenceTier({ S1: 'ERROR', S2: 'ERROR' }), 'THIN')
  assert.equal(a.confidenceTier({ S1: 'NONE', S2: 'NONE' }), 'THIN')
  assert.equal(a.confidenceTier({ S1: 'ERROR', S2: 'NONE' }), 'THIN')
})

test('a run where every scout errored is THIN however many ran', () => {
  assert.equal(
    a.confidenceTier({ S1: 'ERROR', S2: 'ERROR', S3: 'ERROR', S4: 'ERROR' }),
    'THIN',
  )
})

// ── manualWorkIndicators ────────────────────────────────────────────────────

test('manualWorkIndicators keeps only mechanical verbs', () => {
  assert.deepEqual(
    a.manualWorkIndicators([
      'chase',
      'negotiate',
      'reconcile',
      'advise',
      'collate',
    ]),
    ['chase', 'reconcile', 'collate'],
  )
})

test('manualWorkIndicators normalises and dedupes', () => {
  assert.deepEqual(a.manualWorkIndicators([' Chase ', 'CHASE']), ['chase'])
})

test('manualWorkIndicators survives junk and finds nothing in judgement work', () => {
  assert.deepEqual(a.manualWorkIndicators(['draft', 'advise', 'negotiate']), [])
  assert.deepEqual(a.manualWorkIndicators([]), [])
  assert.deepEqual(a.manualWorkIndicators(null), [])
  assert.deepEqual(a.manualWorkIndicators([null, 42, '']), [])
})

// ── turnoverSignals ─────────────────────────────────────────────────────────

test('turnoverSignals keeps repeats and drops single postings', () => {
  const out = a.turnoverSignals([
    { role: 'paralegal', count: 3, months: 7 },
    { role: 'bookkeeper', count: 1, months: 0 },
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0].role, 'paralegal')
})

test('turnoverSignals survives junk', () => {
  assert.deepEqual(a.turnoverSignals(undefined), [])
  assert.deepEqual(a.turnoverSignals([{ role: '', count: 5 }]), [])
})

// ── aggregate() ─────────────────────────────────────────────────────────────

test('aggregate builds coverage, tier and derivations from scout results', () => {
  const out = a.aggregate({
    S1: result('S1', 'FULL'),
    S2: result('S2', 'FULL', {
      topTaskVerbs: [
        { value: 'chase' },
        { value: 'draft' },
        { value: 'reconcile' },
      ],
      repeatPostings: [{ role: 'paralegal', count: 2, months: 5 }],
    }),
  })

  assert.deepEqual(out.coverage, { S1: 'FULL', S2: 'FULL' })
  assert.equal(out.coverageScore, 1)
  assert.equal(out.confidenceTier, 'RICH')
  assert.deepEqual(out.manualWorkIndicators, ['chase', 'reconcile'])
  assert.equal(out.turnoverSignals[0].role, 'paralegal')
  assert.deepEqual(out.gaps, [])
})

test('aggregate records gaps so a thin result is explainable', () => {
  /* "We found little" and "we could not look" have to be distinguishable after
     the fact — that is what R8 measures and what the panel must not blur. */
  const out = a.aggregate({
    S1: result('S1', 'PARTIAL'),
    S2: result('S2', 'NONE', null, 'greenhouse board found with no open roles'),
  })

  assert.equal(out.confidenceTier, 'MODERATE')
  assert.equal(out.gaps.length, 1)
  assert.equal(out.gaps[0].scout, 'S2')
  assert.equal(out.gaps[0].status, 'NONE')
  assert.match(out.gaps[0].notes, /no open roles/)
})

test('aggregate is safe on an empty or malformed store', () => {
  const empty = a.aggregate({})
  assert.equal(empty.confidenceTier, 'THIN')
  assert.equal(empty.coverageScore, 0)

  const malformed = a.aggregate({
    S2: result('S2', 'FULL', { topTaskVerbs: 'nope' }),
  })
  assert.deepEqual(malformed.manualWorkIndicators, [])
  assert.deepEqual(malformed.turnoverSignals, [])
})
