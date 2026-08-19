// Unit tests for the confidence model (LYR-187 R5 / LYR-198).
//
// This is the honesty mechanism. The previous system had no notion of how much
// it knew, so it wrote with the same confidence whether it had three dated job
// postings or nothing at all. These tests pin down the two properties that
// make "we don't know enough to say something specific" enforceable rather
// than hoped for: NONE and ERROR score differently, and THIN is reachable.
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

const result = (scout, status, facts = {}, notes) => ({
  scout,
  status,
  facts,
  sourcesAttempted: [],
  durationMs: 1,
  costUsd: 0,
  ...(notes ? { notes } : {}),
})

// ── NONE and ERROR must never be collapsed ───────────────────────────────────

test('NONE scores higher than ERROR', () => {
  /* "They are not hiring" is information a writer may build on. "We could not
     reach the ATS" supports no sentence at all. Scoring them the same is how
     the old system lost the distinction and started inventing. */
  const none = a.coverageScore({ S1: 'FULL', S2: 'NONE' })
  const error = a.coverageScore({ S1: 'FULL', S2: 'ERROR' })

  assert.ok(none > error, `NONE ${none} must beat ERROR ${error}`)
})

test('NONE scores lower than FULL', () => {
  /* Knowing there is nothing is useful, but it gives a writer far less than
     three dated postings do. */
  assert.ok(a.coverageScore({ S2: 'NONE' }) < a.coverageScore({ S2: 'FULL' }))
})

test('an all-ERROR run scores zero', () => {
  assert.equal(a.coverageScore({ S1: 'ERROR', S2: 'ERROR' }), 0)
})

test('coverageScore weights S2 heaviest', () => {
  /* Job postings are testimony; everything else is inference. */
  const s2Only = a.coverageScore({ S1: 'ERROR', S2: 'FULL' })
  const s1Only = a.coverageScore({ S1: 'FULL', S2: 'ERROR' })

  assert.ok(s2Only > s1Only, `S2 ${s2Only} must outweigh S1 ${s1Only}`)
})

test('coverageScore is 0..1 and empty coverage is 0', () => {
  assert.equal(a.coverageScore({}), 0)
  assert.equal(a.coverageScore({ S1: 'FULL', S2: 'FULL' }), 1)
  const mid = a.coverageScore({ S1: 'PARTIAL', S2: 'PARTIAL' })
  assert.ok(mid > 0 && mid < 1)
})

// ── confidenceTier ───────────────────────────────────────────────────────────

test('RICH needs S2 FULL plus something else', () => {
  assert.equal(a.confidenceTier({ S1: 'FULL', S2: 'FULL' }), 'RICH')
  assert.equal(a.confidenceTier({ S1: 'PARTIAL', S2: 'FULL' }), 'RICH')
})

test('S2 FULL alone is not RICH', () => {
  /* Nothing corroborates it, and the observation joins across sources. */
  assert.equal(a.confidenceTier({ S1: 'ERROR', S2: 'FULL' }), 'MODERATE')
})

test('firmographics alone can never be RICH, however complete', () => {
  /* The load-bearing rule. "You are a 30-person law firm in Dubai" is not a
     sentence that makes anyone feel seen, so a perfect S1 must not unlock
     assertive, quoting output. RICH requires testimony. */
  assert.equal(a.confidenceTier({ S1: 'FULL' }), 'MODERATE')
  assert.equal(a.confidenceTier({ S1: 'FULL', S2: 'NONE' }), 'MODERATE')
})

test('THIN when nothing was found at all', () => {
  assert.equal(a.confidenceTier({}), 'THIN')
  assert.equal(a.confidenceTier({ S1: 'ERROR', S2: 'ERROR' }), 'THIN')
})

test('a company that is simply not hiring is MODERATE, not THIN', () => {
  /* They told us something real. The observation leans on the interview, but
     it is not forbidden from mentioning the team they already have. */
  assert.equal(a.confidenceTier({ S1: 'FULL', S2: 'NONE' }), 'MODERATE')
})

