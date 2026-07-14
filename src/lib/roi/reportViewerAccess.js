// ─────────────────────────────────────────────────────────────────────────────
// resolveReportViewerAccess — shared SSR auth/access resolution for a single
// report, used by both pages/report/[id].jsx and pages/report/[id]/validate.jsx
// so the share-link / employee / owner / bulk gating logic lives in one place.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient, createAdminClient } from '@/src/lib/supabase-server'
import { isEmployeeUser } from '@/src/lib/isEmployee'
import { ROUTES, loginRedirect } from '@/src/lib/routes'
import { ensureUserRecord } from '@/src/lib/authHelpers'
import {
  hasReportAccess,
  getGrantForUser,
  getGrantByToken,
} from '@/src/lib/roi/reportGrants'

const REPORT_SELECT =
  'id, company_name, email, status, state_data, user_id, share_token, share_revoked_at, share_message_count, validated_at'

// Silently claim a colleague invite: mint + verify a fresh magic-link OTP
// for the invited email server-side, in this same request, exactly like
// pages/auth/alpha.js does for alpha invites — the visitor never sees a
// separate sign-in step. An invite link names a specific person, so if a
// *different* identity happens to already be active in this browser (some
// unrelated stale session), we switch to the invited one rather than
// silently ignoring the invite — that silent-ignore is what previously left
// grants stuck "pending" forever and let whoever was already logged in
// (often the report owner, mid-testing) see themselves as if they were the
// invited colleague. We only skip the swap if the existing session is
// already the right person, or is the report owner opening their own
// invite link (nothing to switch to).
async function claimInviteIfPresent({ admin, supabase, report, inviteToken }) {
  if (!inviteToken) return

  const grant = await getGrantByToken({
    admin,
    reportId: report.id,
    token: inviteToken,
  })
  if (!grant) return

  const {
    data: { user: existingUser },
  } = await supabase.auth.getUser()
  if (existingUser) {
    const alreadyRightPerson =
      existingUser.id === report.user_id ||
      existingUser.email?.toLowerCase() === grant.invited_email?.toLowerCase()
    if (alreadyRightPerson) return
    await supabase.auth.signOut()
  }

  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: grant.invited_email,
    })
  if (linkError) return

  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: linkData.properties.hashed_token,
  })
  if (verifyError) return

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const { error: ensureError } = await ensureUserRecord(user.id, user.email, {
    skipWhitelist: true,
  })
  if (ensureError) return

  if (!grant.user_id) {
    await admin
      .from('chat_usage')
      .update({ user_id: user.id })
      .eq('id', grant.id)
  }
}

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
  const inviteToken = typeof query?.invite === 'string' ? query.invite : null
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
    await claimInviteIfPresent({
      admin,
      supabase,
      report,
      inviteToken,
    })

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

    const grant = await getGrantForUser({
      admin,
      reportId: report.id,
      userId: user.id,
    })

    if (!hasReportAccess({ report, userId: user.id, isEmployee, grant })) {
      return { redirect: { destination: ROUTES.dashboard, permanent: false } }
    }

    if (!isEmployee && report.status !== 'SUCCESS') {
      return { redirect: { destination: ROUTES.dashboard, permanent: false } }
    }
  }

  const isOwner = !isShareLink && viewerUserId === report.user_id

  return {
    report,
    isShareLink,
    isEmployee,
    isBulk,
    viewerUserId,
    viewerEmail,
    isAlpha,
    isOwner,
    // Passed hasReportAccess without being the owner, an employee, or a
    // share-link visitor — the only way that's possible is a claimed
    // colleague grant.
    isColleague: !isShareLink && !isEmployee && !isOwner,
    token: isShareLink ? token : null,
  }
}
