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

  if (req.method === 'GET') {
    const [{ data: userData }, { data: report }] = await Promise.all([
      admin.from('users').select('role').eq('id', user.id).single(),
      admin
        .from('reports')
        .select('rendered_html, rendered_full_html, user_id')
        .eq('id', id)
        .single(),
    ])

    if (!report) return res.status(404).json({ error: 'Not found' })

    const isEmployee =
      userData?.role === 'EMPLOYEE' || user.email?.endsWith('@lyrise.ai')
    if (!isEmployee && report.user_id !== user.id)
      return res.status(403).json({ error: 'Forbidden' })

    return res.status(200).json({
      renderedHtml: report.rendered_html,
      renderedFullHtml: report.rendered_full_html,
    })
  }

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
