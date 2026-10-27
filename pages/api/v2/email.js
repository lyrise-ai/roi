// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v2/email — Profit Map V2 Report Email Dispatch (LYR-237)
//
// Sends report delivery emails to the creator ('self') or a named colleague
// ('colleague').
//
// Strictly lives in V2. Never imports from V1 routes or tables.
// ─────────────────────────────────────────────────────────────────────────────

import {
  EMAIL_RE,
  sendReportEmail,
  isEmailAlreadySent,
} from '@/src/v2/report/email'
import { buildReport } from '@/src/v2/report/buildReport'
import { loadReport } from '@/src/v2/report/savedReport'

export const config = {
  maxDuration: 60,
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ ok: false, error: 'Method not allowed' })
    return
  }
  const { reportId, type = 'self', to, senderName } = req.body ?? {}

  if (typeof reportId !== 'string' || !reportId.trim()) {
    res.status(400).json({ ok: false, error: 'A report id is required.' })
    return
  }

  if (!to || typeof to !== 'string' || !EMAIL_RE.test(to.trim())) {
    res
      .status(400)
      .json({ ok: false, error: 'A valid email address is required.' })
    return
  }

  if (type !== 'self' && type !== 'colleague') {
    res
      .status(400)
      .json({ ok: false, error: 'Email type must be "self" or "colleague".' })
    return
  }

  const recipient = to.trim().toLowerCase()

  const loaded = await loadReport(reportId)
  if (loaded.status !== 'ok') {
    const status =
      loaded.status === 'missing'
        ? 400
        : loaded.status === 'unreadable'
          ? 503
          : 404
    const error =
      loaded.status === 'unreadable'
        ? 'Could not read the saved report.'
        : 'Report not found.'
    res.status(status).json({ ok: false, error })
    return
  }
  const { report } = loaded
  const model = buildReport(report)

  // Check duplicate sends before contacting the email provider.
  if (isEmailAlreadySent(report.id, recipient, type)) {
    res.status(200).json({
      ok: true,
      alreadySent: true,
      message: 'This report was already sent to this address.',
    })
    return
  }

  // 3. Send email.
  try {
    const result = await sendReportEmail({
      to: recipient,
      reportId: report.id,
      model,
      companyName: report.company?.name || 'Your company',
      type,
      senderName,
      req,
    })

    res.status(200).json({
      ok: true,
      alreadySent: result.alreadySent || false,
      suppressed: result.suppressed || false,
      reason: result.reason,
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/email] Delivery failure:', err)
    // Fail loudly (LYR-214 / P4): return an error status and descriptive message
    res.status(502).json({
      ok: false,
      error: err.message || 'Email delivery failed.',
    })
  }
}
