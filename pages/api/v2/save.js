// POST /api/v2/save — saves a new V2 report once, at the reveal.
// Returns the claim token: only this browser gets it, and claiming needs it.

import { createRouteClient } from '@/src/lib/supabaseRouteClient'
import { SETTINGS } from '@/src/v2/report/miniCalculator'
import { saveReport } from '@/src/v2/report/savedReport'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ ok: false, error: 'Method not allowed' })
    return
  }

  // Only the answers come from the browser. The report is built from the
  // settings, research and words, so those are the server's.
  const { id, company, pains, words } = req.body ?? {}
  const observation =
    typeof words?.observation === 'string'
      ? { observation: words.observation }
      : {}

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
    research: {},
    words: observation,
    settings: SETTINGS,
  })

  if (!claimToken) {
    res.status(400).json({ ok: false, error: 'Could not save this report.' })
    return
  }

  res.status(200).json({ ok: true, reportId: id, ownerId, claimToken })
}
