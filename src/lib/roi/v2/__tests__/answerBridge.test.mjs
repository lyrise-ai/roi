// Tests for answerBridge.ts, which turns typed answers into numbers the
// calculator can use (LYR-188 / POC 10). It pins down the conversion rules and
// the packing step, so that a later change cannot quietly start passing a 0 or
// a NaN into the calculator for a question the user never answered.
//
// No test framework needed: this uses Node's own `node:test` and
// `node:assert`. answerBridge.ts uses no path shortcuts, so esbuild bundles it
// here the same way miniCalculator.test.mjs does.
//
//   Run:  node --test src/lib/roi/v2/__tests__/answerBridge.test.mjs
//
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { after, before, test } from 'node:test'

import * as esbuild from 'esbuild'

const here = path.dirname(fileURLToPath(import.meta.url))

let bridgeAnswer
let bridgeAutomatable
let bridgePainQuant
let assembleCalculatorInput
let parseEstimateText
let tmpDir

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'answer-bridge-test-'))
  const outfile = path.join(tmpDir, 'answerBridge.mjs')
  await esbuild.build({
    entryPoints: [path.join(here, '../answerBridge.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'silent',
  })
  ;({
    bridgeAnswer,
    bridgeAutomatable,
    bridgePainQuant,
    assembleCalculatorInput,
    parseEstimateText,
  } = await import(pathToFileURL(outfile).href))
})

