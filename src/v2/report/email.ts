// ─────────────────────────────────────────────────────────────────────────────
// email — Profit Map V2 Report Email Delivery (LYR-237 / LYR-248)
// ─────────────────────────────────────────────────────────────────────────────

import { outboundEmailBlockedReason } from '@/src/lib/outboundEmail'
import type { ReportModel } from '@/src/v2/report/reportModel'

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DEFAULT_FROM = 'LyRise AI <reports@roi.lyrise.ai>'
const DEFAULT_PUBLIC_BASE = 'https://roi.lyrise.ai'

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

export interface EmailContent {
  subject: string
  html: string
  text: string
}

function totalsCopy(model: ReportModel): {
  hours: string
  gain: string
  od: string
  failure: string
} {
  if (!model.totals.ok) {
    return {
      hours: '',
      gain: '',
      od: '',
      failure: 'message' in model.totals ? model.totals.message : '',
    }
  }
  return {
    hours: model.totals.hours,
    gain: model.totals.gain,
    od: model.totals.od,
    failure: '',
  }
}

function textFigures(model: ReportModel): string[] {
  const totals = totalsCopy(model)
  if (totals.failure) return [totals.failure]
  return [
    `Hours Returned: ${totals.hours}`,
    `Operational Dividend: ${totals.od}`,
    `Total Financial Gain: ${totals.gain}`,
  ]
}

function htmlFigures(model: ReportModel): string {
  const totals = totalsCopy(model)
  if (totals.failure) {
    return `<div class="stat"><div class="stat-val">${escapeHtml(totals.failure)}</div></div>`
  }
  return [
    ['Hours Returned', totals.hours],
    ['Operational Dividend', totals.od],
    ['Total Financial Gain', totals.gain],
  ]
    .map(
      ([label, value]) =>
        `<div class="stat"><div class="stat-label">${label}</div><div class="stat-val">${escapeHtml(value)}</div></div>`,
    )
    .join('')
}

export function generateReportEmailContent(
  model: ReportModel,
  companyName: string,
  type: 'self' | 'colleague',
  options: { senderName?: string; publicUrl: string },
): EmailContent {
  const name = companyName || 'Your company'
  const sender = options.senderName?.trim() || 'A colleague'
  const subject =
    type === 'self'
      ? `Your LyRise Profit Map: ${name}`
      : `${sender} shared the LyRise Profit Map for ${name}`
  const opening =
    type === 'self'
      ? `Here is the LyRise Profit Map we prepared for ${name}.`
      : `${sender} completed a LyRise Profit Map for ${name} and shared the results with you.`
  const figures = textFigures(model)
  const text = [
    opening,
    '',
    model.thesis,
    '',
    ...figures,
    '',
    type === 'self'
      ? 'Review your full report and calculations:'
      : 'Review the full breakdown and calculations:',
    options.publicUrl,
  ]
    .filter(Boolean)
    .join('\n')
  const subtitle =
    model.thesis ||
    'Here is the summary of potential returns identified for your business.'
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.5; color: #111827; margin: 0; padding: 24px; }
.container { max-width: 560px; margin: 0 auto; }
.heading { font-size: 20px; font-weight: 700; margin-bottom: 12px; }
.sub { color: #4b5563; font-size: 14px; margin-bottom: 24px; }
.card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 24px; }
.stat { margin-bottom: 12px; }.stat-label { font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; }.stat-val { font-size: 18px; font-weight: 700; margin-top: 2px; }
.btn { display: inline-block; background: #2957FF; color: #fff !important; padding: 12px 24px; border-radius: 9999px; text-decoration: none; font-weight: 600; margin: 16px 0; }
.footer { font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 32px; }
</style></head>
<body><div class="container">
<div class="heading">${escapeHtml(subject)}</div>
<div class="sub">${escapeHtml(subtitle)}</div>
<div class="card">${htmlFigures(model)}</div>
<a class="btn" href="${escapeHtmlAttr(options.publicUrl)}">Review report &amp; calculations</a>
<div class="footer">Review the methodology and detailed assumptions at:
<a href="${escapeHtmlAttr(options.publicUrl)}">${escapeHtml(options.publicUrl)}</a></div>
</div></body></html>`.trim()

  return { subject, html, text }
}

export interface SendReportEmailArgs {
  to: string
  reportId: string
  model: ReportModel
  companyName: string
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

export async function sendReportEmail({
  to,
  reportId,
  model,
  companyName,
  type,
  senderName,
  req,
}: SendReportEmailArgs): Promise<SendReportEmailResult> {
  const normalizedTo = to.trim().toLowerCase()
  if (!EMAIL_RE.test(normalizedTo)) {
    throw new Error(`Invalid recipient email address: "${to}"`)
  }
  if (isEmailAlreadySent(reportId, normalizedTo, type)) {
    return { ok: true, alreadySent: true }
  }

  const publicUrl = buildPublicReportUrl(reportId, req)
  const content = generateReportEmailContent(model, companyName, type, {
    senderName,
    publicUrl,
  })
  const blockedReason = outboundEmailBlockedReason()
  if (blockedReason) {
    console.warn(
      `[v2/email] Suppressed outbound email to ${normalizedTo} (${blockedReason})`,
    )
    recordEmailSent(reportId, normalizedTo, type)
    return { ok: true, suppressed: true, reason: blockedReason }
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured')
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || DEFAULT_FROM,
      to: [normalizedTo],
      subject: content.subject,
      html: content.html,
      text: content.text,
    }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(
      `Resend rejected email (HTTP ${response.status}): ${errorText.slice(0, 300)}`,
    )
  }
  recordEmailSent(reportId, normalizedTo, type)
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
