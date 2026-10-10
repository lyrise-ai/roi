// miniCalculator.test.mjs — tests for the Calculator (LYR-186, LYR-204)
//
// Tests all mathematical rules and shapes produced by calculateMiniProfitMap,
// calculateReport, SETTINGS, and pickFeatured.
//
// Run: node --test src/lib/roi/v2/__tests__/miniCalculator.test.mjs

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { after, before, test } from 'node:test'

import * as esbuild from 'esbuild'

const here = path.dirname(fileURLToPath(import.meta.url))

let calculateMiniProfitMap
let calculateReport
let SETTINGS
let pickFeatured
let selectFeatured
let MINI_SETTINGS
let chain
let tmpDir

// The six lines format.chain() prints, by name.
const formulas = (input) => {
  const [
    annualHours,
    hoursReturned,
    ratePerHour,
    operationalDividend,
    profitUplift,
    totalFinancialGain,
  ] = chain(input, calculateMiniProfitMap(input), MINI_SETTINGS).split('\n')
  return {
    annualHours,
    hoursReturned,
    ratePerHour,
    operationalDividend,
    profitUplift,
    totalFinancialGain,
  }
}

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
  const mod = await import(pathToFileURL(outfile).href)
  calculateMiniProfitMap = mod.calculateMiniProfitMap
  calculateReport = mod.calculateReport
  SETTINGS = mod.SETTINGS
  MINI_SETTINGS = mod.MINI_SETTINGS
  pickFeatured = mod.pickFeatured
  selectFeatured = mod.selectFeatured

  const formatFile = path.join(tmpDir, 'format.mjs')
  await esbuild.build({
    entryPoints: [path.join(here, '../format.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: formatFile,
    logLevel: 'silent',
  })
  ;({ chain } = await import(pathToFileURL(formatFile).href))
})

after(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('SETTINGS exported with the exact required values', () => {
  assert.deepEqual(SETTINGS, {
    workingWeeks: 50,
    fteHoursPerWeek: 40,
    overhead: 1.3,
    adoption: 0.7,
    realization: 0.8,
    profitMultiplier: 1.3,
    currency: 'USD',
  })
})

test('worked example: 12 people, 10 hrs/wk, $60k/yr, 40% automatable', () => {
  const input = {
    people: 12,
    hoursPerWeek: 10,
    annualPay: 60_000,
    automatablePct: 0.4,
    team: 'Finance',
  }
  const out = calculateMiniProfitMap(input)

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

  // The lines format.chain() prints for these figures
  const lines = formulas(input)
  assert.equal(
    lines.annualHours,
    '12 × 10 × 50 = 6,000 hours/year spent today for Finance',
  )
  assert.match(lines.hoursReturned, /^6,000 × 40% × 0\.7 × 0\.8 = /)
  assert.match(lines.ratePerHour, /\$39\.00\/hour$/)
  assert.match(lines.totalFinancialGain, /^\$52,416 \+ \$68,141 = /)
})

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
  return Math.abs(expected - value(right)) <= 0.5
}

test('every formula string adds up as written', () => {
  for (const people of [1, 3, 5, 12, 40]) {
    for (const hoursPerWeek of [2, 7, 10]) {
      for (const annualPay of [48_000, 55_000, 60_000, 91_000]) {
        for (const automatablePct of [0.2, 0.35, 0.4, 0.65]) {
          const lines = formulas({
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
              selfAdds(lines[key]),
              `${key} does not add up at ${where}: ${lines[key]}`,
            )
          }
        }
      }
    }
  }
})

