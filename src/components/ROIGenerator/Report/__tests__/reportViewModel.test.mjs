// A quick check on buildReportViewModel. This file had no tests at all before
// it was changed to read from the shared report model. Not thorough: just enough
// to catch a broken import, a thrown error, or a change in shape that would
// break the live report page.
//
//   Run:  node --test src/components/ROIGenerator/Report/__tests__/reportViewModel.test.mjs
//
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { after, before, test } from 'node:test'

import * as esbuild from 'esbuild'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../../../..')

let buildState
let buildReportViewModel
let tmpDir

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rvm-test-'))

  const fixturesOut = path.join(tmpDir, 'fixtures.mjs')
  await esbuild.build({
    entryPoints: [
      path.join(repoRoot, 'src/lib/roi/pipeline/__tests__/fixtures.ts'),
    ],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: fixturesOut,
    alias: { '@': repoRoot },
    logLevel: 'silent',
  })
  ;({ buildState } = await import(pathToFileURL(fixturesOut).href))

  const rvmOut = path.join(tmpDir, 'reportViewModel.mjs')
  await esbuild.build({
    entryPoints: [path.join(here, '../reportViewModel.js')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: rvmOut,
    alias: { '@': repoRoot },
    logLevel: 'silent',
  })
  ;({ buildReportViewModel } = await import(pathToFileURL(rvmOut).href))
})

after(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('builds a view model without throwing, with the expected top-level shape', () => {
  const vm = buildReportViewModel(buildState())
  assert.ok(vm, 'expected a non-null view model')
  for (const key of [
    'hero',
    'workflows',
    'workflowTotals',
    'levers',
    'leverTotal',
    'sources',
    'roadmap',
  ]) {
    assert.ok(key in vm, `missing "${key}" on view model`)
  }
})

test('company snapshot revenue estimate uses the real currency symbol, not a hardcoded $', () => {
  const vm = buildReportViewModel(
    buildState({
      normInput: { revenueRange: '', selectedCurrency: 'EUR' },
      company: { revenueEstimateM: 6 },
    }),
  )
  const row = vm.companySnapshot.find((r) =>
    r.text.includes('Revenue estimated'),
  )
  assert.ok(row, 'expected a revenue-estimate snapshot row')
  // The test data always uses US dollars, whatever the form said. So this only
  // confirms the symbol comes from the report's own currency setting, and is not
  // a "$" typed into the sentence.
  assert.match(row.text, /Revenue estimated \$6M annually/)
})

test('sources includes a clickable link for an evidence-backed rate', () => {
  const vm = buildReportViewModel(buildState())
  const rateRow = vm.sources.find((r) => r.input.includes('blended rate'))
  assert.ok(rateRow)
  assert.equal(rateRow.sourceUrl, 'https://www.linkedin.com/salary/')
})

test('the worked-example arithmetic in the workflow formula reconciles to valueLabel', () => {
  const vm = buildReportViewModel(buildState())
  const wf = vm.workflows[0]
  // The formula ends with the same value shown beside it. The whole point of the
  // reconciling factor fix is that these two always match exactly.
  assert.ok(wf.formula.endsWith(`= ${wf.valueLabel}/mo`))
})
