import { createRouteClient } from '../../src/lib/supabaseRouteClient'
import { ensureUserRecord } from '../../src/lib/authHelpers'

export async function getServerSideProps({ req, res, query }) {
  const { code } = query

  // Prefer ?next= query param (legacy path). Fall back to the auth_next cookie
  // set by login.js before the OAuth redirect — this is the primary path now,
  // since we no longer put ?next= in redirectTo (Supabase allowlist issue).
  let next = '/dashboard'
  if (query.next && query.next.startsWith('/')) {
    next = query.next
  } else if (req.cookies?.auth_next) {
    try {
      const decoded = decodeURIComponent(req.cookies.auth_next)
      if (decoded.startsWith('/')) next = decoded
    } catch {}
  }

  if (!code) {
    return { redirect: { destination: '/auth/login', permanent: false } }
  }

  const supabase = createRouteClient(req, res)
  const { error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code)
  if (exchangeError) {
    return { redirect: { destination: '/auth/login', permanent: false } }
  }

  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user.id
  const userEmail = userData.user.email

  const { error: ensureError } = await ensureUserRecord(userId, userEmail, {
    skipWhitelist: true,
  })
  if (ensureError) {
    return { redirect: { destination: '/auth/login', permanent: false } }
  }

  return { redirect: { destination: next, permanent: false } }
}

export default function Callback() {
  return null
}
