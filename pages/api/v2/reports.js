// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v2/reports — Lists the signed-in user's own reports
//
// Enforced by PostgreSQL RLS on public.v2_reports:
//   create policy "Users can read own v2 reports" using (auth.uid() = owner_id);
//
// Uses the authenticated client, so only the user's rows are returned by the database.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@/src/lib/supabase-server'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.status(405).json({ ok: false, error: 'Method not allowed' })
    return
  }

  const supabase = createClient(req, res)
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    res
      .status(401)
      .json({ ok: false, error: 'Must be signed in to list reports.' })
    return
  }

  // Database RLS enforces auth.uid() = owner_id automatically
  const { data: reports, error } = await supabase
    .from('v2_reports')
    .select(
      'id, owner_id, company, pains, research, words, settings, created_at, updated_at',
    )
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[api/v2/reports] Query failure:', error)
    res
      .status(500)
      .json({ ok: false, error: error.message || 'Failed to list reports.' })
    return
  }

  res.status(200).json({
    ok: true,
    reports: reports || [],
  })
}
