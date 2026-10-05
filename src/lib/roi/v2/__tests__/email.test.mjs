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
  assert.ok(
    !contentSelf.subject.includes('!'),
    'No exclamation marks in subject',
  )

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

test('generateReportEmailContent full text matches expected.', () => {
  const { _, html, text } = generateReportEmailContent(
    SAMPLE_SAVED_REPORT,
    'self',
    {
      publicUrl: 'https://roi.lyrise.ai/v2/report/rep_test',
    },
  )
  assert.equal(
    html,
    '<!DOCTYPE html>\n' +
      '<html>\n' +
      '<head>\n' +
      '  <meta charset="utf-8">\n' +
      '  <style>\n' +
      "    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.5; color: #111827; margin: 0; padding: 24px; }\n" +
      '    .container { max-width: 560px; margin: 0 auto; }\n' +
      '    .heading { font-size: 20px; font-weight: 700; margin-bottom: 12px; color: #111827; }\n' +
      '    .sub { color: #4b5563; font-size: 14px; margin-bottom: 24px; }\n' +
      '    .card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 24px; }\n' +
      '    .stat { margin-bottom: 12px; }\n' +
      '    .stat-label { font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }\n' +
      '    .stat-val { font-size: 18px; font-weight: 700; color: #111827; margin-top: 2px; }\n' +
      '    .btn { display: inline-block; background: #2957FF; color: #ffffff !important; padding: 12px 24px; border-radius: 9999px; text-decoration: none; font-weight: 600; font-size: 14px; margin: 16px 0; }\n' +
      '    .footer { font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 32px; }\n' +
      '  </style>\n' +
      '</head>\n' +
      '<body>\n' +
      '  <div class="container">\n' +
      '    <div class="heading">Your LyRise Profit Map: Acme Legal Services</div>\n' +
      '    <div class="sub">Four people spend about 15 hours a week each on reconciling accounts — about 3,000 hours a year.</div>\n' +
      '    <div class="card">\n' +
      '      <div class="stat"><div class="stat-label">Hours currently spent</div><div class="stat-val">3,000 hrs / year</div></div>\n' +
      '      <div class="stat"><div class="stat-label">Hours Returned</div><div class="stat-val">1,092 hrs / year</div></div>\n' +
      '      <div class="stat"><div class="stat-label">Operational Dividend</div><div class="stat-val">$46,137</div></div>\n' +
      '      <div class="stat"><div class="stat-label">Total Financial Gain</div><div class="stat-val">$106,115</div></div>\n' +
      '    </div>\n' +
      '    <div>\n' +
      '      <a class="btn" href="https://roi.lyrise.ai/v2/report/rep_test">View full report</a>\n' +
      '    </div>\n' +
      '    <div class="footer">\n' +
      '      This link remains active so you can review your figures or share them with colleagues at any time: <a href="https://roi.lyrise.ai/v2/report/rep_test" style="color: #4b5563;">https://roi.lyrise.ai/v2/report/rep_test</a>\n' +
      '    </div>\n' +
      '  </div>\n' +
      '</body>\n' +
      '</html>',
  )
  assert.equal(
    text,
    'Here is the LyRise Profit Map we prepared for Acme Legal Services.\n' +
      'Four people spend about 15 hours a week each on reconciling accounts — about 3,000 hours a year.\n' +
      'Hours currently spent: 3,000 hrs / year\n' +
      'Hours Returned: 1,092 hrs / year\n' +
      'Operational Dividend: $46,137\n' +
      'Total Financial Gain: $106,115\n' +
      'Review your full report and calculations:\n' +
      'https://roi.lyrise.ai/v2/report/rep_test\n' +
      'This link stays active so you can return to it whenever needed.',
  )
})
