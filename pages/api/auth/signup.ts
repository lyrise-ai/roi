import type { NextApiRequest, NextApiResponse } from 'next'
import { createRouteClient } from '../../../src/lib/supabaseRouteClient'
import { canSignUp, createUserRecord } from '../../../src/lib/authHelpers'
import { captureServer, flushPostHog } from '@/src/lib/posthog-server'

export default async function signupHandler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    const { email, password } = req.body
    const { allowed, role, error: checkError } = await canSignUp(email)
    if (!allowed) {
      return res
        .status(checkError === 'email not authorized' ? 403 : 500)
        .json({ error: checkError })
    }
    const supabase = createRouteClient(req, res)

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    })
    if (signUpError) {
      return res.status(400).json({ error: signUpError.message })
    }
    const { error: insertError } = await createUserRecord(
      email,
      data.user.id,
      role,
    )
    if (insertError) {
      return res.status(500).json({ error: insertError })
    }

    captureServer(
      'user_signed_up',
      { auth_method: 'password', role },
      data.user.id,
    )
    await flushPostHog()

    return res.status(200).json({ role })
  }
  return res.status(405).json({ error: 'method not allowed' })
}