after(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('exact: parses a plain number', () => {
  assert.deepEqual(bridgeAnswer({ mode: 'exact', exact: '12' }), {
    value: 12,
    isEstimated: false,
    source: 'user',
  })
})

test('exact: parses currency, commas and a k suffix', () => {
  assert.deepEqual(bridgeAnswer({ mode: 'exact', exact: '$70,000' }), {
    value: 70_000,
    isEstimated: false,
    source: 'user',
  })
  assert.deepEqual(bridgeAnswer({ mode: 'exact', exact: '70k' }), {
    value: 70_000,
    isEstimated: false,
    source: 'user',
  })
})

test('exact: empty string is missing, not 0', () => {
  assert.deepEqual(bridgeAnswer({ mode: 'exact', exact: '' }), {
    value: null,
    isEstimated: false,
    source: null,
  })
  assert.deepEqual(bridgeAnswer({ mode: 'exact' }), {
    value: null,
    isEstimated: false,
    source: null,
  })
})

test('exact: unparseable text is missing, not NaN', () => {
  const out = bridgeAnswer({ mode: 'exact', exact: 'a third' })
  assert.equal(out.value, null)
  assert.equal(Number.isNaN(out.value), false)
  assert.equal(out.isEstimated, false)
  assert.equal(out.source, null)
})

test('range: averages low and high', () => {
  assert.deepEqual(bridgeAnswer({ mode: 'range', low: '5', high: '10' }), {
    value: 7.5,
    isEstimated: false,
    source: 'user',
  })
})

test('range: one bound alone is used as-is', () => {
  assert.deepEqual(bridgeAnswer({ mode: 'range', low: '5' }), {
    value: 5,
    isEstimated: false,
    source: 'user',
  })
  assert.deepEqual(bridgeAnswer({ mode: 'range', high: '10' }), {
    value: 10,
    isEstimated: false,
    source: 'user',
  })
})

test('range: neither bound is missing, not 0', () => {
  assert.deepEqual(bridgeAnswer({ mode: 'range' }), {
    value: null,
    isEstimated: false,
    source: null,
  })
})

test('estimate: flagged as estimated, no fabricated value', () => {
  assert.deepEqual(bridgeAnswer({ mode: 'estimate' }), {
    value: null,
    isEstimated: true,
    source: null,
  })
})

test('undefined answer is missing', () => {
  assert.deepEqual(bridgeAnswer(undefined), {
    value: null,
    isEstimated: false,
    source: null,
  })
})

test('automatable: inverts a fractional "still needs a person" answer', () => {
  // "about a third still needs a person" -> ~two-thirds automatable
  const out = bridgeAutomatable({ mode: 'exact', exact: '0.33' })
  assert.ok(
    Math.abs(out.value - 0.67) < 1e-9,
    `expected ~0.67, got ${out.value}`,
  )
  assert.equal(out.source, 'user')
})

test('automatable: inverts a percentage-points answer', () => {
  const out = bridgeAutomatable({ mode: 'exact', exact: '33' })
  assert.equal(out.value, 67)
})

test('automatable: estimate stays flagged and null, not inverted into a number', () => {
  assert.deepEqual(bridgeAutomatable({ mode: 'estimate' }), {
    value: null,
    isEstimated: true,
    source: null,
  })
})

test('bridgePainQuant: reads the four calculator fields at their QUANT positions', () => {
  const quant = [
    { mode: 'exact', exact: '2600' }, // [0] volume — not read
    { mode: 'exact', exact: '7' }, // [1] people
    { mode: 'exact', exact: '18' }, // [2] hours/week
    { mode: 'exact', exact: '18000' }, // [3] annual pay
    { mode: 'exact', exact: '0.25' }, // [4] still-needs-a-person
  ]
  const fields = bridgePainQuant(quant)
  assert.equal(fields.people.value, 7)
  assert.equal(fields.hoursPerWeek.value, 18)
  assert.equal(fields.annualPay.value, 18_000)
  assert.equal(fields.automatablePct.value, 0.75)
})

test('assembleCalculatorInput: complete fields produce calculator input', () => {
  const fields = bridgePainQuant([
    { mode: 'exact', exact: '2600' },
    { mode: 'exact', exact: '7' },
    { mode: 'exact', exact: '18' },
    { mode: 'exact', exact: '18000' },
    { mode: 'exact', exact: '0.25' },
  ])
  assert.deepEqual(assembleCalculatorInput(fields, 'Ops'), {
    people: 7,
    hoursPerWeek: 18,
    annualPay: 18_000,
    automatablePct: 0.75,
    team: 'Ops',
  })
})

test('assembleCalculatorInput: a missing field signals incomplete, not a 0', () => {
  const fields = bridgePainQuant([
    { mode: 'exact', exact: '2600' },
    { mode: 'exact', exact: '7' },
    { mode: 'estimate' }, // hours/week left as AI-estimate, no number
    { mode: 'exact', exact: '18000' },
    { mode: 'exact', exact: '0.25' },
  ])
  const out = assembleCalculatorInput(fields)
  assert.equal(out.incomplete, true)
  assert.deepEqual(out.missing, ['hoursPerWeek'])
})

test('assembleCalculatorInput: reports every missing field', () => {
  const fields = bridgePainQuant([])
  const out = assembleCalculatorInput(fields)
  assert.equal(out.incomplete, true)
  assert.deepEqual(out.missing, [
    'people',
    'hoursPerWeek',
    'annualPay',
    'automatablePct',
  ])
})

// ── The POC's estimate fallback (LYR-188, PR #56 review) ──────────────────
// Blank answers fall back to the estimate copy the interview already showed,
// so the Next-Next-Next demo walk shows figures instead of an empty state.

test('parseEstimateText: reads the shapes DEMOS actually uses', () => {
  assert.equal(parseEstimateText('about 4 people'), 4)
  assert.equal(parseEstimateText('about 12 hours'), 12)
  assert.equal(parseEstimateText('about $72k a year'), 72_000)
  assert.equal(parseEstimateText('about 2,600 a month'), 2_600)
  assert.equal(parseEstimateText('about a quarter'), 0.25)
  assert.equal(parseEstimateText('about a third'), 1 / 3)
  assert.equal(parseEstimateText('about half'), 0.5)
})

test('parseEstimateText: the no-scan copy stays missing', () => {
  assert.equal(parseEstimateText('Nothing to base one on'), null)
  assert.equal(parseEstimateText(undefined), null)
})

test('estimates fill blanks, flagged as ours', () => {
  const fields = bridgePainQuant(
    [],
    [
      'about 2,600 a month',
      'about 7 people',
      'about 18 hours',
      'about $18k a year',
      'about a quarter',
    ],
  )
  assert.deepEqual(fields.people, {
    value: 7,
    isEstimated: true,
    source: 'estimate',
  })
  assert.deepEqual(fields.annualPay, {
    value: 18_000,
    isEstimated: true,
    source: 'estimate',
  })
  // Still inverted: a quarter still needs a person, so 75% is automatable.
  assert.equal(fields.automatablePct.value, 0.75)
  assert.deepEqual(assembleCalculatorInput(fields), {
    people: 7,
    hoursPerWeek: 18,
    annualPay: 18_000,
    automatablePct: 0.75,
  })
})

test('a typed answer always beats the estimate', () => {
  const fields = bridgePainQuant(
    [
      { mode: 'exact' },
      { mode: 'exact', exact: '4' },
      { mode: 'estimate' },
      { mode: 'exact' },
      { mode: 'exact' },
    ],
    [
      'about 2,600 a month',
      'about 7 people',
      'about 18 hours',
      'about $18k a year',
      'about a quarter',
    ],
  )
  assert.deepEqual(fields.people, {
    value: 4,
    isEstimated: false,
    source: 'user',
  })
  // "Let AI estimate" is a blank, so it takes the fallback like any other.
  assert.equal(fields.hoursPerWeek.value, 18)
})

test('no estimates passed: blanks stay missing, as before', () => {
  const out = assembleCalculatorInput(bridgePainQuant([]))
  assert.equal(out.incomplete, true)
})
