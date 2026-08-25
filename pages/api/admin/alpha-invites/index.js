import crypto from 'node:crypto'
import { createRouteClient } from '../../../../src/lib/supabaseRouteClient'
import { getRoleForUser } from '../../../../src/lib/authHelpers'
import { getSupabaseAdmin } from '../../../../src/lib/supabaseAdmin'

// Use the domain this request actually came in on, rather than the one in the
// settings. The request always knows the real domain — production, a preview
// deploy, or localhost — while the setting is one fixed value per environment
// and easy to leave out of date, for instance by copying it from .env.local.
function buildBaseUrl(req) {
  const host = req.headers?.['x-forwarded-host'] || req.headers?.host
  if (host) {
    const proto =
      req.headers?.['x-forwarded-proto'] ||
      (host.startsWith('localhost') ? 'http' : 'https')
    return `${proto}://${host}`
  }
  return process.env.NEXT_PUBLIC_BASE_URL ?? 'https://lyrise.ai'
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

  const supabaseAdmin = getSupabaseAdmin()

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

    const { data: existingActive } = await supabaseAdmin
      .from('alpha_invites')
      .select('id')
      .eq('email', normalizedEmail)
      .is('revoked_at', null)
      .maybeSingle()

    if (existingActive) {
      res.status(409).json({
        error:
          'An active invite already exists for this email. Revoke it below before creating a new one.',
      })
      return
    }

    // This call creates the account if it does not exist yet, and returns its id
    // either way. We throw away the link it gives back — it can only be used
    // once. We are only here to find or create the user.
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
      // This error code means "that already exists". It happens when two
      // requests for the same email slip past the check above at the same
      // moment.
      if (insertError.code === '23505') {
        res.status(409).json({
          error:
            'An active invite already exists for this email. Revoke it below before creating a new one.',
        })
        return
      }
      res.status(500).json({ error: insertError.message })
      return
    }

    // We set this on the account ourselves rather than relying on the option in
    // the call above, which only reliably applies when the account is first
    // created.
    // Storing the invite's id here lets every later feedback write find this
    // invite without a privileged lookup, which matters because the invites
    // table cannot be read from the browser at all — see
    // pages/api/alpha/progress.js.
    const { error: updateError } =
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...(linkData.user.user_metadata ?? {}),
          alpha: true,
          invite_id: invite.id,
          ...(trimmedName ? { full_name: trimmedName } : {}),
        },
      })
    if (updateError) {
      res.status(500).json({ error: updateError.message })
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
