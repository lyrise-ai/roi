// POST /api/alpha/progress — the only write path into alpha_feedback.
// alpha_feedback is RLS-locked (service-role only, no client-facing
// policies), so every question answer and funnel flag the tour records has
// to come through here instead of a client-side supabase.from(...) call.
//
// The client sends { session_token, ...fields }. The server, not the client,
// resolves identity: user_id from the authenticated session, invite_id from
// that session's user_metadata (set once at invite-creation time, see
// pages/api/admin/alpha-invites/index.js). Only whitelisted fields are ever
// merged into the upsert — arbitrary client input never reaches the row.

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
  'reached_intake',
  'reached_generation',
  'reached_validation',
  'reached_report',
  'reached_survey',
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
