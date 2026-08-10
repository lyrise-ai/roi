// POST /api/analytics/feedback-event
// Records Sentry feedback widget open/abandon/submit/error interactions in
// the shared events table, so we can see funnel drop-off per touchpoint.
// Auth is optional — the widget can be triggered by unauthenticated visitors
// (e.g. share-link recipients).

import {
  createClient,
  createAdminClient,
} from '../../../src/lib/supabase-server'
import { captureServer, flushPostHog } from '@/src/lib/posthog-server'

const VALID_TYPES = new Set([
  'sentry_feedback_form_opened',
  'sentry_feedback_form_abandoned',
  'sentry_feedback_form_submitted',
  'sentry_feedback_form_error',
])

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end()
  }

  const { event_type, source, event_id, error_message } = req.body ?? {}

  if (!VALID_TYPES.has(event_type)) {
    return res.status(400).json({ error: 'Invalid event_type' })
  }

  let userId = null
  try {
    const supabase = createClient(req, res)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    userId = user?.id ?? null
  } catch {
    // unauthenticated — fine, we'll write without a user_id
  }

  const meta = {
    ...(source ? { source: String(source).slice(0, 100) } : {}),
    ...(event_id ? { event_id: String(event_id).slice(0, 200) } : {}),
    ...(error_message
      ? { error_message: String(error_message).slice(0, 500) }
      : {}),
  }

  const admin = createAdminClient()
  const { error } = await admin.from('events').insert({
    user_id: userId,
    type: event_type,
    meta,
  })

  if (error) {
    console.error('[feedback-event] insert failed:', error.message)
    return res.status(500).json({ error: 'Failed to record event' })
  }

  // Mirror to PostHog. The Supabase row above stays authoritative — it backs
  // the alpha dashboard and the usage pages — this is the copy you can slice
  // into a funnel without writing SQL.
  captureServer(event_type, meta, userId)
  await flushPostHog()

  return res.status(204).end()
}
