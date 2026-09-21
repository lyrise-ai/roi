// ─────────────────────────────────────────────────────────────────────────────
// email — Profit Map V2 Report Email Delivery (LYR-237)
//
// Sends two types of emails:
//   1. 'self'      — to the person who finished the Profit Map, with the link
//                    so they can find it again next week.
//   2. 'colleague' — to a named colleague (e.g. Finance Director) to review.
//
// Rules enforced:
//   - Resend is called over plain HTTP. No SDK installed (CLAUDE.md).
//   - outboundEmail.ts is imported and never edited.
//   - Links never point to localhost (LYR-144).
//   - Loading the page twice does not send twice (LYR-215).
//   - Fails loudly on Resend rejection — never swallows errors (LYR-214 / P4).
//   - Strict analyst wording: "Operational Dividend", "Total Financial Gain",
//     "Hours Returned". No "unlock", no "discover", no exclamation marks.
// ─────────────────────────────────────────────────────────────────────────────

import { outboundEmailBlockedReason } from '../../outboundEmail'
import type { SavedReport } from './savedReport'

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DEFAULT_FROM = 'LyRise AI <reports@roi.lyrise.ai>'
const DEFAULT_PUBLIC_BASE = 'https://roi.lyrise.ai'

/**
 * Builds the canonical public URL for an emailed report link.
 * Guarantees the link NEVER contains localhost or 127.0.0.1 in any environment (LYR-144).
 */
export function buildPublicReportUrl(
  reportId: string,
  req?: { headers?: Record<string, string | string[] | undefined> },
): string {
  const envBase = process.env.NEXT_PUBLIC_BASE_URL
  if (
    envBase &&
    !envBase.includes('localhost') &&
    !envBase.includes('127.0.0.1')
  ) {
    return `${envBase.replace(/\/$/, '')}/v2/report/${encodeURIComponent(reportId)}`
  }

  const rawHost = req?.headers?.['x-forwarded-host'] || req?.headers?.host
  const host = Array.isArray(rawHost) ? rawHost[0] : rawHost

  if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
    const rawProto = req?.headers?.['x-forwarded-proto'] || 'https'
    const proto = Array.isArray(rawProto) ? rawProto[0] : rawProto
    return `${proto}://${host}/v2/report/${encodeURIComponent(reportId)}`
  }

  return `${DEFAULT_PUBLIC_BASE}/v2/report/${encodeURIComponent(reportId)}`
}

// In-memory deduplication registry to prevent duplicate sends (LYR-215).
// Key format: `${reportId}::${normalizedEmail}::${type}`
const sentEmailKeys = new Set<string>()

export function makeDedupeKey(
  reportId: string,
  email: string,
  type: 'self' | 'colleague',
): string {
  return `${reportId.trim()}::${email.trim().toLowerCase()}::${type}`
}

export function isEmailAlreadySent(
  reportId: string,
  email: string,
  type: 'self' | 'colleague',
): boolean {
  return sentEmailKeys.has(makeDedupeKey(reportId, email, type))
}

export function recordEmailSent(
  reportId: string,
  email: string,
  type: 'self' | 'colleague',
): void {
  sentEmailKeys.add(makeDedupeKey(reportId, email, type))
}

export function resetSentRegistryForTests(): void {
  sentEmailKeys.clear()
}

function comma(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return '0'
  return Math.round(val).toLocaleString('en-US')
}

function money(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return '$0'
  return '$' + Math.round(val).toLocaleString('en-US')
}

export interface EmailContent {
  subject: string
  html: string
  text: string
}

/**
 * Formats email content using concise analyst voice.
 * Strictly adheres to P10 terminology:
 *   - "Hours Returned" (never "time saved")
 *   - "Operational Dividend" (never "cost savings")
 *   - "Total Financial Gain" (never "ROI")
 */
