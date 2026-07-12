// PATCH /api/reports/[id]/validation — draft autosave for the validation
// wizard (src/components/ROIGenerator/Validation). Refresh-resilience only;
// the authoritative write happens once, at /api/reports/[id]/validate-finalize.

import { createClient, createAdminClient } from '@/src/lib/supabase-server'

export default async function handler(req, res) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const supabase = createClient(req, res)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'id is required' })

  const { validationData } = req.body ?? {}
  if (!validationData || typeof validationData !== 'object') {
    return res.status(400).json({ error: 'validationData is required' })
  }

  const admin = createAdminClient()
  const [{ data: userData }, { data: report }] = await Promise.all([
    admin.from('users').select('role').eq('id', user.id).single(),
    admin
      .from('reports')
      .select('user_id, validation_data, validated_at')
      .eq('id', id)
      .single(),
  ])

  if (!report) return res.status(404).json({ error: 'Not found' })

  const isEmployee =
    userData?.role === 'EMPLOYEE' || user.email?.endsWith('@lyrise.ai')
  if (!isEmployee && report.user_id !== user.id) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  // Already finalized — don't let a stale in-flight draft clobber the final
  // record (e.g. a late autosave firing after the user already finished).
  if (report.validated_at) {
    return res.status(200).json({ ok: true, skipped: true })
  }

  const merged = { ...(report.validation_data ?? {}), ...validationData }

  const { error } = await admin
    .from('reports')
    .update({ validation_data: merged })
    .eq('id', id)

  if (error) {
    console.error('[validation-draft]', error)
    return res.status(500).json({ error: 'Failed to save draft' })
  }

  return res.status(200).json({ ok: true })
}
