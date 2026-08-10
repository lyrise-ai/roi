// POST /api/linear/triage
// Creates a Linear issue in the team's Triage state from in-app feedback.
//
// Errors do NOT come through here — those arrive via PostHog's alert webhook
// at /api/posthog/linear-alert. Both share src/lib/linear.ts.
//
// NOTE: this route currently has no callers in the app. It is kept because the
// feedback-prompt UI that used it is expected back, but it is now behind the
// same shared secret as the PostHog webhook — it creates issues in our Linear
// workspace, and it was previously reachable by anyone who knew the URL.
// If the feedback prompt returns as browser-side code, swap this check for the
// Supabase session check used in pages/api/analytics/*, since a browser cannot
// hold a shared secret.

import { createLinearIssue } from '@/src/lib/linear'

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
    return false
  }
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function buildDescription(description, source) {
  const lines = []
  if (source) lines.push(`**Source:** ${source}`, '')
  if (description) lines.push(description)
  lines.push(
    '',
    '---',
    '*Routed automatically from user feedback. Approve to move into backlog.*',
  )
  return lines.join('\n')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const secret = process.env.POSTHOG_WEBHOOK_SECRET
  if (!secret) {
    console.error('[linear/triage] POSTHOG_WEBHOOK_SECRET not set')
    return res.status(503).json({ error: 'Endpoint not configured' })
  }

  const provided = (req.headers.authorization ?? '').replace(/^Bearer /i, '')
  if (!timingSafeEqual(provided, secret)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { title, description, source, priority = 3 } = req.body ?? {}
  if (!title) return res.status(400).json({ error: 'title is required' })

  const result = await createLinearIssue({
    title,
    description: buildDescription(description, source),
    priority,
    labelIds: [process.env.LINEAR_FEEDBACK_LABEL_ID].filter(Boolean),
  })

  if (!result.ok) return res.status(500).json({ error: result.error })
  return res.status(200).json(result)
}
