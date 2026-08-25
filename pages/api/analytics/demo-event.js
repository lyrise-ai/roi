// POST /api/analytics/demo-event
// Records one interaction with the demo tour in the shared events table.
// Being signed in is optional. The form page needs a sign-in, so usually they
// are — but we accept writes from people who are not, such as share-link
// visitors.

import {
  createClient,
  createAdminClient,
} from '../../../src/lib/supabase-server'
import { captureServer, flushPostHog } from '@/src/lib/posthog-server'

const VALID_TYPES = new Set([
  'demo_tour_started',
  'demo_tour_step_view',
  'demo_tour_skipped',
  'demo_tour_completed',
  'demo_tour_chip_clicked',
  'demo_tour_post_feedback',
])

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end()
  }

  const {
    event_type,
    step_index,
    session_id,
    company_name,
    email,
    time_spent_ms,
    feedback_response,
    feedback_detail,
  } = req.body ?? {}

  if (!VALID_TYPES.has(event_type)) {
    return res.status(400).json({ error: 'Invalid event_type' })
  }
  if (typeof session_id !== 'string' || session_id.length < 8) {
    return res.status(400).json({ error: 'Invalid session_id' })
  }
  if (step_index !== undefined && step_index !== null) {
    const n = Number(step_index)
    if (!Number.isInteger(n) || n < 0 || n > 10) {
      return res.status(400).json({ error: 'Invalid step_index' })
    }
  }

  // Try to see who is signed in. Fine if nobody is, or the session has
  // expired.
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
    session_id,
    ...(step_index != null ? { step_index: Number(step_index) } : {}),
    ...(company_name
      ? { company_name: String(company_name).slice(0, 200) }
      : {}),
    ...(email ? { email: String(email).slice(0, 200) } : {}),
    ...(time_spent_ms != null && Number.isFinite(Number(time_spent_ms))
      ? { time_spent_ms: Math.round(Number(time_spent_ms)) }
      : {}),
    ...(feedback_response
      ? { feedback_response: String(feedback_response).slice(0, 200) }
      : {}),
    ...(feedback_detail
      ? { feedback_detail: String(feedback_detail).slice(0, 1000) }
      : {}),
  }

  const admin = createAdminClient()
  const { error } = await admin.from('events').insert({
    user_id: userId,
    type: event_type,
    meta,
  })

  if (error) {
    console.error('[demo-event] insert failed:', error.message)
    return res.status(500).json({ error: 'Failed to record event' })
  }

  // Send the same thing to PostHog. The database row above stays the real
  // record — it feeds the alpha dashboard and the usage pages. This is the copy
  // you can build a funnel from without writing SQL.
  captureServer(event_type, meta, userId)
  await flushPostHog()

  return res.status(204).end()
}
