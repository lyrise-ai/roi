import { createRouteClient } from '../../src/lib/supabaseRouteClient'
import {
  getRoleForUser,
  canSignUp,
  createUserRecord,
} from '../../src/lib/authHelpers'
import { supabaseAdmin } from '../../src/lib/supabaseAdmin'

export async function getServerSideProps({ req, res, query }) {
  const { code } = query
  const next =
    query.next && query.next.startsWith('/') ? query.next : '/dashboard'
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

  let role
  const { role: existingRole, error: roleError } = await getRoleForUser(userId)
  if (roleError) {
    return { redirect: { destination: '/auth/login', permanent: false } }
  }

  if (existingRole) {
    role = existingRole
  } else {
    const {
      allowed,
      role: newRole,
      error: checkError,
    } = await canSignUp(userEmail, { skipWhitelist: true })
    if (!allowed || checkError) {
      await supabaseAdmin.auth.admin.deleteUser(userId)
      return { redirect: { destination: '/auth/login', permanent: false } }
    }

    const { error: insertError } = await createUserRecord(
      userEmail,
      userId,
      newRole,
    )
    if (insertError) {
      await supabaseAdmin.auth.admin.deleteUser(userId)
      return { redirect: { destination: '/auth/login', permanent: false } }
    }
    role = newRole
  }

  return { redirect: { destination: next, permanent: false } }
}

export default function Callback() {
  return null
}
