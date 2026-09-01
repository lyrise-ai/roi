// Tests for the sentence at the top of the reveal screen (LYR-188 / POC 10,
// piece 3). They pin down two things: the sentence is built only from real
// answers — never an invented number, and never "null", "NaN" or a bare dash
// when one is missing — and it reads like English, with small numbers written
// out and large ones comma-separated.
//
// No test framework needed: this uses Node's own `node:test` and
// `node:assert`. observation.ts uses no path shortcuts, so esbuild bundles it
// here the same way answerBridge.test.mjs does.
//
//   Run:  node --test src/lib/roi/v2/__tests__/observation.test.mjs
//
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { after, before, test } from 'node:test'

import * as esbuild from 'esbuild'

const here = path.dirname(fileURLToPath(import.meta.url))

let buildObservationSentence
let tmpDir

const field = (value) => ({ value, isEstimated: false, source: 'user' })
const MISSING = { value: null, isEstimated: false, source: null }

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'observation-test-'))
  const outfile = path.join(tmpDir, 'observation.mjs')
  await esbuild.build({
    entryPoints: [path.join(here, '../observation.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'silent',
  })
  ;({ buildObservationSentence } = await import(pathToFileURL(outfile).href))
})

after(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('complete pain point: full sentence with correct arithmetic', () => {
  // 4 people × 12 hours/week × 50 working weeks = 2,400 hours/year.
  const sentence = buildObservationSentence(field(4), field(12), 2_400)
  assert.equal(
    sentence,
    'Four people spending twelve hours a week each adds up to about 2,400 hours a year.',
  )
})

test('range answers: indicates approximation with "Around" or "about"', () => {
  const rangeField = (value) => ({
    value,
    isEstimated: false,
    source: 'user',
    isRange: true,
  })
  const sentence = buildObservationSentence(
    rangeField(7),
    rangeField(10),
    3_500,
  )
  assert.equal(
    sentence,
    'Around seven people spending about ten hours a week each adds up to about 3,500 hours a year.',
  )
})

test('complete pain point: one person uses singular phrasing, no "each"', () => {
  const sentence = buildObservationSentence(field(1), field(10), 500)
  assert.equal(
    sentence,
    'One person spending ten hours a week adds up to about 500 hours a year.',
  )
  assert.doesNotMatch(sentence, /each/)
})

test('missing hoursPerWeek: degrades to what is known, no null/NaN/dash', () => {
  const sentence = buildObservationSentence(field(4), MISSING, null)
  assert.equal(sentence, 'Four people are spending time on this every week.')
  assert.doesNotMatch(sentence, /null|NaN|undefined/i)
  assert.doesNotMatch(sentence, / - |—/)
})

test('missing people: degrades to what is known, no null/NaN/dash', () => {
  const sentence = buildObservationSentence(MISSING, field(12), null)
  assert.equal(sentence, 'About twelve hours a week goes into this today.')
  assert.doesNotMatch(sentence, /null|NaN|undefined/i)
})

test('estimate answers (flagged, no value) are treated the same as missing', () => {
  const estimated = { value: null, isEstimated: true, source: null }
  const sentence = buildObservationSentence(estimated, estimated, null)
  assert.equal(sentence, "We don't have numbers for this one yet.")
  assert.doesNotMatch(sentence, /null|NaN|undefined/i)
})

test('everything missing: honest fallback, never a blank or broken string', () => {
  const sentence = buildObservationSentence(MISSING, MISSING, null)
  assert.equal(sentence, "We don't have numbers for this one yet.")
  assert.ok(sentence.length > 0)
})

test('number formatting: small counts are spelled out, not digits', () => {
  const sentence = buildObservationSentence(field(2), field(5), 500)
  assert.match(sentence, /^Two people spending five hours/)
})

test('number formatting: large counts fall back to comma-formatted digits', () => {
  const sentence = buildObservationSentence(field(150), field(10), 75_000)
  assert.match(sentence, /^150 people spending ten hours/)
  assert.match(sentence, /about 75,000 hours a year/)
})

test('number formatting: annualHours rounds to a natural chunk, not raw precision', () => {
  // 3 people x 11.4 hours a week x 50 weeks is exactly 1,710. But any annual
  // hours figure in this range should be rounded to the nearest 100.
  const sentence = buildObservationSentence(field(3), field(11.4), 7_432)
  assert.match(sentence, /about 7,400 hours a year/)
})

test('a zero value is treated as not usable, never printed as "zero people"', () => {
  const sentence = buildObservationSentence(field(0), field(12), null)
  assert.equal(sentence, 'About twelve hours a week goes into this today.')
  assert.doesNotMatch(sentence, /zero/i)
})
