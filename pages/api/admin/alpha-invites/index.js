import crypto from 'node:crypto'
import { createRouteClient } from '../../../../src/lib/supabaseRouteClient'
import { getRoleForUser } from '../../../../src/lib/authHelpers'
import { supabaseAdmin } from '../../../../src/lib/supabaseAdmin'

function buildBaseUrl(req) {
  const explicit = process.env.NEXT_PUBLIC_BASE_URL
  const host = req.headers?.host
  const proto =
    req.headers?.['x-forwarded-proto'] ||
    (host && host.startsWith('localhost') ? 'http' : 'https')
  return explicit ?? (host ? `${proto}://${host}` : 'https://lyrise.ai')
}

export default async function handler(req, res) {
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

  if (req.method === 'GET') {
    const { data: invites, error } = await supabaseAdmin
      .from('alpha_invites')
      .select(
        'id, email, full_name, token, created_at, last_used_at, revoked_at',
      )
      .order('created_at', { ascending: false })

    if (error) {
      res.status(500).json({ error: error.message })
      return
    }

    const baseUrl = buildBaseUrl(req)
    res.status(200).json({
      invites: (invites ?? []).map(({ token, ...invite }) => ({
        ...invite,
        link: `${baseUrl}/auth/alpha?token=${token}`,
      })),
    })
    return
  }

  if (req.method === 'POST') {
    const { email, fullName } = req.body ?? {}
    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'email is required' })
      return
    }

    const normalizedEmail = email.trim().toLowerCase()
    const trimmedName = fullName ? String(fullName).trim() : null

    // generateLink creates the auth user if they don't exist yet and returns
    // their id either way. We don't use the link it returns (it's a
    // single-use Supabase link) — we only need it to resolve/create the user.
    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: normalizedEmail,
        options: {
          data: {
            alpha: true,
            ...(trimmedName ? { full_name: trimmedName } : {}),
          },
        },
      })

    if (linkError) {
      res.status(500).json({ error: linkError.message })
      return
    }

    const userId = linkData.user.id

    // Set metadata explicitly rather than relying on generateLink's `data`
    // option alone, since that's only reliably applied at user creation time.
    const { error: updateError } =
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...(linkData.user.user_metadata ?? {}),
          alpha: true,
          ...(trimmedName ? { full_name: trimmedName } : {}),
        },
      })
    if (updateError) {
      res.status(500).json({ error: updateError.message })
      return
    }

    const token = crypto.randomUUID().replace(/-/g, '')
    const { data: invite, error: insertError } = await supabaseAdmin
      .from('alpha_invites')
      .insert({
        email: normalizedEmail,
        full_name: trimmedName,
        token,
        user_id: userId,
        created_by: user.id,
      })
      .select('id, email, full_name, created_at, last_used_at, revoked_at')
      .single()

    if (insertError) {
      res.status(500).json({ error: insertError.message })
      return
    }

    const baseUrl = buildBaseUrl(req)
    res.status(200).json({
      invite: { ...invite, link: `${baseUrl}/auth/alpha?token=${token}` },
    })
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}
