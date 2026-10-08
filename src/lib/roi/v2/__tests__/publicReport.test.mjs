import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import * as esbuild from 'esbuild'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

let resolveSavedReportForPublicView
let toPublicReport
let resetViewerTokens
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

  ;({
    resolveSavedReportForPublicView,
    toPublicReport,
    resetViewerTokens,
    SAMPLE_SAVED_REPORT,
  } = await import(pathToFileURL(outfile).href))
})

after(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('resolveSavedReportForPublicView: loads an existing saved report and explains missing links clearly', () => {
  resetViewerTokens()
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

test('toPublicReport: includes only fields rendered by the public report page', () => {
  const report = toPublicReport(SAMPLE_SAVED_REPORT)

  assert.deepEqual(Object.keys(report).sort(), [
    'company',
    'disclaimer',
    'featured',
    'legend',
    'observation',
    'pains',
  ])
  assert.deepEqual(report.company, { name: SAMPLE_SAVED_REPORT.company.name })
  assert.equal('recipientEmail' in report, false)
  assert.equal('senderName' in report, false)
  assert.equal('reportSections' in report, false)
})

test('one-time cookie: binds to first viewer and denies access to unauthorized strangers', () => {
  resetViewerTokens()

  // 1. First visitor (email recipient) opens the report -> claims it and receives setViewerToken
  const firstVisit = resolveSavedReportForPublicView(SAMPLE_SAVED_REPORT.id)
  assert.equal(firstVisit.status, 'ok')
  assert.ok(
    firstVisit.setViewerToken,
    'first visitor receives viewer token to set as cookie',
  )

  const recipientToken = firstVisit.setViewerToken

  // 2. Same recipient revisits with their cookie token -> allowed
  const recipientRevisit = resolveSavedReportForPublicView(
    SAMPLE_SAVED_REPORT.id,
    recipientToken,
  )
  assert.equal(recipientRevisit.status, 'ok')

  // 3. A stranger opens the same link without the cookie -> rejected with 403 unauthorized
  const strangerVisit = resolveSavedReportForPublicView(SAMPLE_SAVED_REPORT.id)
  assert.equal(strangerVisit.status, 'unauthorized')
  assert.match(strangerVisit.message, /already been accessed|restricted/i)

  // 4. A stranger opens with an invalid cookie -> rejected
  const fakeTokenVisit = resolveSavedReportForPublicView(
    SAMPLE_SAVED_REPORT.id,
    'invalid-token-xyz',
  )
  assert.equal(fakeTokenVisit.status, 'unauthorized')

  // 5. Resetting tokens clears claim
  resetViewerTokens()
  const freshVisit = resolveSavedReportForPublicView(SAMPLE_SAVED_REPORT.id)
  assert.equal(freshVisit.status, 'ok')
})
