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
} from '@/src/lib/roi/v2/email'
import {
  getReportFromMemory,
  saveReportInMemory,
  SAMPLE_SAVED_REPORT,
} from '@/src/lib/roi/v2/savedReport'

export const config = {
  maxDuration: 60,
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ ok: false, error: 'Method not allowed' })
    return
  }

  const {
    reportId,
    type = 'self',
    to,
    senderName,
    report: clientReport,
  } = req.body ?? {}

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

  // 1. Resolve the report.
  let report = clientReport
  if (report && report.id) {
    saveReportInMemory(report)
  } else if (reportId) {
    report = getReportFromMemory(reportId)
  }

  // If running in demo mode or memory only, fall back to sample report if missing
  if (!report) {
    if (reportId === SAMPLE_SAVED_REPORT.id || !reportId) {
      report = SAMPLE_SAVED_REPORT
    } else {
      res.status(404).json({ ok: false, error: 'Report not found.' })
      return
    }
  }

  // 2. Check duplicate send early.
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
      report,
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
