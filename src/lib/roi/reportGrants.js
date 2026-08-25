// ─────────────────────────────────────────────────────────────────────────────
// reportGrants — who, besides the owner, may view a report and chat on it, and
// how the "Loop in a colleague" invite gives them that access.
//
// A colleague invite is simply a row in the chat_usage table created in
// advance, with no user attached until someone first uses the link, and found
// by a long-lived invite token we can revoke. That gives each invited colleague
// their own chat allowance for free, because chat_usage is already counted per
// person per report — no extra table needed.
//
// Accepting an invite works by quietly creating and using a one-time sign-in
// link on the visitor's first visit. It is the same pattern as the alpha
// invites in pages/auth/alpha.js, applied to report sharing instead of
// signup.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto'

/**
 * Is this signed-in person actually allowed to see this report — as its owner,
 * as one of our employees, or as an invited colleague who accepted the invite?
 */
export function hasReportAccess({ report, userId, isEmployee, grant }) {
  if (isEmployee) return true
  if (report.user_id === userId) return true
  return !!grant && grant.user_id === userId
}

/**
 * Finds this person's chat_usage row for this report, if there is one. The same
 * row does two jobs: it is their permission to see the report, and it is where
 * their chat allowance is counted.
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
 * Finds an invite by its token, whether or not anyone has used it yet.
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
 * Creates a colleague invite for this report and email, or reuses the existing
 * one. Sending to the same colleague twice does not create a second invite and
 * does not reset one they have already accepted.
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
 * Lists every colleague invite on a report, accepted or still waiting, for the
 * "Shared with..." list. The owner's own row is left out.
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
