import { createRouteClient } from '../../../../src/lib/supabaseRouteClient'
import { getRoleForUser } from '../../../../src/lib/authHelpers'
import { getSupabaseAdmin } from '../../../../src/lib/supabaseAdmin'

export default async function handler(req, res) {
  if (req.method !== 'PATCH') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const supabase = createRouteClient(req, res)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const { role } = await getRoleForUser(user.id)
  if (role !== 'EMPLOYEE') {
    res.status(403).json({ error: 'Forbidden' })
    return
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { id } = req.query
  const { revoked } = req.body ?? {}

  const { data: invite, error } = await supabaseAdmin
    .from('alpha_invites')
    .update({ revoked_at: revoked ? new Date().toISOString() : null })
    .eq('id', id)
    .select('id, email, full_name, created_at, last_used_at, revoked_at')
    .single()

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.status(200).json({ invite })
}