test('the three tiers are genuinely reachable', () => {
  const tiers = new Set([
    a.confidenceTier({ S1: 'FULL', S2: 'FULL' }),
    a.confidenceTier({ S1: 'FULL', S2: 'NONE' }),
    a.confidenceTier({ S1: 'ERROR', S2: 'ERROR' }),
  ])
  assert.deepEqual([...tiers].sort(), ['MODERATE', 'RICH', 'THIN'])
})

// ── manualWorkIndicators ─────────────────────────────────────────────────────

test('manualWorkIndicators keeps document work and drops professional judgement', () => {
  /* Calibrated against what 22 real professional-services firms actually
     advertise. The first version of this set was written a priori around
     back-office verbs (reconcile, re-key, chase invoices) and matched NOTHING
     across the whole ICP — these firms advertise document work.

     `draft` and `review` are in: the parent card's own worked example is
     "people whose first listed duty is document review". `negotiate` and
     `advise` are out: automating professional judgement is not what this
     product sells, and claiming it in front of a partner would be
     embarrassing. */
  const out = a.manualWorkIndicators([
    { title: 'Paralegal', taskVerbs: ['chase', 'draft', 'reconcile'] },
    { title: 'Associate', taskVerbs: ['negotiate', 'advise', 'review'] },
    { title: 'Bookkeeper', taskVerbs: ['collate', 'mentor'] },
  ])

  assert.deepEqual(out, ['chase', 'collate', 'draft', 'reconcile', 'review'])
})

test('irreducibly professional verbs are never counted as manual work', () => {
  const out = a.manualWorkIndicators([
    {
      title: 'Partner',
      taskVerbs: [
        'negotiate',
        'advise',
        'advocate',
        'represent',
        'mentor',
        'coach',
      ],
    },
  ])
  assert.deepEqual(out, [])
})

test('manualWorkIndicators dedupes, sorts, and survives junk', () => {
  assert.deepEqual(
    a.manualWorkIndicators([
      { taskVerbs: ['Chase', ' chase '] },
      { taskVerbs: ['chase'] },
    ]),
    ['chase'],
  )
  assert.deepEqual(a.manualWorkIndicators([]), [])
  assert.deepEqual(a.manualWorkIndicators(null), [])
  assert.deepEqual(a.manualWorkIndicators([{}, { taskVerbs: null }]), [])
})

// ── summarize ────────────────────────────────────────────────────────────────

test('summarize reports coverage, tier and the gaps behind them', () => {
  const summary = a.summarize({
    S1: result('S1', 'FULL'),
    S2: result('S2', 'FULL', {
      postings: [{ title: 'Paralegal', taskVerbs: ['chase', 'lead'] }],
    }),
  })

  assert.deepEqual(summary.coverage, { S1: 'FULL', S2: 'FULL' })
  assert.equal(summary.confidenceTier, 'RICH')
  assert.equal(summary.coverageScore, 1)
  assert.deepEqual(summary.manualWorkIndicators, ['chase'])
  assert.deepEqual(summary.gaps, [])
})

test('summarize explains a thin run rather than leaving it silent', () => {
  /* "We found little" and "we could not look" must be distinguishable after
     the fact, or a coverage report reads as if the world were empty. */
  const summary = a.summarize({
    S1: result('S1', 'ERROR', null, 'site unreachable'),
    S2: result('S2', 'ERROR', null, 'all boards 404'),
  })

  assert.equal(summary.confidenceTier, 'THIN')
  assert.deepEqual(summary.gaps, [
    { scout: 'S1', reason: 'site unreachable' },
    { scout: 'S2', reason: 'all boards 404' },
  ])
})

test('summarize handles a scout that never reported', () => {
  const summary = a.summarize({ S1: result('S1', 'FULL') })
  assert.deepEqual(summary.coverage, { S1: 'FULL' })
  assert.equal('S2' in summary.coverage, false)
})
