// POST /api/analytics/demo-event
// Records a demo tour interaction in the shared events table.
// Auth is optional — the form page is auth-gated so user will usually be
// logged in, but we accept unauthenticated writes too (share-link visitors).

import {
  createClient,
  createAdminClient,
} from '../../../src/lib/supabase-server'

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

  // Attempt to read the auth user — non-fatal if missing or session expired.
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

  return res.status(204).end()
}
