// V2 is staff-only until launch (LYR-270). Every call to this file comes out on
// launch day (LYR-255). Staff = role EMPLOYEE or an @lyrise.ai email, the same
// rule as V1's isEmployeeUser; V2 keeps its own copy.

import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseAdmin } from '@/src/lib/supabaseAdmin'
import { createRouteClient } from '@/src/lib/supabaseRouteClient'

// Off in CI (the browser tests aren't signed in) and on a developer's machine.
const LOCKED =
  process.env.NEXT_PUBLIC_ENV !== 'ci' && process.env.NODE_ENV !== 'development'

export async function isStaff(req: NextApiRequest, res: NextApiResponse) {
  if (!LOCKED) return true
  try {
    const {
      data: { user },
    } = await createRouteClient(req, res).auth.getUser()
    if (!user) return false
    if (user.email?.toLowerCase().endsWith('@lyrise.ai')) return true
    const { data } = await getSupabaseAdmin()
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    return data?.role === 'EMPLOYEE'
  } catch {
    return false
  }
}

// API routes: answers 403 for anyone who isn't staff.
export async function requireStaff(req: NextApiRequest, res: NextApiResponse) {
  if (await isStaff(req, res)) return true
  res
    .status(403)
    .json({ ok: false, error: 'This is open to LyRise staff only for now.' })
  return false
}

// Pages: sends anyone who isn't staff to the staff dashboard.
export const NOT_STAFF = {
  redirect: { destination: '/dashboard', permanent: false },
} as const
