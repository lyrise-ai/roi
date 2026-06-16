/* eslint-disable no-console */
import { supabaseAdmin } from '@/src/lib/supabaseAdmin'

const ALERT_TYPE = 'roi_usage_cost_threshold'
const LEASE_SECONDS = 5 * 60

function parseEmailList(value?: string): string[] {
  return (value ?? '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean)
}

function readPositiveNumber(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function formatUsd(value: number): string {
  return `$${value.toFixed(value >= 1 ? 2 : 4)}`
}

function buildDashboardUrl(): string {
  const base = (
    process.env.NEXT_PUBLIC_BASE_URL ??
    process.env.NEXTAUTH_URL ??
    'https://lyrise.ai'
  ).replace(/\/$/, '')
  return `${base}/dashboard/usage`
}

async function sendUsageAlertEmail(args: {
  recipients: string[]
  thresholdUsd: number
  windowDays: number
  totalCostUsd: number
  alertStep: number
  alertTriggerUsd: number
  reportCount: number
  latestCompany?: string | null
  latestMode?: string | null
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.EMAIL_FROM ?? 'reports@roi.lyrise.ai'

  if (!apiKey) {
    throw new Error('RESEND_API_KEY not configured')
  }

  const latestContext =
    args.latestCompany || args.latestMode
      ? `<p style="margin:0 0 16px;color:#374151;font-size:14px">
          Latest activity: <strong>${escapeHtml(
            args.latestCompany ?? 'Unknown company',
          )}</strong>
          (${escapeHtml(args.latestMode ?? 'unknown mode')}).
        </p>`
      : ''

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:680px;margin:0 auto">
      <div style="background:#b91c1c;border-radius:8px 8px 0 0;padding:20px 24px">
        <p style="margin:0;color:#fecaca;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase">LyRise ROI Monitoring</p>
        <h1 style="margin:4px 0 0;color:#fff;font-size:20px;font-weight:700">Spend threshold exceeded</h1>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:24px">
        <p style="margin:0 0 16px;color:#111827;font-size:15px">
          ROI usage reached <strong>${formatUsd(
            args.totalCostUsd,
          )}</strong> in the last
          <strong>${args.windowDays} days</strong>, crossing alert step
          <strong>${args.alertStep}</strong> at
          <strong>${formatUsd(args.alertTriggerUsd)}</strong>.
        </p>
        <p style="margin:0 0 16px;color:#374151;font-size:14px">
          Base alert increment: <strong>${formatUsd(
            args.thresholdUsd,
          )}</strong>. Reports included in this window:
          <strong>${args.reportCount}</strong>
        </p>
        ${latestContext}
        <p style="margin:0 0 18px">
          <a href="${buildDashboardUrl()}"
             style="display:inline-block;padding:10px 18px;background:#2957FF;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">
            Open usage dashboard
          </a>
        </p>
        <p style="margin:0;color:#6b7280;font-size:12px">
          We re-alert only when spend reaches the next ${formatUsd(
            args.thresholdUsd,
          )} step in this rolling ${args.windowDays}-day window.
        </p>
      </div>
    </div>
  `.trim()

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: `LyRise Monitoring <${fromEmail}>`,
      to: args.recipients,
      subject: `[ROI Usage Alert] Crossed ${formatUsd(
        args.alertTriggerUsd,
      )} in ${args.windowDays} days`,
      html,
    }),
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Resend HTTP ${res.status}: ${body.slice(0, 200)}`)
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function maybeSendUsageCostAlert(args: {
  reportId: string
  company?: string | null
  mode?: string | null
  incrementCostUsd?: number
}): Promise<void> {
  const allowInDev = process.env.ROI_USAGE_ALERTS_IN_DEV === 'true'
  if (process.env.NODE_ENV === 'development' && !allowInDev) return

  // Recipients are env-driven so we don't bake the team's addresses into the
  // repo. Prod must set ROI_USAGE_ALERT_EMAILS or alerts stay silent.
  const recipients = parseEmailList(
    process.env.ROI_USAGE_ALERT_EMAILS ?? process.env.DEV_ALERT_EMAILS,
  )
  if (!recipients.length) return
  if (!process.env.RESEND_API_KEY) return

  const thresholdUsd = readPositiveNumber(
    process.env.ROI_USAGE_ALERT_THRESHOLD_USD,
    10,
  )
  const windowDays = readPositiveNumber(
    process.env.ROI_USAGE_ALERT_WINDOW_DAYS,
    30,
  )
  const since = new Date(
    Date.now() - windowDays * 24 * 60 * 60 * 1000,
  ).toISOString()

  try {
    const { data: rows, error } = await supabaseAdmin
      .from('roi_usage')
      .select('cost_usd, company, mode, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })

    if (error) {
      console.warn('[roi-usage-alert] usage read failed:', error.message)
      return
    }

    const safeRows = rows ?? []
    const totalCostUsd = safeRows.reduce(
      (sum, row) => sum + Number(row.cost_usd || 0),
      0,
    )
    if (totalCostUsd < thresholdUsd) return
    const incrementCostUsd = Math.max(Number(args.incrementCostUsd || 0), 0)
    const previousWindowCostUsd = Math.max(totalCostUsd - incrementCostUsd, 0)
    const baselineStep = Math.floor(previousWindowCostUsd / thresholdUsd)
    const alertStep = Math.floor(totalCostUsd / thresholdUsd)

    const { data: claimed, error: claimError } = await supabaseAdmin.rpc(
      'claim_roi_usage_cost_alert',
      {
        p_alert_type: ALERT_TYPE,
        p_baseline_step: baselineStep,
        p_target_step: alertStep,
        p_lease_seconds: LEASE_SECONDS,
      },
    )

    if (claimError) {
      console.warn('[roi-usage-alert] claim failed:', claimError.message)
      return
    }
    if (!claimed) return

    const latestRow = safeRows[0]

    try {
      await sendUsageAlertEmail({
        recipients,
        thresholdUsd,
        windowDays,
        totalCostUsd,
        alertStep,
        alertTriggerUsd: alertStep * thresholdUsd,
        reportCount: safeRows.length,
        latestCompany: args.company ?? latestRow?.company ?? null,
        latestMode: args.mode ?? latestRow?.mode ?? null,
      })

      const { error: markError } = await supabaseAdmin.rpc(
        'mark_roi_usage_cost_alert_sent',
        {
          p_alert_type: ALERT_TYPE,
          p_total_cost_usd: totalCostUsd,
          p_sent_step: alertStep,
        },
      )
      if (markError) {
        console.warn('[roi-usage-alert] mark sent failed:', markError.message)
      }

      const { error: eventError } = await supabaseAdmin.from('events').insert({
        user_id: null,
        report_id: args.reportId,
        type: 'roi_usage_cost_alert_sent',
        meta: {
          thresholdUsd,
          windowDays,
          alertStep,
          alertTriggerUsd: alertStep * thresholdUsd,
          totalCostUsd,
          recipients,
        },
      })
      if (eventError) {
        console.warn(
          '[roi-usage-alert] audit event insert failed:',
          eventError.message,
        )
      }
    } catch (err) {
      await supabaseAdmin.rpc('release_roi_usage_cost_alert_claim', {
        p_alert_type: ALERT_TYPE,
      })
      throw err
    }
  } catch (err) {
    console.warn('[roi-usage-alert] failed:', err)
  }
}
