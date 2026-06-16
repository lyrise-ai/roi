// email - sends transactional ROI emails via Resend

export const DEFAULT_REPORT_BCC = ['elena@lyrise.ai', 'mbanoub@lyrise.ai']
const DEFAULT_REPORT_ACCESS_ALERT_EMAILS = DEFAULT_REPORT_BCC

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function parseEmailList(value?: string): string[] {
  return (value ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
}

function dedupeEmails(emails: string[]): string[] {
  return [...new Set(emails.map((email) => email.toLowerCase()))]
}

function getOpsAlertRecipients(): string[] {
  const configured = dedupeEmails([
    ...parseEmailList(process.env.ROI_REPORT_ACCESS_ALERT_EMAILS),
    ...parseEmailList(process.env.ROI_USAGE_ALERT_EMAILS),
  ])
  return configured.length > 0 ? configured : DEFAULT_REPORT_ACCESS_ALERT_EMAILS
}

async function sendResendEmail(
  payload: Record<string, unknown>,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.EMAIL_FROM ?? 'reports@roi.lyrise.ai'

  if (!apiKey) {
    throw new Error('RESEND_API_KEY not configured')
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: `LyRise AI <${fromEmail}>`,
      ...payload,
    }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Resend HTTP ${res.status}: ${body.slice(0, 200)}`)
  }
}

export async function sendReportEmail(
  recipientEmail: string,
  companyName: string,
  pdfBase64: string,
  filename: string,
  bcc: string[] = DEFAULT_REPORT_BCC,
  chatUrl?: string,
): Promise<void> {
  const chatCta = chatUrl
    ? `
        <p style="margin: 18px 0 8px;">Want to refine the numbers, change the currency, or ask follow-up questions?</p>
        <p style="margin: 0 0 18px;">
          <a href="${escapeHtmlAttr(chatUrl)}"
             style="display: inline-block; padding: 10px 18px; background: #2957FF; color: #fff;
                    text-decoration: none; border-radius: 6px; font-weight: 600;">
            Open editing chat
          </a>
        </p>
        <p style="font-size: 12px; color: #6b7280; margin: 0 0 16px;">
          Opens the live executive and full reports with our AI assistant - no login needed.
        </p>
      `
    : ''

  await sendResendEmail({
    to: [recipientEmail],
    bcc,
    subject: `Your AI Automation ROI Report - ${companyName}`,
    html: `
      <p>Hi,</p>
      <p>Please find attached your personalised AI Automation ROI Analysis for <strong>${companyName}</strong>,
      prepared by LyRise AI.</p>
      <p>This report models the financial impact of deploying targeted AI workflows across your operations.
      All figures are conservative estimates and should be validated with your actual volumes and rates.</p>
      ${chatCta}
      <p>Ready to explore next steps?
      <a href="https://api.leadconnectorhq.com/widget/bookings/strategy-call-with-lyrisesivto9">Book a 30-minute discovery call</a>.</p>
      <br>
      <p>Best,<br>Elena<br>LyRise AI - <a href="https://lyrise.ai">lyrise.ai</a></p>
    `.trim(),
    attachments: [
      {
        filename,
        content: pdfBase64,
      },
    ],
  })
}

type ReportAccessAlertArgs = {
  companyName?: string | null
  ownerEmail?: string | null
  viewerEmail?: string | null
  viewerUserId?: string | null
  reportId: string
  reportUrl: string
  accessType: string
}

export async function sendReportAccessAlert({
  companyName,
  ownerEmail,
  viewerEmail,
  viewerUserId,
  reportId,
  reportUrl,
  accessType,
}: ReportAccessAlertArgs): Promise<void> {
  const recipients = getOpsAlertRecipients()
  if (recipients.length === 0) return

  const safeCompany = companyName?.trim() || 'Unknown company'
  const safeOwnerEmail = ownerEmail?.trim() || 'Unknown'
  const safeViewerEmail = viewerEmail?.trim() || 'Anonymous visitor'
  const safeViewerUserId = viewerUserId?.trim() || 'N/A'

  await sendResendEmail({
    to: recipients,
    subject: `Report link accessed - ${safeCompany}`,
    html: `
      <p>A user opened an ROI report link.</p>
      <ul>
        <li><strong>Company:</strong> ${escapeHtmlAttr(safeCompany)}</li>
        <li><strong>Access type:</strong> ${escapeHtmlAttr(accessType)}</li>
        <li><strong>Report ID:</strong> ${escapeHtmlAttr(reportId)}</li>
        <li><strong>Report owner email:</strong> ${escapeHtmlAttr(safeOwnerEmail)}</li>
        <li><strong>Viewer email:</strong> ${escapeHtmlAttr(safeViewerEmail)}</li>
        <li><strong>Viewer user ID:</strong> ${escapeHtmlAttr(safeViewerUserId)}</li>
      </ul>
      <p>
        <a href="${escapeHtmlAttr(reportUrl)}">Open report</a>
      </p>
    `.trim(),
  })
}
