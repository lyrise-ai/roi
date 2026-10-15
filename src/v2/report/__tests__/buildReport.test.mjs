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
let tmpDir

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-report-test-'))
  const entry = path.join(tmpDir, 'entry.ts')
  fs.writeFileSync(
    entry,
    `export { buildReport } from ${JSON.stringify(path.join(here, '../buildReport.ts'))}\n` +
      `export { SAMPLE_ANSWERS } from ${JSON.stringify(path.join(here, '../sampleReport.ts'))}\n`,
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
  ;({ buildReport, SAMPLE_ANSWERS } = await import(pathToFileURL(outfile).href))
})

after(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('builds workflow figures, totals, outlook, and company snapshot from saved inputs', () => {
  const model = buildReport(SAMPLE_ANSWERS)

  assert.equal(model.workflowRows.length, 4)
  assert.equal(model.workflowRows[0].workflow, SAMPLE_ANSWERS.pains[0].text)
  assert.equal(model.workflowRows[0].total, '3,000')
  assert.equal(model.workflowRows[0].hours, '1,092')
  assert.equal(model.workflowRows[0].gain, '$106,115')
  assert.equal(model.totalHours, '1,926')
  assert.equal(model.totalGain, '$181,882')
  assert.equal(model.totalOd, '$79,079')
  assert.equal(model.totalUplift, '$102,803')
  assert.equal(model.outlook[2].total, '$545,646')
  assert.equal(model.failedRows.length, 0)
  assert.equal(model.snapshot[0].value, SAMPLE_ANSWERS.company.name)
  assert.equal(model.workflowRows[1].mark, 'estimated')
  assert.ok(model.workflowRows[0].chain.includes('$106,115'))
  assert.ok(model.sections.some((section) => section.ref === 'outlook'))
})

test('withholds totals when no workflow has complete numeric inputs', () => {
  const model = buildReport({
    company: { name: 'Example Co' },
    pains: [{ text: 'Reviewing records', quant: [] }],
  })

  assert.equal(model.workflowRows.length, 0)
  assert.equal(model.totalHours, undefined)
  assert.equal(model.totalGain, undefined)
  assert.match(model.totalsFailed, /No workflows have enough readable/)
  assert.match(model.failedRows[0].message, /how many people/)
  assert.equal(model.outlook, undefined)
})

test('isolates an unformattable workflow and keeps other workflow totals', () => {
  const model = buildReport({
    company: { name: 'Example Co' },
    pains: [
      ...SAMPLE_ANSWERS.pains.slice(0, 1),
      {
        text: 'Overflowing input',
        quant: [
          { mode: 'exact', exact: '1' },
          { mode: 'exact', exact: '1e308' },
          { mode: 'exact', exact: '15' },
          { mode: 'exact', exact: '65000' },
          { mode: 'exact', exact: '35' },
        ],
      },
    ],
  })

  assert.equal(model.workflowRows.length, 1)
  assert.equal(model.failedRows.length, 1)
  assert.equal(model.totalGain, '$106,115')
  assert.equal(model.totalsFailed, undefined)
})
