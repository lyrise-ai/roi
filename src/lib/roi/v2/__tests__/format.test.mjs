// formatting numbers to text is done only in format.ts
// run: node --test src/lib/roi/v2/__tests__/format.test.mjs

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { after, before, test } from 'node:test'

import * as esbuild from 'esbuild'

const here = path.dirname(fileURLToPath(import.meta.url))

let format
let calculateMiniProfitMap
let tmpDir

const compile = async (file) => {
  const outfile = path.join(tmpDir, file.replace('.ts', '.mjs'))
  await esbuild.build({
    entryPoints: [path.join(here, '..', file)],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'silent',
  })
  return import(pathToFileURL(outfile).href)
}

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'format-test-'))
  format = await compile('format.ts')
  ;({ calculateMiniProfitMap } = await compile('miniCalculator.ts'))
})

after(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
})

// [function, arguments, expected text]
const VALUES = [
  ['hoursSpent', [3000], '3,000'],
  ['hoursReturned', [3000], '3,000'],
  ['count', [1908], '1,908'],
  ['percent', [65], '65%'],
  ['money', [46137, 'USD'], '$46,137'],
  ['money', [46137, 'GBP'], '£46,137'],
  ['rate', [42.25, 'USD'], '$42.25'],
  ['rate', [42.5, 'USD'], '$42.50'],
  ['rate', [0.29, 'USD'], '$0.29'],
  ['about', [7437], '7,400'],
  ['about', [437], '440'],
  ['about', [12340], '12,500'],
  ['about', [7], '7'],
  ['spelled', [4], 'four'],
  ['spelled', [20], 'twenty'],
  ['spelled', [21], '21'],
  ['spelled', [1500], '1,500'],
  ['hoursLine', [4, 15, 50, 3000], '4 people × 15 hrs × 50 weeks = 3,000 hrs'],
  ['hoursLine', [1, 8, 50, 400], '1 person × 8 hrs × 50 weeks = 400 hrs'],
  [
    'hoursLine',
    [2.5, 7.5, 50, 938],
    '2.5 people × 7.5 hrs × 50 weeks = 938 hrs',
  ],
  ['settingValue', ['automatable', 0.29], '29%'],
  ['settingValue', ['adoption', 0.7], '70%'],
  ['settingValue', ['workingWeeks', 50], '50 weeks'],
  ['settingValue', ['overhead', 1.3], '1.3×'],
]

for (const [fn, args, expected] of VALUES) {
  test(`${fn}(${args.join(', ')}) returns ${expected}`, () => {
    assert.equal(format[fn](...args), expected)
  })
}

// [function, arguments] that must throw a RangeError naming the function
const WHOLE = ['hoursSpent', 'hoursReturned', 'count', 'percent', 'spelled']
const THROWS = [
  ...WHOLE.flatMap((fn) => [NaN, Infinity, 1.5].map((bad) => [fn, [bad]])),
  ['money', [NaN, 'USD']],
  ['money', [Infinity, 'USD']],
  ['money', [1.5, 'USD']],
  ['money', [100, 'ABCD']],
  ['rate', [NaN, 'USD']],
  ['rate', [Infinity, 'USD']],
  ['rate', [42.255, 'USD']],
  ['about', [NaN]],
  ['about', [Infinity]],
  ['hoursLine', [NaN, 15, 50, 3000]],
  ['hoursLine', [4, 15, 50, 3000.5]],
  ['settingValue', ['adoption', 0.705]],
  ['settingValue', ['overhead', NaN]],
  ['settingValue', ['nope', 1]],
]

for (const [fn, args] of THROWS) {
  test(`${fn}(${args.join(', ')}) throws a RangeError`, () => {
    assert.throws(() => format[fn](...args), {
      name: 'RangeError',
      message: new RegExp(fn),
    })
  })
}

const SETTINGS = {
  workingWeeks: 50,
  fteHoursPerWeek: 40,
  overhead: 1.3,
  adoption: 0.7,
  realization: 0.8,
  profitMultiplier: 1.3,
  currency: 'USD',
}

const INPUTS = [
  {
    people: 4,
    hoursPerWeek: 15,
    annualPay: 65000,
    automatablePct: 65,
    team: 'Finance & Compliance',
  },
  { people: 12, hoursPerWeek: 10, annualPay: 60000, automatablePct: 0.4 },
  { people: 2.5, hoursPerWeek: 7.5, annualPay: 48000, automatablePct: 33 },
]

for (const input of INPUTS) {
  test(`chain matches the calculator's own lines for ${JSON.stringify(input)}`, () => {
    const out = calculateMiniProfitMap(input)
    assert.equal(
      format.chain(input, out, SETTINGS),
      Object.values(out.formulas).join('\n'),
    )
  })
}

test('chain matches the sample report', () => {
  const input = INPUTS[0]
  assert.equal(
    format.chain(input, calculateMiniProfitMap(input), SETTINGS),
    '4 × 15 × 50 = 3,000 hours/year spent today for Finance & Compliance\n3,000 × 65% × 0.7 × 0.8 = 1,092 hours/year returned\n($65,000 ÷ (50 × 40)) × 1.3 = $42.25/hour\n1,092 × $42.25 = $46,137\n$46,137 × 1.3 = $59,978\n$46,137 + $59,978 = $106,115',
  )
})