export function generateReportEmailContent(
  report: SavedReport,
  type: 'self' | 'colleague',
  options: {
    senderName?: string
    publicUrl: string
  },
): EmailContent {
  const companyName = report.company.name || 'Your company'
  const figures = report.featured?.figures?.calc
  const hoursSpent = figures?.annualHours
  const hoursReturned = figures?.hoursReturned
  const dividend = figures?.operationalDividend
  const totalGain = figures?.totalFinancialGain
  const url = options.publicUrl

  if (type === 'self') {
    const subject = `Your LyRise Profit Map: ${companyName}`
    const text = [
      `Here is the LyRise Profit Map we prepared for ${companyName}.`,
      '',
      report.observation ? `${report.observation}` : '',
      '',
      hoursSpent != null
        ? `Hours currently spent: ${comma(hoursSpent)} hrs / year`
        : '',
      hoursReturned != null
        ? `Hours Returned: ${comma(hoursReturned)} hrs / year`
        : '',
      dividend != null ? `Operational Dividend: ${money(dividend)}` : '',
      totalGain != null ? `Total Financial Gain: ${money(totalGain)}` : '',
      '',
      `Review your full report and calculations:`,
      `${url}`,
      '',
      `This link stays active so you can return to it whenever needed.`,
    ]
      .filter(Boolean)
      .join('\n')

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.5; color: #111827; margin: 0; padding: 24px; }
    .container { max-width: 560px; margin: 0 auto; }
    .heading { font-size: 20px; font-weight: 700; margin-bottom: 12px; color: #111827; }
    .sub { color: #4b5563; font-size: 14px; margin-bottom: 24px; }
    .card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 24px; }
    .stat { margin-bottom: 12px; }
    .stat-label { font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
    .stat-val { font-size: 18px; font-weight: 700; color: #111827; margin-top: 2px; }
    .btn { display: inline-block; background: #2957FF; color: #ffffff !important; padding: 12px 24px; border-radius: 9999px; text-decoration: none; font-weight: 600; font-size: 14px; margin: 16px 0; }
    .footer { font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 32px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="heading">Your LyRise Profit Map: ${escapeHtml(companyName)}</div>
    <div class="sub">${report.observation ? escapeHtml(report.observation) : 'Here is the summary of potential returns identified for your business.'}</div>
    <div class="card">
      ${
        hoursSpent != null
          ? `<div class="stat"><div class="stat-label">Hours currently spent</div><div class="stat-val">${comma(hoursSpent)} hrs / year</div></div>`
          : ''
      }
      ${
        hoursReturned != null
          ? `<div class="stat"><div class="stat-label">Hours Returned</div><div class="stat-val">${comma(hoursReturned)} hrs / year</div></div>`
          : ''
      }
      ${
        dividend != null
          ? `<div class="stat"><div class="stat-label">Operational Dividend</div><div class="stat-val">${money(dividend)}</div></div>`
          : ''
      }
      ${
        totalGain != null
          ? `<div class="stat"><div class="stat-label">Total Financial Gain</div><div class="stat-val">${money(totalGain)}</div></div>`
          : ''
      }
    </div>
    <div>
      <a class="btn" href="${escapeHtmlAttr(url)}">View full report</a>
    </div>
    <div class="footer">
      This link remains active so you can review your figures or share them with colleagues at any time: <a href="${escapeHtmlAttr(url)}" style="color: #4b5563;">${escapeHtml(url)}</a>
    </div>
  </div>
</body>
</html>`.trim()

    return { subject, html, text }
  } else {
    const sender = options.senderName?.trim() || 'A colleague'
    const subject = `${sender} shared the LyRise Profit Map for ${companyName}`
    const text = [
      `${sender} completed a LyRise Profit Map for ${companyName} and shared the results with you.`,
      '',
      report.observation ? `${report.observation}` : '',
      '',
      hoursSpent != null
        ? `Hours currently spent: ${comma(hoursSpent)} hrs / year`
        : '',
      hoursReturned != null
        ? `Hours Returned: ${comma(hoursReturned)} hrs / year`
        : '',
      dividend != null ? `Operational Dividend: ${money(dividend)}` : '',
      totalGain != null ? `Total Financial Gain: ${money(totalGain)}` : '',
      '',
      `Review the full breakdown and calculations:`,
      `${url}`,
    ]
      .filter(Boolean)
      .join('\n')

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.5; color: #111827; margin: 0; padding: 24px; }
    .container { max-width: 560px; margin: 0 auto; }
    .heading { font-size: 20px; font-weight: 700; margin-bottom: 12px; color: #111827; }
    .sub { color: #4b5563; font-size: 14px; margin-bottom: 24px; }
    .card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 24px; }
    .stat { margin-bottom: 12px; }
    .stat-label { font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
    .stat-val { font-size: 18px; font-weight: 700; color: #111827; margin-top: 2px; }
    .btn { display: inline-block; background: #2957FF; color: #ffffff !important; padding: 12px 24px; border-radius: 9999px; text-decoration: none; font-weight: 600; font-size: 14px; margin: 16px 0; }
    .footer { font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 32px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="heading">${escapeHtml(sender)} shared the LyRise Profit Map for ${escapeHtml(companyName)}</div>
    <div class="sub">${escapeHtml(sender)} completed an initial evaluation of repetitive workflows and potential automation returns for ${escapeHtml(companyName)}.</div>
    <div class="card">
      ${
        hoursSpent != null
          ? `<div class="stat"><div class="stat-label">Hours currently spent</div><div class="stat-val">${comma(hoursSpent)} hrs / year</div></div>`
          : ''
      }
      ${
        hoursReturned != null
          ? `<div class="stat"><div class="stat-label">Hours Returned</div><div class="stat-val">${comma(hoursReturned)} hrs / year</div></div>`
          : ''
      }
      ${
        dividend != null
          ? `<div class="stat"><div class="stat-label">Operational Dividend</div><div class="stat-val">${money(dividend)}</div></div>`
          : ''
      }
      ${
        totalGain != null
          ? `<div class="stat"><div class="stat-label">Total Financial Gain</div><div class="stat-val">${money(totalGain)}</div></div>`
          : ''
      }
    </div>
    <div>
      <a class="btn" href="${escapeHtmlAttr(url)}">Review report &amp; calculations</a>
    </div>
    <div class="footer">
      Review the methodology and detailed assumptions at: <a href="${escapeHtmlAttr(url)}" style="color: #4b5563;">${escapeHtml(url)}</a>
    </div>
  </div>
</body>
</html>`.trim()

    return { subject, html, text }
  }
}

export interface SendReportEmailArgs {
  to: string
  report: SavedReport
  type: 'self' | 'colleague'
  senderName?: string
  req?: { headers?: Record<string, string | string[] | undefined> }
}

export interface SendReportEmailResult {
  ok: boolean
  alreadySent?: boolean
  suppressed?: boolean
  reason?: string
}

/**
 * Sends report email via Resend plain HTTP.
 * Guarantees duplicate suppression, environment-safe dispatch, and loud failure reporting.
 */
export async function sendReportEmail({
  to,
  report,
  type,
  senderName,
  req,
}: SendReportEmailArgs): Promise<SendReportEmailResult> {
  const normalizedTo = to.trim().toLowerCase()
  if (!EMAIL_RE.test(normalizedTo)) {
    throw new Error(`Invalid recipient email address: "${to}"`)
  }

  // 1. Guard against duplicate sends (LYR-215).
  if (isEmailAlreadySent(report.id, normalizedTo, type)) {
    return { ok: true, alreadySent: true }
  }

  const publicUrl = buildPublicReportUrl(report.id, req)
  const content = generateReportEmailContent(report, type, {
    senderName,
    publicUrl,
  })

  // 2. Check outbound email suppression guard.
  const blockedReason = outboundEmailBlockedReason()
  if (blockedReason) {
    // eslint-disable-next-line no-console
    console.warn(
      `[v2/email] Suppressed outbound email to ${normalizedTo} (${blockedReason})`,
    )
    recordEmailSent(report.id, normalizedTo, type)
    return { ok: true, suppressed: true, reason: blockedReason }
  }

  // 3. Plain HTTP Resend call (CLAUDE.md: no SDK installed).
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured')
  }

  const from = process.env.EMAIL_FROM || DEFAULT_FROM
  const payload = {
    from,
    to: [normalizedTo],
    subject: content.subject,
    html: content.html,
    text: content.text,
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    // Fail loudly (LYR-214 / P4)
    throw new Error(
      `Resend rejected email (HTTP ${response.status}): ${errorText.slice(0, 300)}`,
    )
  }

  recordEmailSent(report.id, normalizedTo, type)
  return { ok: true }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function escapeHtmlAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
