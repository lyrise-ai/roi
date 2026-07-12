// ─────────────────────────────────────────────────────────────────────────────
// resolveReportViewerAccess — shared SSR auth/access resolution for a single
// report, used by both pages/report/[id].jsx and pages/report/[id]/validate.jsx
// so the share-link / employee / owner / bulk gating logic lives in one place.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient, createAdminClient } from '@/src/lib/supabase-server'
import { isEmployeeUser } from '@/src/lib/isEmployee'
import { ROUTES, loginRedirect } from '@/src/lib/routes'

const REPORT_SELECT =
  'id, company_name, email, status, state_data, user_id, share_token, share_revoked_at, share_message_count, validated_at'

/**
 * @param {{ req: object, res: object, params: { id: string }, query: object, resolvedUrl?: string }} ctx
 * @returns {Promise<{ redirect: { destination: string, permanent: boolean } } | {
 *   report: object,
 *   isShareLink: boolean,
 *   isEmployee: boolean,
 *   isBulk: boolean,
 *   viewerUserId: string | null,
 *   viewerEmail: string | null,
 *   isAlpha: boolean,
 *   token: string | null,
 * }>}
 */
export async function resolveReportViewerAccess({
  req,
  res,
  params,
  query,
  resolvedUrl,
}) {
  const supabase = createClient(req, res)
  const admin = createAdminClient()

  const token = typeof query?.t === 'string' ? query.t : null
  const isBulk = typeof query?.batch === 'string'
  let isAlpha = false

  // Always fetch the report once with its share fields so we can decide
  // whether to grant share-link access before requiring a Supabase session.
  const { data: report } = await admin
    .from('reports')
    .select(REPORT_SELECT)
    .eq('id', params.id)
    .single()

  if (!report) {
    return { redirect: { destination: '/dashboard', permanent: false } }
  }

  const isShareLink =
    !!token &&
    !!report.share_token &&
    token === report.share_token &&
    !report.share_revoked_at

  let isEmployee = false
  let viewerUserId = null
  let viewerEmail = null

  if (!isShareLink) {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return {
        redirect: { destination: loginRedirect(resolvedUrl), permanent: false },
      }
    }

    const { data: userData } = await admin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    isEmployee = isEmployeeUser(user, userData)
    viewerUserId = user.id
    viewerEmail = user.email ?? null
    isAlpha = user.user_metadata?.alpha === true

    if (!isEmployee && report.user_id !== user.id) {
      return { redirect: { destination: ROUTES.dashboard, permanent: false } }
    }

    if (!isEmployee && report.status !== 'SUCCESS') {
      return { redirect: { destination: ROUTES.dashboard, permanent: false } }
    }
  }

  return {
    report,
    isShareLink,
    isEmployee,
    isBulk,
    viewerUserId,
    viewerEmail,
    isAlpha,
    token: isShareLink ? token : null,
  }
}
