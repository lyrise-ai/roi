import {
  createClient,
  createAdminClient,
} from '../../../src/lib/supabase-server'

export default async function handler(req, res) {
  const supabase = createClient(req, res)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'id is required' })

  const admin = createAdminClient()

  if (req.method === 'DELETE') {
    const isEmployee = user.email?.endsWith('@lyrise.ai') === true
    if (!isEmployee) return res.status(403).json({ error: 'Forbidden' })

    const { error } = await admin.from('reports').delete().eq('id', id)

    if (error) {
      console.error('[delete-report]', error)
      return res.status(500).json({ error: 'Failed to delete report' })
    }

    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