test('chain refuses a missing pay instead of printing $NaN', () => {
  const input = {
    people: 5,
    hoursPerWeek: 8,
    annualPay: undefined,
    automatablePct: 0.4,
  }
  assert.throws(
    () => chain(input, calculateMiniProfitMap(input), MINI_SETTINGS),
    { name: 'RangeError', message: /chain Expects a finite number/ },
  )
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
  const lines = formulas({
    people: 5,
    hoursPerWeek: 2,
    annualPay: 48_000,
    automatablePct: 1 / 3,
  })
  assert.match(lines.hoursReturned, /× 33% ×/)
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

function userField(value) {
  return { value, isEstimated: false, source: 'user' }
}

function missingField() {
  return { value: null, isEstimated: false, source: null }
}

function samplePains() {
  return [
    {
      people: userField(4),
      hoursPerWeek: userField(15),
      annualPay: userField(65_000),
      automatablePct: userField(65),
    },
    {
      people: userField(3),
      hoursPerWeek: userField(10),
      annualPay: userField(55_000),
      automatablePct: userField(70),
    },
    {
      people: userField(1),
      hoursPerWeek: userField(8),
      annualPay: userField(70_000),
      automatablePct: userField(85),
    },
  ]
}

test('calculateReport returns ReportNumbers with numbers only and matches sample figures', () => {
  const report = calculateReport({
    pains: samplePains(),
  })

  assert.equal(report.rows.length, 3)
  assert.deepEqual(report.order, [0, 1, 2])
  assert.deepEqual(report.skipped, [])

  // Verify no strings/text anywhere in ReportNumbers
  for (const row of report.rows) {
    for (const [k, v] of Object.entries(row)) {
      assert.equal(
        typeof v,
        'number',
        `expected row.${k} to be a number, got ${typeof v}`,
      )
    }
  }

  // Row 0
  assert.equal(report.rows[0].position, 0)
  assert.equal(report.rows[0].annualHours, 3000)
  assert.equal(report.rows[0].hoursReturned, 1092)
  assert.equal(report.rows[0].remaining, 1908)
  assert.equal(report.rows[0].remainPct, 64)
  assert.equal(report.rows[0].ratePerHour, 42.25)
  assert.equal(report.rows[0].operationalDividend, 46137)
  assert.equal(report.rows[0].profitUplift, 59978)
  assert.equal(report.rows[0].gain, 106115)

  // Row 1
  assert.equal(report.rows[1].position, 1)
  assert.equal(report.rows[1].annualHours, 1500)
  assert.equal(report.rows[1].hoursReturned, 588)
  assert.equal(report.rows[1].remaining, 912)
  assert.equal(report.rows[1].remainPct, 61)
  assert.equal(report.rows[1].ratePerHour, 35.75)
  assert.equal(report.rows[1].operationalDividend, 21021)
  assert.equal(report.rows[1].profitUplift, 27327)
  assert.equal(report.rows[1].gain, 48348)

  // Row 2
  assert.equal(report.rows[2].position, 2)
  assert.equal(report.rows[2].annualHours, 400)
  assert.equal(report.rows[2].hoursReturned, 190)
  assert.equal(report.rows[2].remaining, 210)
  assert.equal(report.rows[2].remainPct, 53)
  assert.equal(report.rows[2].ratePerHour, 45.5)
  assert.equal(report.rows[2].operationalDividend, 8645)
  assert.equal(report.rows[2].profitUplift, 11239)
  assert.equal(report.rows[2].gain, 19884)

  // Totals
  assert.equal(report.totalHours, 1870)
  assert.equal(report.totalOd, 75803)
  assert.equal(report.totalUplift, 98544)
  assert.equal(report.totalGain, 174347)
  assert.equal(report.odPct, 43)
  assert.equal(report.upliftPct, 57)

  // Three-year outlook
  assert.equal(report.outlook.length, 3)
  assert.deepEqual(report.outlook[0], {
    total: 174347,
    od: 75803,
    uplift: 98544,
    heightPct: 33,
    odPct: 43,
    upliftPct: 57,
  })
  assert.deepEqual(report.outlook[1], {
    total: 348694,
    od: 151606,
    uplift: 197088,
    heightPct: 67,
    odPct: 43,
    upliftPct: 57,
  })
  assert.deepEqual(report.outlook[2], {
    total: 523041,
    od: 227409,
    uplift: 295632,
    heightPct: 100,
    odPct: 43,
    upliftPct: 57,
  })

  // Cost of delay
  assert.equal(report.delayMonthly, 6317)
})

test('every total equals the sum of its rows', () => {
  const pains = [
    {
      people: userField(5),
      hoursPerWeek: userField(12),
      annualPay: userField(80_000),
      automatablePct: userField(50),
    },
    {
      people: userField(2),
      hoursPerWeek: userField(6),
      annualPay: userField(45_000),
      automatablePct: userField(30),
    },
    {
      people: userField(10),
      hoursPerWeek: userField(20),
      annualPay: userField(95_000),
      automatablePct: userField(75),
    },
  ]

  const report = calculateReport({ pains })

  const sumHours = report.rows.reduce((acc, r) => acc + r.hoursReturned, 0)
  const sumOd = report.rows.reduce((acc, r) => acc + r.operationalDividend, 0)
  const sumUplift = report.rows.reduce((acc, r) => acc + r.profitUplift, 0)
  const sumGain = report.rows.reduce((acc, r) => acc + r.gain, 0)

  assert.equal(report.totalHours, sumHours)
  assert.equal(report.totalOd, sumOd)
  assert.equal(report.totalUplift, sumUplift)
  assert.equal(report.totalGain, sumGain)
})

test('a pain with a missing answer has no row and is in skipped', () => {
  const pains = [
    {
      people: userField(4),
      hoursPerWeek: userField(15),
      annualPay: userField(65_000),
      automatablePct: userField(65),
    },
    {
      people: userField(3),
      hoursPerWeek: missingField(),
      annualPay: userField(55_000),
      automatablePct: missingField(),
    },
  ]

  const report = calculateReport({ pains })

  assert.equal(report.rows.length, 1)
  assert.equal(report.rows[0].position, 0)
  assert.deepEqual(report.skipped, [
    { pain: 1, question: 'hoursPerWeek' },
    { pain: 1, question: 'automatablePct' },
  ])
  assert.equal(report.totalHours, report.rows[0].hoursReturned)
})

test('a rejected pain is in no total and gets no row or skipped entry', () => {
  const pains = samplePains()
  const report = calculateReport({
    pains,
    rejected: [1], // reject pain 1
  })

  assert.equal(report.rows.length, 2)
  assert.deepEqual(
    report.rows.map((r) => r.position),
    [0, 2],
  )
  assert.deepEqual(report.skipped, [])
  assert.equal(
    report.totalHours,
    report.rows[0].hoursReturned + report.rows[1].hoursReturned,
  )
  assert.equal(
    report.totalGain,
    report.rows[0].gain + report.rows[1].gain,
  )
})

test('changing one answer changes that row, every total, the outlook and cost of delay, and nothing else', () => {
  const painsA = samplePains()
  const reportA = calculateReport({ pains: painsA })

  const painsB = samplePains()
  // Change people on row 0 from 4 to 6
  painsB[0].people = userField(6)
  const reportB = calculateReport({ pains: painsB })

  // Row 0 changed
  assert.notEqual(reportA.rows[0].annualHours, reportB.rows[0].annualHours)
  assert.notEqual(reportA.rows[0].gain, reportB.rows[0].gain)

  // Rows 1 and 2 are untouched
  const row1A = reportA.rows.find((r) => r.position === 1)
  const row1B = reportB.rows.find((r) => r.position === 1)
  assert.deepEqual(row1A, row1B)

  const row2A = reportA.rows.find((r) => r.position === 2)
  const row2B = reportB.rows.find((r) => r.position === 2)
  assert.deepEqual(row2A, row2B)

  // Totals, outlook, and delay updated
  assert.notEqual(reportA.totalHours, reportB.totalHours)
  assert.notEqual(reportA.totalGain, reportB.totalGain)
  assert.notEqual(reportA.delayMonthly, reportB.delayMonthly)
  assert.notEqual(reportA.outlook[0].total, reportB.outlook[0].total)
})

test('an override changes only its own row', () => {
  const pains = samplePains()
  const reportWithoutOverride = calculateReport({ pains })
  const reportWithOverride = calculateReport({
    pains,
    overrides: [{ row: 1, setting: 'adoption', value: 0.9 }],
  })

  const r0Without = reportWithoutOverride.rows.find((r) => r.position === 0)
  const r0With = reportWithOverride.rows.find((r) => r.position === 0)
  assert.deepEqual(r0Without, r0With)

  const r2Without = reportWithoutOverride.rows.find((r) => r.position === 2)
  const r2With = reportWithOverride.rows.find((r) => r.position === 2)
  assert.deepEqual(r2Without, r2With)

  const r1Without = reportWithoutOverride.rows.find((r) => r.position === 1)
  const r1With = reportWithOverride.rows.find((r) => r.position === 1)
  assert.notEqual(r1Without.hoursReturned, r1With.hoursReturned)
  assert.notEqual(r1Without.gain, r1With.gain)
})

test('odPct + upliftPct = 100, for the total and for each outlook year', () => {
  for (const pains of [
    samplePains(),
    [
      {
        people: userField(2),
        hoursPerWeek: userField(5),
        annualPay: userField(30_000),
        automatablePct: userField(25),
      },
    ],
    [
      {
        people: userField(15),
        hoursPerWeek: userField(35),
        annualPay: userField(120_000),
        automatablePct: userField(90),
      },
      {
        people: userField(1),
        hoursPerWeek: userField(2),
        annualPay: userField(50_000),
        automatablePct: userField(10),
      },
    ],
  ]) {
    const report = calculateReport({ pains })
    assert.equal(
      report.odPct + report.upliftPct,
      100,
      `total odPct ${report.odPct} + upliftPct ${report.upliftPct} != 100`,
    )
    for (const year of report.outlook) {
      assert.equal(
        year.odPct + year.upliftPct,
        100,
        `outlook year odPct ${year.odPct} + upliftPct ${year.upliftPct} != 100`,
      )
    }
  }
})

test('a NaN input gives NaN in that row and in every total, never 0, and nothing throws', () => {
  const pains = [
    {
      people: userField(4),
      hoursPerWeek: userField(15),
      annualPay: userField(65_000),
      automatablePct: userField(65),
    },
    {
      people: userField(NaN),
      hoursPerWeek: userField(10),
      annualPay: userField(55_000),
      automatablePct: userField(70),
    },
  ]

  let report
  assert.doesNotThrow(() => {
    report = calculateReport({ pains })
  })

  // The NaN row
  const nanRow = report.rows.find((r) => r.position === 1)
  assert.ok(nanRow, 'row with NaN input still exists')
  assert.ok(Number.isNaN(nanRow.annualHours), 'annualHours is NaN')
  assert.ok(Number.isNaN(nanRow.gain), 'gain is NaN')

  // Totals flow NaN through
  assert.ok(Number.isNaN(report.totalHours), 'totalHours is NaN')
  assert.ok(Number.isNaN(report.totalGain), 'totalGain is NaN')
  assert.ok(Number.isNaN(report.totalOd), 'totalOd is NaN')
  assert.ok(Number.isNaN(report.totalUplift), 'totalUplift is NaN')
  assert.ok(Number.isNaN(report.odPct), 'odPct is NaN')
  assert.ok(Number.isNaN(report.upliftPct), 'upliftPct is NaN')
  assert.ok(Number.isNaN(report.delayMonthly), 'delayMonthly is NaN')
  for (const year of report.outlook) {
    assert.ok(Number.isNaN(year.total), 'outlook total is NaN')
    assert.ok(Number.isNaN(year.heightPct), 'outlook heightPct is NaN')
    assert.ok(Number.isNaN(year.odPct), 'outlook odPct is NaN')
    assert.ok(Number.isNaN(year.upliftPct), 'outlook upliftPct is NaN')
  }

  // A row whose gain is NaN sorts last
  assert.equal(report.rows[report.rows.length - 1].position, 1)
  assert.deepEqual(report.order, [0, 1])
})

test('ranking: biggest gain first, tie on gain -> more hours returned, tie on hours -> position order', () => {
  const pains = [
    {
      people: userField(2),
      hoursPerWeek: userField(10),
      annualPay: userField(50_000),
      automatablePct: userField(50),
    }, // gain ~$16k
    {
      people: userField(10),
      hoursPerWeek: userField(20),
      annualPay: userField(80_000),
      automatablePct: userField(70),
    }, // biggest gain
    {
      people: userField(2),
      hoursPerWeek: userField(10),
      annualPay: userField(50_000),
      automatablePct: userField(50),
    }, // identical to pain 0
  ]

  const report = calculateReport({ pains })
  assert.deepEqual(report.order, [1, 0, 2])
})

test('pickFeatured on reveal screen uses this exact same ranking', () => {
  const exact = (s) => ({ mode: 'exact', exact: s })
  const pains = [
    {
      text: 'Pain 0',
      quant: [exact('10'), exact('2'), exact('10'), exact('50000'), exact('50')],
    },
    {
      text: 'Pain 1 - Big',
      quant: [exact('10'), exact('10'), exact('20'), exact('80000'), exact('30')],
    },
    {
      text: 'Pain 2 - Incomplete',
      quant: [exact('10'), exact('20'), exact('30'), { mode: 'estimate' }, { mode: 'estimate' }],
    },
  ]

  const featured = pickFeatured(pains)
  assert.equal(featured.index, 1)
  assert.equal(featured.pain.text, 'Pain 1 - Big')
  assert.equal(featured.figures.complete, true)

  // selectFeatured is an alias of pickFeatured
  const featuredAlias = selectFeatured(pains)
  assert.deepEqual(featured, featuredAlias)
})
