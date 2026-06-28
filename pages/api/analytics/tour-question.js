// POST /api/analytics/tour-question
// Notifies the team when an alpha user says they have questions after the demo tour.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end()
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[tour-question] RESEND_API_KEY not set, skipping email')
    return res.status(200).json({ ok: true, skipped: true })
  }

  const { email, companyName, question } = req.body ?? {}

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
        subject: '❓ Alpha user has questions after the demo tour',
        html: `
          <p>An alpha user finished the demo tour and said they have questions.</p>
          <table style="border-collapse:collapse;margin-top:12px;font-size:14px;">
            <tr>
              <td style="padding:4px 16px 4px 0;color:#6b7280;font-weight:600;">Email</td>
              <td style="padding:4px 0;">${email ?? '—'}</td>
            </tr>
            <tr>
              <td style="padding:4px 16px 4px 0;color:#6b7280;font-weight:600;">Company</td>
              <td style="padding:4px 0;">${companyName ?? '—'}</td>
            </tr>
            ${
              question
                ? `
            <tr>
              <td style="padding:4px 16px 4px 0;color:#6b7280;font-weight:600;vertical-align:top;">Their question</td>
              <td style="padding:4px 0;">${question}</td>
            </tr>
            `
                : `
            <tr>
              <td colspan="2" style="padding:12px 0 0;font-size:12px;color:#9ca3af;">
                They didn't type a specific question — reach out to learn more.
              </td>
            </tr>
            `
            }
          </table>
        `,
      }),
    })
  } catch (err) {
    console.error('[tour-question] failed to send:', err)
  }

  return res.status(200).json({ ok: true })
}
