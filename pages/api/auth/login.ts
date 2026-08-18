import type { NextApiRequest, NextApiResponse } from 'next'
import { createRouteClient } from '../../../src/lib/supabaseRouteClient'
import { getRoleForUser } from '../../../src/lib/authHelpers'
import { captureServer, flushPostHog } from '@/src/lib/posthog-server'

export default async function loginHandler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' })
  }

  const { email, password } = req.body

  const supabase = createRouteClient(req, res)

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  if (error) {
    return res.status(400).json({ error: error.message })
  }

  const { role, error: roleError } = await getRoleForUser(data.user.id)

  if (roleError) {
    return res.status(500).json({ error: roleError })
  }

  captureServer('user_logged_in', { auth_method: 'password' }, data.user.id)
  await flushPostHog()

  return res.status(200).json({
    role,
  })
}
