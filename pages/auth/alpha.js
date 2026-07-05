import { createClient, createAdminClient } from '../../src/lib/supabase-server'
import { ensureUserRecord } from '../../src/lib/authHelpers'

// Landing page for admin-issued alpha invite links (see
// /api/admin/alpha-invites). The `token` is our own durable, revocable
// identifier — not a Supabase one-time link — so employees can hand it out
// once and it keeps working until they revoke it. Each visit mints a fresh
// Supabase magic-link OTP behind the scenes and verifies it immediately via
// verifyOtp, server-side, so the visitor never sees an extra sign-in step.
export async function getServerSideProps({ req, res, query }) {
  const { token } = query
  if (typeof token !== 'string' || !token) {
    return { redirect: { destination: '/auth/login', permanent: false } }
  }

  const admin = createAdminClient()
  const { data: invite } = await admin
    .from('alpha_invites')
    .select('id, email, revoked_at')
    .eq('token', token)
    .maybeSingle()

  if (!invite || invite.revoked_at) {
    return { props: { invalid: true } }
  }

  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: invite.email,
    })
  if (linkError) {
    return { props: { invalid: true } }
  }

  const supabase = createClient(req, res)
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: linkData.properties.hashed_token,
  })
  if (verifyError) {
    return { props: { invalid: true } }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { props: { invalid: true } }
  }

  const { error: ensureError } = await ensureUserRecord(user.id, user.email, {
    skipWhitelist: true,
  })
  if (ensureError) {
    return { props: { invalid: true } }
  }

  await admin
    .from('alpha_invites')
    .update({ user_id: user.id, last_used_at: new Date().toISOString() })
    .eq('id', invite.id)

  return { redirect: { destination: '/roi-report', permanent: false } }
}

export default function AlphaSignIn({ invalid }) {
  if (!invalid) return null
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: 24,
        fontFamily: 'inherit',
      }}
    >
      <div>
        <h1 style={{ fontSize: 18, marginBottom: 8 }}>
          This invite link isn&apos;t active
        </h1>
        <p style={{ fontSize: 14, color: '#6B7280' }}>
          Ask whoever sent this link for a new one.
        </p>
      </div>
    </div>
  )
}
