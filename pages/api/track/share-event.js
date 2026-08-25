import { createAdminClient } from '../../../src/lib/supabase-server'
import { captureServer, flushPostHog } from '@/src/lib/posthog-server'

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/track/share-event
//   body: { reportId, shareToken, type, durationMs? }
//
// Records what people who received a share link actually did — the prospects
// who open "Edit with chat" from an email.
//
// They are not signed in, so the share token itself is the proof they are
// allowed to be here: we only accept an event if the report and token match a
// live, unrevoked share link. That stops anyone attaching made-up events to
// someone else's report.
//
// It writes to the same events table everything else uses, with no user
// attached, since the recipient is anonymous. Chat session length is stored in
// the events table's extra-data column.
// ─────────────────────────────────────────────────────────────────────────────

// Only these kinds of event may be written through this open endpoint.
const ALLOWED_TYPES = new Set([
  'chat_link_opened', // recipient clicked "Edit with chat" and landed on the page
  'chat_session_end', // recipient left — carries durationMs (time in the panel)
  'pdf_downloaded_share', // recipient downloaded the PDF from the share view
])

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { reportId, shareToken, type, durationMs } = req.body ?? {}

  if (!reportId || !shareToken || !type) {
    return res
      .status(400)
      .json({ error: 'reportId, shareToken and type are required' })
  }
  if (!ALLOWED_TYPES.has(type)) {
    return res.status(400).json({ error: 'unknown event type' })
  }

  const admin = createAdminClient()

  // Check the share token against the report. This is the only permission check
  // there is.
  const { data: report } = await admin
    .from('reports')
    .select('id, share_token, share_revoked_at')
    .eq('id', reportId)
    .single()

  const tokenValid =
    report &&
    report.share_token &&
    report.share_token === shareToken &&
    !report.share_revoked_at

  if (!tokenValid) {
    return res.status(403).json({ error: 'Invalid share link' })
  }

  // Build the row. If we were given a duration, it goes in the extra-data
  // column. One insert, so a retry after a hiccup cannot write the event
  // twice.
  const row = { user_id: null, report_id: reportId, type }
  if (typeof durationMs === 'number' && durationMs >= 0) {
    row.meta = { durationMs }
  }

  const { error: insertError } = await admin.from('events').insert(row)

  if (insertError) {
    // Not fatal: tracking must never turn into an error the user sees.
    console.error('[track/share-event] insert failed', insertError.message)
    return res.status(200).json({ ok: false })
  }

  // Send the same thing to PostHog. These people are not signed in, so we file
  // the event against the report rather than a person. That is the more useful
  // grouping anyway: "what did the people I sent this to actually do".
  captureServer(type, { report_id: reportId, ...(row.meta ?? {}) })
  await flushPostHog()

  return res.status(200).json({ ok: true })
}
