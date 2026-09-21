import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { after, before, test } from 'node:test'
import * as esbuild from 'esbuild'

const here = path.dirname(fileURLToPath(import.meta.url))

let buildPublicReportUrl
let generateReportEmailContent
let isEmailAlreadySent
let recordEmailSent
let resetSentRegistryForTests
let sendReportEmail
let SAMPLE_SAVED_REPORT
let tmpDir

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'email-v2-test-'))
  const outfile = path.join(tmpDir, 'email.mjs')
  await esbuild.build({
    entryPoints: [path.join(here, '../email.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'silent',
  })
  ;({
    buildPublicReportUrl,
    generateReportEmailContent,
    isEmailAlreadySent,
    recordEmailSent,
    resetSentRegistryForTests,
    sendReportEmail,
  } = await import(pathToFileURL(outfile).href))

  const savedReportOutfile = path.join(tmpDir, 'savedReport.mjs')
  await esbuild.build({
    entryPoints: [path.join(here, '../savedReport.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: savedReportOutfile,
    logLevel: 'silent',
  })
  ;({ SAMPLE_SAVED_REPORT } = await import(
    pathToFileURL(savedReportOutfile).href
  ))
})

after(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('buildPublicReportUrl: never outputs localhost or 127.0.0.1 in any environment (LYR-144)', () => {
  const localReq = {
    headers: { host: 'localhost:3777', 'x-forwarded-proto': 'http' },
  }
  const urlFromLocal = buildPublicReportUrl('rep_123', localReq)
  assert.ok(!urlFromLocal.includes('localhost'))
  assert.ok(!urlFromLocal.includes('127.0.0.1'))
  assert.ok(urlFromLocal.startsWith('https://roi.lyrise.ai'))
  assert.ok(urlFromLocal.includes('/v2/report/rep_123'))

  const ipReq = {
    headers: { host: '127.0.0.1:3000', 'x-forwarded-proto': 'http' },
  }
  const urlFromIp = buildPublicReportUrl('rep_456', ipReq)
  assert.ok(!urlFromIp.includes('127.0.0.1'))
  assert.ok(urlFromIp.startsWith('https://roi.lyrise.ai'))

  const prodReq = {
    headers: {
      host: 'preview-123.lyrise.vercel.app',
      'x-forwarded-proto': 'https',
    },
  }
  const urlFromProd = buildPublicReportUrl('rep_789', prodReq)
  assert.equal(
    urlFromProd,
    'https://preview-123.lyrise.vercel.app/v2/report/rep_789',
  )
})

test('generateReportEmailContent: strictly adheres to P10 terminology and analyst tone', () => {
  const contentSelf = generateReportEmailContent(SAMPLE_SAVED_REPORT, 'self', {
    publicUrl: 'https://roi.lyrise.ai/v2/report/rep_test',
  })

  // Check required terms (LYR-162 / LYR-237)
  assert.ok(
    contentSelf.html.includes('Hours Returned'),
    'Must use "Hours Returned"',
  )
  assert.ok(
    contentSelf.html.includes('Operational Dividend'),
    'Must use "Operational Dividend"',
  )
  assert.ok(
    contentSelf.html.includes('Total Financial Gain'),
    'Must use "Total Financial Gain"',
  )

  // Check forbidden terms
  assert.ok(
    !contentSelf.html.toLowerCase().includes('time saved'),
    'Never use "time saved"',
  )
  assert.ok(
    !contentSelf.html.toLowerCase().includes('cost savings'),
    'Never use "cost savings"',
  )
  assert.ok(!contentSelf.html.includes('ROI'), 'Never use "ROI"')
  assert.ok(
    !contentSelf.html.toLowerCase().includes('unlock'),
    'Never use "unlock"',
  )
  assert.ok(
    !contentSelf.html.toLowerCase().includes('discover'),
    'Never use "discover"',
  )
  assert.ok(!contentSelf.subject.includes('!'), 'No exclamation marks in subject')

  // Check colleague format
  const contentColleague = generateReportEmailContent(
    SAMPLE_SAVED_REPORT,
    'colleague',
    {
      senderName: 'Sarah Connor',
      publicUrl: 'https://roi.lyrise.ai/v2/report/rep_test',
    },
  )
  assert.ok(contentColleague.subject.includes('Sarah Connor'))
  assert.ok(contentColleague.html.includes('Sarah Connor'))
  assert.ok(contentColleague.html.includes('Hours Returned'))
  assert.ok(contentColleague.html.includes('Total Financial Gain'))
})

test('duplicate suppression: never sends twice for the same report and recipient (LYR-215)', async () => {
  resetSentRegistryForTests()
  const reportId = 'rep_dupe_check'
  const email = 'finance@acme.com'

  assert.equal(isEmailAlreadySent(reportId, email, 'self'), false)
  recordEmailSent(reportId, email, 'self')
  assert.equal(isEmailAlreadySent(reportId, email, 'self'), true)

  // Different email should not be blocked
  assert.equal(isEmailAlreadySent(reportId, 'other@acme.com', 'self'), false)

  // sendReportEmail early-returns alreadySent: true
  const result = await sendReportEmail({
    to: email,
    report: { ...SAMPLE_SAVED_REPORT, id: reportId },
    type: 'self',
  })
  assert.equal(result.ok, true)
  assert.equal(result.alreadySent, true)
})

test('sendReportEmail: rejects invalid email address', async () => {
  await assert.rejects(
    () =>
      sendReportEmail({
        to: 'not-an-email',
        report: SAMPLE_SAVED_REPORT,
        type: 'self',
      }),
    /Invalid recipient email address/,
  )
})

test('sendReportEmail: suppresses send safely in test env without ALLOW_OUTBOUND_EMAIL', async () => {
  resetSentRegistryForTests()
  const origAllow = process.env.ALLOW_OUTBOUND_EMAIL
  delete process.env.ALLOW_OUTBOUND_EMAIL

  const result = await sendReportEmail({
    to: 'test-suppressed@example.com',
    report: { ...SAMPLE_SAVED_REPORT, id: 'rep_suppressed' },
    type: 'self',
  })

  assert.equal(result.ok, true)
  assert.equal(result.suppressed, true)
  assert.ok(result.reason)

  if (origAllow) process.env.ALLOW_OUTBOUND_EMAIL = origAllow
})

test('sendReportEmail: fails loudly when Resend rejects (LYR-214 / P4)', async () => {
  resetSentRegistryForTests()
  const origAllow = process.env.ALLOW_OUTBOUND_EMAIL
  const origKey = process.env.RESEND_API_KEY
  const origFetch = globalThis.fetch

  process.env.ALLOW_OUTBOUND_EMAIL = '1'
  process.env.RESEND_API_KEY = 're_dummy_key_for_test'

  // Mock fetch to simulate Resend HTTP 422 Unprocessable Entity
  globalThis.fetch = async () => ({
    ok: false,
    status: 422,
    text: async () => JSON.stringify({ message: 'Domain not verified' }),
  })

  try {
    await assert.rejects(
      () =>
        sendReportEmail({
          to: 'real@example.com',
          report: { ...SAMPLE_SAVED_REPORT, id: 'rep_fail_loud' },
          type: 'self',
        }),
      /Resend rejected email \(HTTP 422\): {"message":"Domain not verified"}/,
    )
  } finally {
    globalThis.fetch = origFetch
    if (origAllow) process.env.ALLOW_OUTBOUND_EMAIL = origAllow
    else delete process.env.ALLOW_OUTBOUND_EMAIL
    if (origKey) process.env.RESEND_API_KEY = origKey
    else delete process.env.RESEND_API_KEY
  }
})
