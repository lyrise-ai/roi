// POST /api/alpha-notify
// Sends a one-time notification to the internal team when an alpha tester
// opens the tour for the first time. Called client-side, fire-and-forget.

import { outboundEmailBlockedReason } from '@/src/lib/outboundEmail'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const blocked = outboundEmailBlockedReason()
  if (blocked) {
    console.warn(`[alpha-notify] suppressed tour notification (${blocked})`)
    res.status(200).json({ ok: true, skipped: true })
    return
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    // Non-fatal in dev — just log and return OK so the client isn't blocked
    console.warn('[alpha-notify] RESEND_API_KEY not set, skipping email')
    res.status(200).json({ ok: true, skipped: true })
    return
  }

  const { alphaToken } = req.body ?? {}
  const now = new Date().toLocaleString('en-GB', {
    timeZone: 'Africa/Cairo',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: 'LyRise AI <noreply@lyrise.ai>',
        to: ['mbanoub@lyrise.ai'],
        subject: '🧪 Alpha tester just started the tour',
        html: `
          <p>An alpha tester opened the ROI Report alpha tour link.</p>
          <table style="border-collapse:collapse;margin-top:12px;font-size:14px;">
            <tr>
              <td style="padding:4px 16px 4px 0;color:#6b7280;font-weight:600;">Time</td>
              <td style="padding:4px 0;">${now} (Cairo)</td>
            </tr>
            <tr>
              <td style="padding:4px 16px 4px 0;color:#6b7280;font-weight:600;">Session token</td>
              <td style="padding:4px 0;font-family:monospace;font-size:12px;">${alphaToken ?? '—'}</td>
            </tr>
          </table>
          <p style="margin-top:16px;font-size:12px;color:#9ca3af;">
            One notification per tester session — refreshing the page will not re-trigger this.
          </p>
        `,
      }),
    })
  } catch (err) {
    // Non-fatal — don't block the alpha user if the notification fails
    console.error('[alpha-notify] failed to send:', err)
  }

  res.status(200).json({ ok: true })
}
