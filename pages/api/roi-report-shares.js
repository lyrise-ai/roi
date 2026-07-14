/* eslint-disable no-console */
// ─────────────────────────────────────────────────────────────────────────────
// GET/DELETE /api/roi-report-shares — manage colleague invites on a report.
// Owner + employees only: any accessor can create an invite (via
// /api/roi-share-email), but only the owner/employee can see the full list
// or revoke someone else's access.
//
// GET  ?reportId=…              -> { shares: [{ id, invitedEmail, claimed, messageCount }] }
// DELETE { reportId, grantId }  -> { ok: true }
// ─────────────────────────────────────────────────────────────────────────────

import { createClient, createAdminClient } from '../../src/lib/supabase-server'
import { isEmployeeUser } from '@/src/lib/isEmployee'
import {
  listColleagueInvites,
  revokeColleagueInvite,
} from '@/src/lib/roi/reportGrants'

export default async function handler(req, res) {
  if (!['GET', 'DELETE'].includes(req.method)) {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const supabase = createClient(req, res)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const reportId =
    req.method === 'GET' ? req.query?.reportId : req.body?.reportId

  if (!reportId || typeof reportId !== 'string') {
    res.status(400).json({ error: 'reportId is required' })
    return
  }

  const admin = createAdminClient()
  const [{ data: userData }, { data: report }] = await Promise.all([
    admin.from('users').select('role').eq('id', user.id).single(),
    admin.from('reports').select('id, user_id').eq('id', reportId).single(),
  ])

  const isEmployee = isEmployeeUser(user, userData)

  if (!report || (!isEmployee && report.user_id !== user.id)) {
    res.status(403).json({ error: 'Unauthorized' })
    return
  }

  if (req.method === 'GET') {
    const invites = await listColleagueInvites({
      admin,
      reportId,
      ownerUserId: report.user_id,
    })
    res.status(200).json({
      shares: invites.map((row) => ({
        id: row.id,
        invitedEmail: row.invited_email,
        claimed: !!row.user_id,
        messageCount: row.message_count,
      })),
    })
    return
  }

  // DELETE
  const { grantId } = req.body ?? {}
  if (!grantId) {
    res.status(400).json({ error: 'grantId is required' })
    return
  }
  try {
    await revokeColleagueInvite({ admin, reportId, grantId })
    res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[roi-report-shares] revoke error:', err)
    res.status(500).json({ error: err?.message ?? 'Failed to revoke access' })
  }
}
