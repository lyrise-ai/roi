// ─────────────────────────────────────────────────────────────────────────────
// reportGrants — who besides the report owner may view/chat on a report, and
// the "Loop in a colleague" invite mechanism that grants that access.
//
// A colleague invite is just a chat_usage row created ahead of time
// (user_id null until first claimed), keyed by a durable, revocable
// invite_token. This gives each invited colleague their own chat quota for
// free (chat_usage is already per user+report) without a dedicated table.
// The invite-claim flow (silently minting + verifying a Supabase magic-link
// OTP on first visit) mirrors the existing alpha_invites pattern in
// pages/auth/alpha.js — same idea, applied to report sharing instead of
// alpha signup.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto'

/**
 * Does this authenticated user have legitimate access to this report —
 * as the owner, an employee, or an invited colleague with a claimed grant?
 */
export function hasReportAccess({ report, userId, isEmployee, grant }) {
  if (isEmployee) return true
  if (report.user_id === userId) return true
  return !!grant && grant.user_id === userId
}

/**
 * Look up this user's chat_usage row for this report, if any — used both
 * as the access grant (hasReportAccess) and the per-user quota record.
 */
export async function getGrantForUser({ admin, reportId, userId }) {
  if (!userId) return null
  const { data } = await admin
    .from('chat_usage')
    .select('id, user_id, invited_email, invite_token, message_count')
    .eq('report_id', reportId)
    .eq('user_id', userId)
    .maybeSingle()
  return data ?? null
}

/**
 * Look up a not-yet-claimed or already-claimed invite by its token.
 */
export async function getGrantByToken({ admin, reportId, token }) {
  if (!token) return null
  const { data } = await admin
    .from('chat_usage')
    .select('id, user_id, invited_email, invite_token, message_count')
    .eq('report_id', reportId)
    .eq('invite_token', token)
    .maybeSingle()
  return data ?? null
}

/**
 * Create (or reuse) a colleague invite for this report + email. Idempotent
 * per (report_id, invited_email) so re-sending to the same colleague doesn't
 * create duplicate grants or reset an already-claimed one.
 */
export async function createColleagueInvite({ admin, reportId, email }) {
  const normalizedEmail = email.trim().toLowerCase()

  const { data: existing } = await admin
    .from('chat_usage')
    .select('id, user_id, invite_token')
    .eq('report_id', reportId)
    .eq('invited_email', normalizedEmail)
    .maybeSingle()

  if (existing?.invite_token) return existing

  const token = crypto.randomBytes(24).toString('base64url')

  if (existing) {
    const { data: updated, error } = await admin
      .from('chat_usage')
      .update({ invite_token: token })
      .eq('id', existing.id)
      .select('id, user_id, invite_token')
      .single()
    if (error) throw error
    return updated
  }

  const { data: created, error } = await admin
    .from('chat_usage')
    .insert({
      report_id: reportId,
      user_id: null,
      invited_email: normalizedEmail,
      invite_token: token,
      message_count: 0,
    })
    .select('id, user_id, invite_token')
    .single()
  if (error) throw error
  return created
}

/**
 * List every colleague invite on a report (excluding the owner's own usage
 * row), claimed or still pending, for the "Shared with…" management list.
 */
export async function listColleagueInvites({ admin, reportId, ownerUserId }) {
  const { data } = await admin
    .from('chat_usage')
    .select('id, user_id, invited_email, message_count')
    .eq('report_id', reportId)
    .not('invite_token', 'is', null)

  return (data ?? []).filter((row) => row.user_id !== ownerUserId)
}

export async function revokeColleagueInvite({ admin, reportId, grantId }) {
  const { error } = await admin
    .from('chat_usage')
    .delete()
    .eq('report_id', reportId)
    .eq('id', grantId)
  if (error) throw error
}
