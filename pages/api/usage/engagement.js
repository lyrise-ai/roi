import {
  createClient,
  createAdminClient,
} from '../../../src/lib/supabase-server'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/usage/engagement?days=30
//
// Employee-gated. Aggregates SHARE-LINK RECIPIENT behaviour from the `events`
// table (chat_link_opened, chat_session_end, pdf_downloaded_share) plus the
// existing chat_message_sent_share. Answers: who opened "Edit with chat", how
// long they spent in the panel, whether they downloaded the PDF.
//
// Joins report company/email for readability. Session duration comes from
// chat_session_end.meta.durationMs when present, else is derived from the gap
// between the open and end timestamps.
// ─────────────────────────────────────────────────────────────────────────────

const SHARE_TYPES = [
  'chat_link_opened',
  'chat_session_end',
  'pdf_downloaded_share',
  'chat_message_sent_share',
]

// Recipient-activity tracking (opens, session time, downloads) only became
// complete on this date. Earlier `events` rows captured chat messages alone, so
// they render misleading partial rows (chat counts with empty opens/time/
// downloads). Floor the query here so the panel starts blank and fills in with
// fully-tracked activity going forward. The old events are kept in the DB — they
// still power other views (e.g. the dashboard Activity feed); we just exclude
// them from this panel.
const ENGAGEMENT_SINCE_FLOOR = '2026-06-10T00:00:00Z'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const supabase = createClient(req, res)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const admin = createAdminClient()
  const { data: userData } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  const isEmployee =
    userData?.role === 'EMPLOYEE' || user.email?.endsWith('@lyrise.ai')
  if (!isEmployee) return res.status(403).json({ error: 'Forbidden' })

  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365)
  const windowStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const floor = new Date(ENGAGEMENT_SINCE_FLOOR)
  // Never look further back than the floor, even on a wide "Last year" window.
  const since = (windowStart > floor ? windowStart : floor).toISOString()

  const { data: events, error } = await admin
    .from('events')
    .select('id, report_id, type, created_at, meta')
    .in('type', SHARE_TYPES)
    .gte('created_at', since)
    .order('created_at', { ascending: true })

  if (error) {
    return res
      .status(200)
      .json({ ready: false, error: error.message, totals: {}, perReport: [] })
  }

  const rows = events || []

  // Look up company/email for the reports referenced, for readable rows.
  const reportIds = [...new Set(rows.map((e) => e.report_id).filter(Boolean))]
  let reportMap = new Map()
  if (reportIds.length) {
    const { data: reports } = await admin
      .from('reports')
      .select('id, company_name, email')
      .in('id', reportIds)
    reportMap = new Map((reports || []).map((r) => [r.id, r]))
  }

  // Group per report.
  const perReportMap = new Map()
  const ensure = (id) => {
    if (!perReportMap.has(id)) {
      const r = reportMap.get(id) || {}
      perReportMap.set(id, {
        reportId: id,
        company: r.company_name || '—',
        email: r.email || '—',
        opens: 0,
        downloads: 0,
        chatMessages: 0,
        totalDurationMs: 0,
        sessions: 0,
        lastActivity: null,
        // Track the latest open without an end, to derive duration if needed.
        pendingOpenAt: null,
      })
    }
    return perReportMap.get(id)
  }

  rows.forEach((e) => {
    if (!e.report_id) return
    const r = ensure(e.report_id)
    r.lastActivity = e.created_at

    if (e.type === 'chat_link_opened') {
      r.opens += 1
      r.pendingOpenAt = e.created_at
    } else if (e.type === 'pdf_downloaded_share') {
      r.downloads += 1
    } else if (e.type === 'chat_message_sent_share') {
      r.chatMessages += 1
    } else if (e.type === 'chat_session_end') {
      r.sessions += 1
      let dur =
        e.meta && typeof e.meta.durationMs === 'number'
          ? e.meta.durationMs
          : null
      if (dur == null && r.pendingOpenAt) {
        dur =
          new Date(e.created_at).getTime() - new Date(r.pendingOpenAt).getTime()
      }
      if (typeof dur === 'number' && dur > 0) r.totalDurationMs += dur
      r.pendingOpenAt = null
    }
  })

  const perReport = [...perReportMap.values()]
    .map(({ pendingOpenAt, ...r }) => ({
      ...r,
      avgDurationMs: r.sessions
        ? Math.round(r.totalDurationMs / r.sessions)
        : 0,
    }))
    .sort((a, b) => (a.lastActivity < b.lastActivity ? 1 : -1))

  const totals = perReport.reduce(
    (acc, r) => ({
      reportsOpened: acc.reportsOpened + (r.opens > 0 ? 1 : 0),
      opens: acc.opens + r.opens,
      downloads: acc.downloads + r.downloads,
      chatMessages: acc.chatMessages + r.chatMessages,
      totalDurationMs: acc.totalDurationMs + r.totalDurationMs,
      sessions: acc.sessions + r.sessions,
    }),
    {
      reportsOpened: 0,
      opens: 0,
      downloads: 0,
      chatMessages: 0,
      totalDurationMs: 0,
      sessions: 0,
    },
  )
  totals.avgDurationMs = totals.sessions
    ? Math.round(totals.totalDurationMs / totals.sessions)
    : 0

  return res.status(200).json({ ready: true, totals, perReport })
}
