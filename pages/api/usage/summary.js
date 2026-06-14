import {
  createClient,
  createAdminClient,
} from '../../../src/lib/supabase-server'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/usage/summary?days=30
//
// Employee-gated. Returns aggregates for the monitoring dashboard:
//   - totals (cost, reports, tokens, avg duration) over the window
//   - perDay   : [{ day, costUsd, count }]            (cost & volume over time)
//   - perModel : [{ model, costUsd, totalTokens, calls }]
//   - perMode  : [{ mode, costUsd, count }]
//   - recent   : last 50 rows (with per-call breakdown for the expandable table)
//
// All aggregation is done here (small data volumes) so the page stays a thin
// renderer. Reads use the admin client; access is still gated by the employee
// check below, mirroring pages/api/reports/[id].js.
// ─────────────────────────────────────────────────────────────────────────────

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

  // Window: default last 30 days, clamped to [1, 365].
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const { data: rows, error } = await admin
    .from('roi_usage')
    .select(
      'id, report_id, user_id, created_at, company, mode, duration_ms, input_tokens, output_tokens, total_tokens, cost_usd, calls',
    )
    .gte('created_at', since)
    .order('created_at', { ascending: false })

  if (error) {
    // Most likely the migration hasn't been applied yet — surface a clear,
    // non-fatal signal the page can render as an empty/onboarding state.
    return res.status(200).json({
      ready: false,
      error: error.message,
      totals: emptyTotals(),
      perDay: [],
      perModel: [],
      perMode: [],
      recent: [],
    })
  }

  const safeRows = rows || []

  // ── Totals ─────────────────────────────────────────────────────────────────
  const totals = safeRows.reduce(
    (acc, r) => ({
      reports: acc.reports + 1,
      costUsd: acc.costUsd + Number(r.cost_usd || 0),
      totalTokens: acc.totalTokens + (r.total_tokens || 0),
      durationMs: acc.durationMs + (r.duration_ms || 0),
    }),
    { reports: 0, costUsd: 0, totalTokens: 0, durationMs: 0 },
  )
  totals.avgCostUsd = totals.reports ? totals.costUsd / totals.reports : 0
  totals.avgDurationMs = totals.reports ? totals.durationMs / totals.reports : 0

  // ── Per-day (cost + volume over time) ───────────────────────────────────────
  const dayMap = new Map()
  safeRows.forEach((r) => {
    const day = (r.created_at || '').slice(0, 10) // YYYY-MM-DD
    const cur = dayMap.get(day) || { day, costUsd: 0, count: 0 }
    cur.costUsd += Number(r.cost_usd || 0)
    cur.count += 1
    dayMap.set(day, cur)
  })
  const perDay = [...dayMap.values()].sort((a, b) => a.day.localeCompare(b.day))

  // ── Per-model (rolled up from the per-call JSONB) ───────────────────────────
  const modelMap = new Map()
  safeRows.forEach((r) => {
    ;(r.calls || []).forEach((c) => {
      const cur = modelMap.get(c.model) || {
        model: c.model,
        costUsd: 0,
        totalTokens: 0,
        calls: 0,
      }
      cur.costUsd += Number(c.costUsd || 0)
      cur.totalTokens += c.totalTokens || 0
      cur.calls += 1
      modelMap.set(c.model, cur)
    })
  })
  const perModel = [...modelMap.values()].sort((a, b) => b.costUsd - a.costUsd)

  // ── Per-mode (generate vs chat) ─────────────────────────────────────────────
  const modeMap = new Map()
  safeRows.forEach((r) => {
    const cur = modeMap.get(r.mode) || { mode: r.mode, costUsd: 0, count: 0 }
    cur.costUsd += Number(r.cost_usd || 0)
    cur.count += 1
    modeMap.set(r.mode, cur)
  })
  const perMode = [...modeMap.values()]

  const recent = await withRequesterEmail(admin, safeRows.slice(0, 50))

  return res.status(200).json({
    ready: true,
    totals,
    perDay,
    perModel,
    perMode,
    recent,
  })
}

// Tags each row with the email of the user who requested the report — the
// authenticated account that submitted the request, NOT the company contact
// the report is addressed to (mirrors withRequester in pages/dashboard.jsx).
// Older roi_usage rows may have a null user_id, so fall back to the parent
// report's user_id before resolving emails via the users table.
async function withRequesterEmail(admin, rows) {
  if (!rows.length) return rows

  const reportIdsMissingUser = rows
    .filter((r) => !r.user_id && r.report_id)
    .map((r) => r.report_id)

  let reportUserById = {}
  if (reportIdsMissingUser.length) {
    const { data: reports } = await admin
      .from('reports')
      .select('id, user_id')
      .in('id', reportIdsMissingUser)
    reportUserById = (reports || []).reduce((acc, r) => {
      acc[r.id] = r.user_id
      return acc
    }, {})
  }

  const userIdFor = (r) => r.user_id || reportUserById[r.report_id] || null
  const userIds = [...new Set(rows.map(userIdFor).filter(Boolean))]

  let emailByUserId = {}
  if (userIds.length) {
    const { data: users } = await admin
      .from('users')
      .select('id, email')
      .in('id', userIds)
    emailByUserId = (users || []).reduce((acc, u) => {
      acc[u.id] = u.email
      return acc
    }, {})
  }

  return rows.map((r) => ({
    ...r,
    requester_email: emailByUserId[userIdFor(r)] || null,
  }))
}

function emptyTotals() {
  return {
    reports: 0,
    costUsd: 0,
    totalTokens: 0,
    durationMs: 0,
    avgCostUsd: 0,
    avgDurationMs: 0,
  }
}
