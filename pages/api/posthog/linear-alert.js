// POST /api/posthog/linear-alert
//
// Receives PostHog's error-tracking alert webhook (configured in PostHog under
// Error tracking → Alerting → HTTP Webhook) and opens a Linear issue in Triage.
// PostHog fires it once per *issue* created or reopened, not per occurrence, so
// this doesn't need its own deduplication.
//
// This is the only automated path to Linear. Sentry's native Linear
// integration must stay switched off in the Sentry dashboard, or every error
// opens two tickets.
//
// Auth: a bearer token in the Authorization header, set as a custom header on
// the PostHog webhook destination. The endpoint creates issues in our
// workspace, so it cannot be open.

import { createLinearIssue } from '@/src/lib/linear'

// PostHog doesn't publish the webhook body schema, and it differs by alert
// type. Rather than guess one shape and silently produce "undefined" tickets,
// try the plausible paths and fall back to something legible.
function pick(payload, ...paths) {
  for (const path of paths) {
    const value = path
      .split('.')
      .reduce((acc, key) => (acc == null ? acc : acc[key]), payload)
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
    return false
  }
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const secret = process.env.POSTHOG_WEBHOOK_SECRET
  if (!secret) {
    console.error('[posthog/linear-alert] POSTHOG_WEBHOOK_SECRET not set')
    return res.status(503).json({ error: 'Webhook not configured' })
  }

  const provided = (req.headers.authorization ?? '').replace(/^Bearer /i, '')
  if (!timingSafeEqual(provided, secret)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const payload = req.body ?? {}

  const title =
    pick(
      payload,
      'issue.name',
      'name',
      'title',
      'event.properties.$exception_type',
    ) ?? 'PostHog error'
  const detail = pick(
    payload,
    'issue.description',
    'description',
    'message',
    'event.properties.$exception_message',
  )
  const issueUrl = pick(payload, 'issue.url', 'url', 'issue_url')
  const issueId = pick(payload, 'issue.id', 'id', 'issue_id')
  const replayUrl = pick(payload, 'issue.session_replay_url', 'replay_url')

  // First real fire tells us the actual shape; keep it in the Vercel logs so
  // the pick() paths above can be tightened rather than guessed at forever.
  if (!issueUrl && !issueId) {
    console.warn(
      '[posthog/linear-alert] unrecognised payload shape, keys:',
      Object.keys(payload).join(','),
    )
  }

  const lines = ['**Source:** PostHog error tracking', '']
  if (detail) lines.push('```', detail.slice(0, 4000), '```', '')
  if (issueUrl) lines.push(`[Open in PostHog](${issueUrl})`)
  else if (issueId) lines.push(`PostHog issue id: \`${issueId}\``)
  if (replayUrl) lines.push(`[Watch the session replay](${replayUrl})`)
  lines.push(
    '',
    '---',
    '*Opened automatically when PostHog saw this error for the first time.*',
  )

  const result = await createLinearIssue({
    title,
    description: lines.join('\n'),
    // High: this fires on genuinely new errors, not on every occurrence.
    priority: 2,
    labelIds: [process.env.LINEAR_BUG_LABEL_ID].filter(Boolean),
  })

  if (!result.ok) return res.status(500).json({ error: result.error })
  return res.status(200).json(result)
}
