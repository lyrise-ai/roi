// Staff detection for the root landing redirect (LYR-255): signed-in staff at
// / are redirected to /dashboard. Everyone else sees the landing. Staff =
// role EMPLOYEE or an @lyrise.ai email, the same rule as V1's isEmployeeUser.

import type { IncomingMessage, ServerResponse } from 'http'
import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseAdmin } from '@/src/lib/supabaseAdmin'
import { createRouteClient } from '@/src/lib/supabaseRouteClient'

export async function isStaff(
  req: NextApiRequest | IncomingMessage,
  res: NextApiResponse | ServerResponse,
) {
  try {
    const {
      data: { user },
    } = await createRouteClient(req as any, res as any).auth.getUser()
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
