// Worked-example regression test for the Profit Map POC mini calculator
// (LYR-186 / POC 8). Locks in the six output figures and their formula
// strings for one hand-checked input so a constant tweak doesn't silently
// drift the numbers shown to a prospect.
//
// No test-runner dependency: uses Node's built-in `node:test` + `node:assert`.
// miniCalculator.ts has no path aliases, so it's bundled with esbuild the
// same way src/lib/roi/pipeline/__tests__/roiCalculator.test.mjs does.
//
//   Run:  node --test src/lib/roi/v2/__tests__/miniCalculator.test.mjs
//
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { after, before, test } from 'node:test'

import * as esbuild from 'esbuild'

const here = path.dirname(fileURLToPath(import.meta.url))

let calculateMiniProfitMap
let tmpDir

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-calc-test-'))
  const outfile = path.join(tmpDir, 'miniCalculator.mjs')
  await esbuild.build({
    entryPoints: [path.join(here, '../miniCalculator.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'silent',
  })
  ;({ calculateMiniProfitMap } = await import(pathToFileURL(outfile).href))
})

after(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('worked example: 12 people, 10 hrs/wk, $60k/yr, 40% automatable', () => {
  const out = calculateMiniProfitMap({
    people: 12,
    hoursPerWeek: 10,
    annualPay: 60_000,
    automatablePct: 0.4,
    team: 'Finance',
  })

  // annualHours = 12 × 10 × 50 (WORKING_WEEKS)
  assert.equal(out.annualHours, 6_000)

  // hoursReturned = 6,000 × 0.4 × 0.7 (ADOPTION) × 0.8 (REALIZATION)
  assert.equal(out.hoursReturned, 1_344)

  // ratePerHour = (60,000 / (50 × 40)) × 1.3 (OVERHEAD_MULTIPLIER)
  assert.equal(out.ratePerHour, 39)

  // operationalDividend = 1,344 × 39
  assert.equal(out.operationalDividend, 52_416)

  // profitUplift = 52,416 × 1.3 (PROFIT_MULTIPLIER)
  assert.equal(out.profitUplift, 68_141)

  // totalFinancialGain = operationalDividend + profitUplift
  assert.equal(out.totalFinancialGain, 120_557)

  // annualHours and hoursReturned must never collapse into one field
  assert.notEqual(out.annualHours, out.hoursReturned)

  // UI reads its arithmetic from the returned formula strings, never
  // hand-writes it
  assert.equal(
    out.formulas.annualHours,
    '12 × 10 × 50 = 6,000 hours/year spent today for Finance',
  )
  assert.match(out.formulas.hoursReturned, /^6,000 × 40% × 0\.7 × 0\.8 = /)
  assert.match(out.formulas.ratePerHour, /\$39\.00\/hour$/)
  assert.match(out.formulas.totalFinancialGain, /^\$52,416 \+ \$68,141 = /)
})

// The formula strings are what a prospect checks on their phone. Every one of
// them has to add up on its own terms, for any input — not just the worked
// example above. Parse the arithmetic back out and re-do it.
// First number in the fragment — the right-hand side carries a unit suffix
// ("6,000 hours/year spent today for Finance").
const value = (s) => Number(s.replace(/[$,%]/g, '').match(/-?\d+(\.\d+)?/)[0])

const selfAdds = (formula) => {
  const [left, right] = formula.split(' = ')
  const sep = left.includes(' + ') ? ' + ' : ' × '
  const operands = left
    .replace(/^\(|\)$/g, '')
    .split(sep)
    .map(value)
  const expected =
    sep === ' + '
      ? operands.reduce((a, b) => a + b, 0)
      : operands.reduce((a, b) => a * b, 1)
  // Half-unit tolerance: operands are shown rounded, so the printed result is
  // the rounded product/sum of exactly those rounded operands.
  return Math.abs(expected - value(right)) <= 0.5
}

test('every formula string adds up as written', () => {
  for (const people of [1, 3, 5, 12, 40]) {
    for (const hoursPerWeek of [2, 7, 10]) {
      for (const annualPay of [48_000, 55_000, 60_000, 91_000]) {
        for (const automatablePct of [0.2, 0.35, 0.4, 0.65]) {
          const out = calculateMiniProfitMap({
            people,
            hoursPerWeek,
            annualPay,
            automatablePct,
          })
          const where = `${people}/${hoursPerWeek}/${annualPay}/${automatablePct}`
          for (const key of [
            'annualHours',
            'operationalDividend',
            'profitUplift',
            'totalFinancialGain',
          ]) {
            assert.ok(
              selfAdds(out.formulas[key]),
              `${key} does not add up at ${where}: ${out.formulas[key]}`,
            )
          }
        }
      }
    }
  }
})

test('missing or junk answers degrade to zero, never NaN', () => {
  const out = calculateMiniProfitMap({
    people: 5,
    hoursPerWeek: 8,
    annualPay: undefined, // not asked yet — the live-preview case
    automatablePct: 0.4,
  })
  assert.equal(out.ratePerHour, 0)
  assert.equal(out.totalFinancialGain, 0)
  assert.ok(out.hoursReturned > 0, 'hours are known before pay is')
  for (const formula of Object.values(out.formulas)) {
    assert.doesNotMatch(formula, /NaN|Infinity|undefined/, formula)
  }
})

test('automatablePct accepts percentage points and clamps to 0–1', () => {
  const asPoints = calculateMiniProfitMap({
    people: 5,
    hoursPerWeek: 2,
    annualPay: 48_000,
    automatablePct: 40,
  })
  const asFraction = calculateMiniProfitMap({
    people: 5,
    hoursPerWeek: 2,
    annualPay: 48_000,
    automatablePct: 0.4,
  })
  assert.deepEqual(asPoints, asFraction)

  const absurd = calculateMiniProfitMap({
    people: 5,
    hoursPerWeek: 2,
    annualPay: 48_000,
    automatablePct: 900,
  })
  assert.ok(
    absurd.hoursReturned <= absurd.annualHours,
    'can never return more hours than are spent',
  )
})

test('repeating fractions never leak raw floats into a formula', () => {
  const out = calculateMiniProfitMap({
    people: 5,
    hoursPerWeek: 2,
    annualPay: 48_000,
    automatablePct: 1 / 3,
  })
  assert.match(out.formulas.hoursReturned, /× 33% ×/)
})

test('automatablePct of 0 returns zero hours and zero dollars, not NaN', () => {
  const out = calculateMiniProfitMap({
    people: 5,
    hoursPerWeek: 8,
    annualPay: 50_000,
    automatablePct: 0,
  })
  assert.equal(out.hoursReturned, 0)
  assert.equal(out.operationalDividend, 0)
  assert.equal(out.profitUplift, 0)
  assert.equal(out.totalFinancialGain, 0)
  assert.ok(out.annualHours > 0, 'hours spent today is unaffected by adoption')
})
