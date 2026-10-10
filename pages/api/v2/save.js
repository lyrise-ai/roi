// POST /api/v2/save — saves a new V2 report once, at the reveal.
// Returns the claim token: only this browser gets it, and claiming needs it.

import { createRouteClient } from '@/src/lib/supabaseRouteClient'
import { saveReport } from '@/src/lib/roi/v2/savedReport'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ ok: false, error: 'Method not allowed' })
    return
  }

  const { id, company, pains, research, words, settings } = req.body ?? {}

  // Signed in already? Then the report is theirs from the start.
  let ownerId = null
  try {
    const {
      data: { user },
    } = await createRouteClient(req, res).auth.getUser()
    ownerId = user?.id ?? null
  } catch {
    // A guest. The report stays unowned until they sign in.
  }

  const claimToken = await saveReport({
    id,
    owner_id: ownerId,
    company,
    pains,
    research,
    words,
    settings,
  })

  if (!claimToken) {
    res.status(400).json({ ok: false, error: 'Could not save this report.' })
    return
  }

  res.status(200).json({ ok: true, reportId: id, ownerId, claimToken })
}
