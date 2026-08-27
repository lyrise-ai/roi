// ─────────────────────────────────────────────────────────────────────────────
// resolveReportViewerAccess — works out, on the server, whether the person
// asking is allowed to see one report. Both pages/report/[id].jsx and
// pages/report/[id]/validate.jsx call it, so the rules about share links,
// employees, owners and bulk reports live in one place instead of two.
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

// Accepts a colleague invite without the visitor noticing. We create and use a
// one-time sign-in link for the invited email here on the server, during this
// same request, exactly as pages/auth/alpha.js does for alpha invites. The
// visitor never sees a separate sign-in step.
//
// An invite link names one specific person. So if a DIFFERENT person happens to
// be signed in already in this browser — some leftover session — we switch to
// the invited person rather than quietly ignoring the invite. Quietly ignoring
// it is what used to leave invites stuck as "pending" forever, and let whoever
// was already signed in (often the report owner, testing) look like the invited
// colleague to themselves.
//
// We only skip the switch when the person already signed in IS the invited one,
// or is the report owner opening their own invite link — in which case there is
// nothing to switch to.
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

  // Supabase's magic-link generator only works cleanly for an email that
  // already has an account. For a genuinely new colleague — the common case —
  // checking the link fails with "expired" even a second after we made it. So
  // we create the account first, and then the same generate-and-check pair that
  // pages/auth/alpha.js uses actually works.
  // We ignore "already registered": the invited email may already have an
  // account from an earlier invite or an unrelated signup.
  const { error: createError } = await admin.auth.admin.createUser({
    email: grant.invited_email,
    email_confirm: true,
  })
  if (createError && createError.code !== 'email_exists') return

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

  // Always load the report once, including its sharing fields, so we can decide
  // whether a share link is enough before we insist on someone being signed
  // in.
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
    // They got through the access check without being the owner, an employee or
    // a share-link visitor. The only way that can happen is an accepted
    // colleague invite.
    isColleague: !isShareLink && !isEmployee && !isOwner,
    token: isShareLink ? token : null,
  }
}
