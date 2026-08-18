/* eslint-disable no-console */
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/roi-share-email — "Send via email". Used both by the report
// toolbar (send/resend to your own stored address) and the report-ending
// panel's "Loop in a colleague" card (send to anyone). Same endpoint either
// way — the only difference is what happens to the recipient:
//   - sending to your own address: reuses the existing share_token deep link
//   - sending to anyone else: provisions (or reuses) a colleague invite —
//     a chat_usage grant keyed by a durable, revocable token — and the
//     email links to /report/{id}?invite={token}, which silently
//     authenticates the colleague on arrival (see reportViewerAccess.js).
// Any accessor with legitimate report access (owner, employee, or an
// already-invited colleague) may use this, not just the owner.
//
// Body: { reportId: string, to: string }
// Response: { ok: true } | { error: string }
// ─────────────────────────────────────────────────────────────────────────────

import {
  loadTemplate,
  renderTemplate,
} from '@/src/lib/roi/pipeline/renderTemplate'
import { generatePdf } from '@/src/lib/roi/services/pdf'
import { sendReportEmail } from '@/src/lib/roi/services/email'
import { createClient, createAdminClient } from '../../src/lib/supabase-server'
import { buildStateFromReportRow } from '@/src/lib/roi/reportState'
import { isEmployeeUser } from '@/src/lib/isEmployee'
import {
  hasReportAccess,
  getGrantForUser,
  createColleagueInvite,
} from '@/src/lib/roi/reportGrants'
import { EVENTS } from '@/src/lib/analytics'
import { captureServer, flushPostHog } from '@/src/lib/posthog-server'

export const config = {
  maxDuration: 120,
}

const IS_DEV = process.env.NODE_ENV === 'development'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Prefer the request's own host over NEXT_PUBLIC_BASE_URL: the header always
// matches whatever domain actually served this request (production, a Vercel
// preview deploy, or localhost), whereas the env var is one fixed value per
// environment and easy to leave stale (e.g. copied from .env.local).
function buildBaseUrl(req) {
  const host = req.headers?.['x-forwarded-host'] || req.headers?.host
  if (host) {
    const proto =
      req.headers?.['x-forwarded-proto'] ||
      (host.startsWith('localhost') ? 'http' : 'https')
    return `${proto}://${host}`
  }
  return process.env.NEXT_PUBLIC_BASE_URL ?? 'https://lyrise.ai'
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const supabase = createClient(req, res)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const { reportId, to } = req.body ?? {}

  if (!reportId) {
    res.status(400).json({ error: 'reportId is required' })
    return
  }

  if (!to || typeof to !== 'string' || !EMAIL_RE.test(to.trim())) {
    res.status(400).json({ error: 'A valid recipient email is required' })
    return
  }
  const recipient = to.trim()

  const admin = createAdminClient()
  const [{ data: userData }, { data: report }] = await Promise.all([
    admin.from('users').select('role').eq('id', user.id).single(),
    admin
      .from('reports')
      .select(
        'id, user_id, company_name, email, input_data, state_data, rendered_html, rendered_full_html, share_token, share_revoked_at',
      )
      .eq('id', reportId)
      .single(),
  ])

  const isEmployee = isEmployeeUser(user, userData)
  const grant = report
    ? await getGrantForUser({ admin, reportId, userId: user.id })
    : null

  if (
    !report ||
    !hasReportAccess({ report, userId: user.id, isEmployee, grant })
  ) {
    res.status(403).json({ error: 'Unauthorized' })
    return
  }

  const state = buildStateFromReportRow(report)

  if (!state?.assembled) {
    res.status(400).json({ error: 'state.assembled is required' })
    return
  }

  const isSelf = recipient.toLowerCase() === (user.email ?? '').toLowerCase()

  if (IS_DEV) {
    res.status(200).json({ ok: true, skipped: true })
    return
  }

  try {
    const templateHtml = loadTemplate('roi-exec-template.html')
    const renderedHtml = renderTemplate(templateHtml, state.assembled)

    const company = state.assembled.roi_data?.company ?? 'Report'
    const slug = company
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    const filename = `LyRise_ROI_${slug}.pdf`

    const pdf = await generatePdf(renderedHtml, filename)

    let chatUrl
    const base = buildBaseUrl(req).replace(/\/$/, '')
    if (isSelf) {
      if (report.share_token && !report.share_revoked_at) {
        chatUrl = `${base}/report/${report.id}?t=${encodeURIComponent(
          report.share_token,
        )}`
      }
    } else {
      const invite = await createColleagueInvite({
        admin,
        reportId: report.id,
        email: recipient,
      })
      chatUrl = `${base}/report/${report.id}?invite=${encodeURIComponent(
        invite.invite_token,
      )}`
    }

    await sendReportEmail(
      recipient,
      company,
      pdf.base64,
      pdf.filename,
      undefined,
      chatUrl,
    )

    captureServer(
      EVENTS.REPORT_SHARED_VIA_EMAIL,
      { report_id: report.id, recipient_type: isSelf ? 'self' : 'colleague' },
      user.id,
    )
    await flushPostHog()
    res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[roi-share-email] Error:', err)
    res.status(500).json({ error: err?.message ?? 'Failed to send email' })
  }
}
