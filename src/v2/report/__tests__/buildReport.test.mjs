import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { after, before, test } from 'node:test'
import * as esbuild from 'esbuild'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../../..')

let buildReport
let SAMPLE_ANSWERS
let SAMPLE_RESEARCH
let SAMPLE_WORDS
let SAMPLE_REPORT
let fixed
let tmpDir

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-report-test-'))
  const entry = path.join(tmpDir, 'entry.ts')
  const from = (file) => JSON.stringify(path.join(here, '..', file))
  fs.writeFileSync(
    entry,
    `export { buildReport } from ${from('buildReport.ts')}\n` +
      `export { SAMPLE_ANSWERS, SAMPLE_RESEARCH, SAMPLE_WORDS, SAMPLE_REPORT } from ${from('sampleReport.ts')}\n` +
      `export * as fixed from ${from('fixedWords.ts')}\n`,
  )

  const outfile = path.join(tmpDir, 'bundle.mjs')
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'esm',
    alias: { '@': repoRoot },
    outfile,
    logLevel: 'silent',
  })
  ;({
    buildReport,
    SAMPLE_ANSWERS,
    SAMPLE_RESEARCH,
    SAMPLE_WORDS,
    SAMPLE_REPORT,
    fixed,
  } = await import(pathToFileURL(outfile).href))
})

after(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
})

const exact = (value) => ({ mode: 'exact', exact: value })

test('the sample answers, research and words give exactly SAMPLE_REPORT', () => {
  const model = buildReport({
    ...SAMPLE_ANSWERS,
    research: SAMPLE_RESEARCH,
    words: SAMPLE_WORDS,
  })
  assert.deepEqual(model, SAMPLE_REPORT)
})

test('a row that overflows fails alone, and the totals say so', () => {
  // no words, so nothing is rejected and pain 3 is a row
  const model = buildReport({
    ...SAMPLE_ANSWERS,
    research: SAMPLE_RESEARCH,
    pains: [
      ...SAMPLE_ANSWERS.pains.slice(0, 3),
      {
        text: 'Too big to count',
        // 10^307 people: the hours overflow to Infinity in the Calculator
        quant: [
          exact('1'),
          exact('1' + '0'.repeat(307)),
          exact('15'),
          exact('65000'),
          exact('35'),
        ],
      },
    ],
  })

  assert.deepEqual(
    model.workflowRows.map((row) => row.id),
    ['0', '1', '2'],
  )
  assert.deepEqual(model.failedRows, [
    { workflow: 'Too big to count', message: fixed.ROW_FAILED },
  ])
  assert.deepEqual(model.totals, { ok: false, message: fixed.TOTALS_FAILED })
})

test('empty words: the thesis falls back, the figures stay the same', () => {
  const model = buildReport({ ...SAMPLE_ANSWERS, research: SAMPLE_RESEARCH })

  assert.equal(
    model.thesis,
    fixed.THESIS_FALLBACK(SAMPLE_ANSWERS.pains[0].text),
  )
  assert.equal(model.mapTitle, '')
  assert.deepEqual(model.processMap, [])
  for (const expected of SAMPLE_REPORT.workflowRows) {
    const row = model.workflowRows.find((r) => r.id === expected.id)
    assert.equal(row.gain, expected.gain)
    assert.equal(row.hours, expected.hours)
    assert.equal(row.workflow, SAMPLE_ANSWERS.pains[Number(row.id)].text)
  }
})

test('no complete answers: no totals, and each row says what is missing', () => {
  const model = buildReport({
    company: { name: 'Example Co' },
    pains: [{ text: 'Reviewing records', quant: [] }],
  })

  assert.equal(model.workflowRows.length, 0)
  assert.deepEqual(model.totals, { ok: false, message: fixed.LABELS.noRows })
  assert.match(model.failedRows[0].message, /how many people/)
})
