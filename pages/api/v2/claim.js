// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v2/claim — Claims an anonymous V2 report for a signed-in user
//
// Fills owner_id on the report row they just made after the reveal.
// The journey id and public share link remain completely unchanged.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@/src/lib/supabase-server'
import { claimReport } from '@/src/lib/roi/v2/savedReport'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ ok: false, error: 'Method not allowed' })
    return
  }

  const { reportId } = req.body ?? {}
  if (!reportId || typeof reportId !== 'string' || !reportId.trim()) {
    res.status(400).json({ ok: false, error: 'reportId is required.' })
    return
  }

  // Check authenticated session
  const supabase = createClient(req, res)
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    res
      .status(401)
      .json({ ok: false, error: 'Must be signed in to claim report.' })
    return
  }

  const success = await claimReport(reportId.trim(), user.id)
  if (!success) {
    res.status(500).json({ ok: false, error: 'Failed to claim report.' })
    return
  }

  res.status(200).json({
    ok: true,
    reportId: reportId.trim(),
    ownerId: user.id,
  })
}
