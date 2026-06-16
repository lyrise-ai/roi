const DEFAULT_DEV_TEAM = [
  'mayar@lyrise.ai',
  'amira@lyrise.ai',
  'mbanoub@lyrise.ai',
  'elena@lyrise.ai',
  'adel@lyrise.ai',
  'yousef@lyrise.ai',
  'omar@lyrise.ai',
  'y.ashraf@lyrise.ai',
]

const DEV_TEAM = (process.env.DEV_ALERT_EMAILS ?? DEFAULT_DEV_TEAM.join(','))
  .split(',')
  .map((e) => e.trim())
  .filter(Boolean)

// Escape text interpolated into HTML element content. All values below come from
// the (unauthenticated) /api/notify-error request body, so they are untrusted.
function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

interface ParsedFrame {
  name: string
  file: string | null
  line: string | null
}

function parseAppFrames(stack: string): ParsedFrame[] {
  return stack
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.includes('node_modules'))
    .map((line) => {
      const match = line.match(
        /at (\w+) \(webpack-internal:\/\/\/\.\/(.+?):(\d+):\d+\)/,
      )
      if (match) return { name: match[1], file: match[2], line: match[3] }
      const fallback = line.match(/at (\w+)/)
      if (fallback) return { name: fallback[1], file: null, line: null }
      return null
    })
    .filter((f): f is ParsedFrame => f !== null)
}

export async function notifyDevTeam(opts: {
  error: string
  stack?: string
  context?: Record<string, string>
  userEmail?: string
  url?: string
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return

  const { error, stack, context, userEmail, url } = opts

  const frames = stack ? parseAppFrames(stack) : []
  const origin = frames[0]
  const chain = frames.map((f) => f.name).join(' → ')

  // Precomputed to avoid nested template literals in the markup below.
  const originLineSuffix = origin?.line ? `:${escapeHtml(origin.line)}` : ''
  const originLocationHtml = origin?.file
    ? `<span style="color:#6b7280;font-size:13px;margin-left:10px">${escapeHtml(
        origin.file,
      )}${originLineSuffix}</span>`
    : ''
  const subjectPrefix = origin ? `${origin.name} — ` : ''
  const filteredStack = stack
    ? stack
        .split('\n')
        .filter((l) => l && !l.includes('node_modules'))
        .join('\n')
        .trim()
    : null

  const metaRows = [
    `<tr>
      <td style="padding:6px 12px;color:#6b7280;font-size:13px;white-space:nowrap;width:80px">Time</td>
      <td style="padding:6px 12px;font-size:13px">${new Date().toISOString()}</td>
    </tr>`,
    userEmail
      ? `<tr style="background:#f9fafb">
          <td style="padding:6px 12px;color:#6b7280;font-size:13px;white-space:nowrap">User</td>
          <td style="padding:6px 12px;font-size:13px">${escapeHtml(
            userEmail,
          )}</td>
        </tr>`
      : '',
    url
      ? `<tr>
          <td style="padding:6px 12px;color:#6b7280;font-size:13px;white-space:nowrap">URL</td>
          <td style="padding:6px 12px;font-size:13px"><a href="${escapeHtml(
            url,
          )}" style="color:#2957FF">${escapeHtml(url)}</a></td>
        </tr>`
      : '',
    ...(context
      ? Object.entries(context).map(
          ([k, v], i) =>
            `<tr${i % 2 === 0 ? ' style="background:#f9fafb"' : ''}>
              <td style="padding:6px 12px;color:#6b7280;font-size:13px;white-space:nowrap">${escapeHtml(
                k,
              )}</td>
              <td style="padding:6px 12px;font-size:13px">${escapeHtml(v)}</td>
            </tr>`,
        )
      : []),
  ]
    .filter(Boolean)
    .join('')

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:680px;margin:0 auto">

      <!-- Header -->
      <div style="background:#dc2626;border-radius:8px 8px 0 0;padding:20px 24px">
        <p style="margin:0;color:#fca5a5;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase">LyRise Platform</p>
        <h1 style="margin:4px 0 0;color:#fff;font-size:20px;font-weight:700">Error Alert</h1>
      </div>

      <!-- Origin banner -->
      ${
        origin
          ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-top:none;padding:14px 24px;display:flex;align-items:center;gap:12px">
              <span style="font-size:18px">📍</span>
              <div>
                <span style="font-family:monospace;font-size:15px;font-weight:700;color:#991b1b">${escapeHtml(
                  origin.name,
                )}</span>
                ${originLocationHtml}
              </div>
            </div>`
          : ''
      }

      <!-- Error message -->
      <div style="padding:20px 24px;border:1px solid #e5e7eb;border-top:none">
        <p style="margin:0 0 6px;font-size:11px;font-weight:600;color:#6b7280;letter-spacing:.08em;text-transform:uppercase">Error message</p>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:12px 14px">
          <code style="font-family:monospace;font-size:13px;color:#b91c1c;word-break:break-all">${escapeHtml(
            error,
          )}</code>
        </div>
      </div>

      <!-- Meta table -->
      <div style="border:1px solid #e5e7eb;border-top:none;padding:20px 24px">
        <p style="margin:0 0 8px;font-size:11px;font-weight:600;color:#6b7280;letter-spacing:.08em;text-transform:uppercase">Details</p>
        <table style="border-collapse:collapse;width:100%;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden">
          ${metaRows}
        </table>
      </div>

      <!-- Component chain -->
      ${
        chain
          ? `<div style="padding:0 24px 20px;border:1px solid #e5e7eb;border-top:none">
              <p style="margin:0 0 8px;font-size:11px;font-weight:600;color:#6b7280;letter-spacing:.08em;text-transform:uppercase">Component chain</p>
              <p style="margin:0;font-family:monospace;font-size:12px;color:#374151;word-break:break-all">${escapeHtml(
                chain,
              )}</p>
            </div>`
          : ''
      }

      <!-- Stack trace -->
      ${
        filteredStack
          ? `<div style="padding:0 24px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
              <p style="margin:0 0 8px;font-size:11px;font-weight:600;color:#6b7280;letter-spacing:.08em;text-transform:uppercase">Stack trace (app code only)</p>
              <pre style="margin:0;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:12px 14px;font-size:11px;color:#6b7280;white-space:pre-wrap;word-break:break-all;overflow:auto">${escapeHtml(
                filteredStack,
              )}</pre>
            </div>`
          : ''
      }

    </div>
  `.trim()

  // Fire-and-forget: a failed alert must never throw into the request that
  // triggered it. But don't fail silently either — log so a broken alert
  // pipeline (bad key, quota, invalid `from`) is visible in server logs.
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: `LyRise Platform <${
          process.env.EMAIL_FROM ?? 'reports@roi.lyrise.ai'
        }>`,
        to: DEV_TEAM,
        subject: `[Platform Error] ${subjectPrefix}${error.slice(0, 60)}`,
        html,
      }),
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(
        `[notifyDevTeam] Resend HTTP ${res.status}: ${body.slice(0, 200)}`,
      )
    }
  } catch (err) {
    console.error('[notifyDevTeam] failed to send error alert:', err)
  }
}
