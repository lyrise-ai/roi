// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v2/save — Persists a V2 Profit Map report
//
// Saves or updates a row in public.v2_reports via saveReport() (admin client).
// "A report can have no owner. owner_id stays empty until sign-in, and the link
// still works. The link is the key: a random UUID."
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@/src/lib/supabase-server'
import { saveReport } from '@/src/lib/roi/v2/savedReport'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ ok: false, error: 'Method not allowed' })
    return
  }

  const {
    id,
    company = {},
    pains = [],
    research = {},
    words = {},
    settings = {},
  } = req.body ?? {}

  if (!id || typeof id !== 'string' || !id.trim()) {
    res
      .status(400)
      .json({ ok: false, error: 'A valid report UUID is required.' })
    return
  }

  // Check if caller has an active user session
  let ownerId = null
  try {
    const supabase = createClient(req, res)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user && user.id) {
      ownerId = user.id
    }
  } catch {
    // Guest user without session
  }

  const success = await saveReport({
    id: id.trim(),
    owner_id: ownerId,
    company,
    pains,
    research,
    words,
    settings,
  })

  if (!success) {
    res.status(500).json({ ok: false, error: 'Failed to persist report.' })
    return
  }

  res.status(200).json({
    ok: true,
    reportId: id.trim(),
    ownerId,
  })
}
