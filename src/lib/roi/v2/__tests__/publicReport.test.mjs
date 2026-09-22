import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import * as esbuild from 'esbuild'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

let resolveSavedReportForPublicView
let SAMPLE_SAVED_REPORT
let tmpDir

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-public-report-test-'))
  const outfile = path.join(tmpDir, 'savedReport.mjs')
  await esbuild.build({
    entryPoints: [path.join(here, '../savedReport.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'silent',
  })

  ;({ resolveSavedReportForPublicView, SAMPLE_SAVED_REPORT } = await import(
    pathToFileURL(outfile).href
  ))
})

after(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('resolveSavedReportForPublicView: loads an existing saved report and explains missing links clearly', () => {
  const ok = resolveSavedReportForPublicView(SAMPLE_SAVED_REPORT.id)
  assert.equal(ok.status, 'ok')
  assert.equal(ok.report.id, SAMPLE_SAVED_REPORT.id)

  const missing = resolveSavedReportForPublicView('')
  assert.equal(missing.status, 'missing')
  assert.match(missing.message, /missing/i)

  const notFound = resolveSavedReportForPublicView('rep_deleted_123')
  assert.equal(notFound.status, 'not-found')
  assert.match(notFound.message, /couldn.t find|not available|deleted|link/i)
})
