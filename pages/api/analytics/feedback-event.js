// POST /api/analytics/feedback-event
// Records what people do with the feedback widget — open it, abandon it, submit
// it, or hit an error — in the shared events table, so we can see where people
// drop out.
// Being signed in is optional: the widget can be opened by visitors who are
// not, such as people on a share link.

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
    // not signed in, which is fine — we write the row with no user on it
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

  // Send the same thing to PostHog. The database row above stays the real
  // record — it feeds the alpha dashboard and the usage pages. This is the copy
  // you can build a funnel from without writing SQL.
  captureServer(event_type, meta, userId)
  await flushPostHog()

  return res.status(204).end()
}
