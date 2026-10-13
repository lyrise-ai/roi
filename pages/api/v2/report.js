// POST /api/v2/report — saves the answers for a newly built V2 report.

import { createRouteClient } from '@/src/lib/supabaseRouteClient'
import { SETTINGS } from '@/src/v2/report/miniCalculator'
import { isReportId, saveReport } from '@/src/v2/report/savedReport'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ ok: false, error: 'Method not allowed' })
    return
  }

  const { id, company, pains } = req.body ?? {}
  if (
    !isReportId(id) ||
    !company ||
    typeof company !== 'object' ||
    Array.isArray(company) ||
    !Array.isArray(pains)
  ) {
    res.status(400).json({ ok: false, error: 'Invalid report details.' })
    return
  }

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
    words: {},
    settings: SETTINGS,
  })

  if (!claimToken) {
    res.status(400).json({ ok: false, error: 'Could not save this report.' })
    return
  }

  res.status(200).json({ ok: true, reportId: id, ownerId, claimToken })
}
