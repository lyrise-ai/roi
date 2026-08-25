// POST /api/alpha/progress — the only way to write into the alpha feedback
// table.
//
// That table is locked to the server's admin key, with no rules that let the
// browser touch it. So every answer and every "reached this step" flag the tour
// records has to come through here rather than straight from the browser.
//
// The browser sends a session id and some fields. The SERVER, not the browser,
// works out who they are: the user from their signed-in session, and the invite
// from that user's own account record, set once when the invite was created
// (see pages/api/admin/alpha-invites/index.js).
//
// Only fields on a fixed list are ever written. Nothing else the browser sends
// reaches the row.

import { createClient, createAdminClient } from '@/src/lib/supabase-server'

const WHITELISTED_FIELDS = new Set([
  'report_id',
  'chat_keywords',
  'intake_ease',
  'intake_ease_note',
  'trust_before',
  'trust_after',
  'validation_note',
  'report_clarity',
  'unclear_reason',
  'unclear_note',
  'pmf_disappointed',
  'pmf_who_benefits',
  'pmf_main_benefit',
  'pmf_improvement',
  'pmf_virality',
  'not_disappointed_reason',
  'intent_timeline',
  'reached_intake',
  'reached_generation',
  'reached_validation',
  'reached_report',
  'reached_survey',
  'step_credibility_choice',
  'step_credibility_comment',
])

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const supabase = createClient(req, res)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const { session_token: sessionToken, ...rest } = req.body ?? {}
  if (typeof sessionToken !== 'string' || !sessionToken) {
    return res.status(400).json({ error: 'session_token is required' })
  }

  const fields = {}
  for (const [key, value] of Object.entries(rest)) {
    if (WHITELISTED_FIELDS.has(key)) fields[key] = value
  }

  const admin = createAdminClient()
  const { error } = await admin.from('alpha_feedback').upsert(
    {
      session_token: sessionToken,
      user_id: user.id,
      invite_id: user.user_metadata?.invite_id ?? null,
      ...fields,
    },
    { onConflict: 'session_token' },
  )

  if (error) {
    console.error('[alpha/progress] upsert failed:', error)
    return res.status(500).json({ error: 'Failed to save progress' })
  }

  return res.status(200).json({ ok: true })
}
