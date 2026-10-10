// POST /api/v2/claim — gives an unowned report to the signed-in user, if they
// hold the claim token /api/v2/save handed to the browser that made it.

import { createRouteClient } from '@/src/lib/supabaseRouteClient'
import { claimReport } from '@/src/lib/roi/v2/savedReport'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ ok: false, error: 'Method not allowed' })
    return
  }

  const { reportId, claimToken } = req.body ?? {}

  const {
    data: { user },
  } = await createRouteClient(req, res).auth.getUser()
  if (!user) {
    res.status(401).json({ ok: false, error: 'Sign in to save this report.' })
    return
  }

  if (!(await claimReport(reportId, user.id, claimToken))) {
    res.status(409).json({ ok: false, error: 'This report cannot be claimed.' })
    return
  }

  res.status(200).json({ ok: true, reportId, ownerId: user.id })
}
