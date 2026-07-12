import { getSupabaseAdmin } from './supabaseAdmin'

type Role = 'EMPLOYEE' | 'CLIENT'

export async function getRoleForUser(userId: string) {
  const supabaseAdmin = getSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', userId)
    .maybeSingle()

  if (error) return { role: null, error: error.message }
  if (!data) return { role: null, error: null }
  return { role: data.role as Role, error: null }
}

export async function canSignUp(
  email: string,
  options: { skipWhitelist?: boolean } = {},
): Promise<{ allowed: boolean; role: Role | null; error: string | null }> {
  const supabaseAdmin = getSupabaseAdmin()
  if (email.endsWith('@lyrise.ai')) {
    if (!options.skipWhitelist) {
      const { data: whitelistRow, error: whitelistError } = await supabaseAdmin
        .from('employee_whitelist')
        .select('email')
        .eq('email', email)
        .maybeSingle()

      if (whitelistError) {
        return { allowed: false, role: null, error: 'whitelist check failed' }
      }
      if (!whitelistRow) {
        return { allowed: false, role: null, error: 'email not authorized' }
      }
    }
    return { allowed: true, role: 'EMPLOYEE', error: null }
  }

  return { allowed: true, role: 'CLIENT', error: null }
}

export async function createUserRecord(
  email: string,
  userId: string,
  role: Role,
) {
  const supabaseAdmin = getSupabaseAdmin()
  const { error } = await supabaseAdmin
    .from('users')
    .insert({ id: userId, email, role })

  if (error) return { error: error.message }
  return { error: null }
}

// Bootstraps the public.users row for a freshly-authenticated Supabase auth
// user (first login via OAuth or magic link). Rolls back the auth user if
// the app-level signup checks fail, since we don't want an orphaned auth
// user with no matching users row.
export async function ensureUserRecord(
  userId: string,
  email: string,
  options: { skipWhitelist?: boolean } = {},
): Promise<{ role: Role | null; error: string | null }> {
  const { role: existingRole, error: roleError } = await getRoleForUser(userId)
  if (roleError) return { role: null, error: roleError }
  if (existingRole) return { role: existingRole, error: null }

  const supabaseAdmin = getSupabaseAdmin()
  const { allowed, role, error: checkError } = await canSignUp(email, options)
  if (!allowed || checkError) {
    await supabaseAdmin.auth.admin.deleteUser(userId)
    return { role: null, error: checkError || 'email not authorized' }
  }

  const { error: insertError } = await createUserRecord(email, userId, role)
  if (insertError) {
    await supabaseAdmin.auth.admin.deleteUser(userId)
    return { role: null, error: insertError }
  }

  return { role, error: null }
}
