import { useEffect, useState } from 'react'
import Head from 'next/head'
import { FaExternalLinkAlt, FaChevronDown, FaChevronUp } from 'react-icons/fa'
import { createRouteClient } from '../../src/lib/supabaseRouteClient'
import { createAdminClient } from '../../src/lib/supabase-server'
import { fmtDateTimeUTC } from '../../src/lib/formatDate'

// ── Server-side employee gate ─────────────────────────────────────────────────
// Non-employees never receive the page (redirected to login). Mirrors the auth
// pattern in pages/auth/login.js + the employee check in pages/api/reports/[id].
export async function getServerSideProps({ req, res }) {
  const supabase = createRouteClient(req, res)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { redirect: { destination: '/auth/login', permanent: false } }
  }

  const admin = createAdminClient()
  const { data: userData } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  const isEmployee =
    userData?.role === 'EMPLOYEE' || user.email?.endsWith('@lyrise.ai')
  if (!isEmployee) {
    return { redirect: { destination: '/', permanent: false } }
  }

  return { props: {} }
}

// ── Formatting helpers ────────────────────────────────────────────────────────
const usd = (n) => `$${Number(n || 0).toFixed(n >= 1 ? 2 : 4)}`
const secs = (ms) => `${(Number(ms || 0) / 1000).toFixed(1)}s`
// Comma-separated integer. The locale is pinned: toLocaleString() without one
// picks up the host's, which differs between Node.js (SSR) and the browser.
const INT_FMT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const num = (n) => INT_FMT.format(Math.round(Number(n || 0)))

// Human-friendly duration: "—" / "45s" / "3m 20s".
const dur = (ms) => {
  const total = Math.round(Number(ms || 0) / 1000)
  if (!total) return '—'
  if (total < 60) return `${total}s`
  const m = Math.floor(total / 60)
  const s = total % 60
  return s ? `${m}m ${s}s` : `${m}m`
}

function Spinner() {
  return (
    <span className="inline-block h-8 w-8 animate-spin rounded-full border-[3px] border-[#5B48F8] border-t-transparent" />
  )
}

export default function UsageDashboard() {
  const [days, setDays] = useState(30)
  const [tab, setTab] = useState(0)
  const [data, setData] = useState(null)
  const [engagement, setEngagement] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    Promise.all([
      fetch(`/api/usage/summary?days=${days}`, {
        credentials: 'include',
      }).then((r) => r.json()),
      fetch(`/api/usage/engagement?days=${days}`, {
        credentials: 'include',
      })
        .then((r) => r.json())
        .catch(() => null),
    ])
      .then(([summary, eng]) => {
        if (cancelled) return
        if (summary.error && !summary.totals) {
          setError(summary.error)
        } else {
          setData(summary)
        }
        setEngagement(eng)
      })
      .catch(() => !cancelled && setError('Failed to load usage data'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [days])

  return (
    <>
      <Head>
        <title>Usage Monitoring | LyRise</title>
      </Head>
      <div className="min-h-screen bg-[#E2DED8] p-4 md:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-[28px] font-bold tracking-[-0.3px] text-[#0F172A]">
              Usage Monitoring
            </h1>
            <p className="text-sm text-[#6B7280]">
              LLM cost &amp; time per report
            </p>
          </div>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="min-w-[140px] rounded-md border border-[#e5e7eb] bg-white px-3 py-2 text-sm text-[#0F172A]"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
          </select>
        </div>

        {loading && (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-[#fed7aa] bg-[#fff7ed] p-6">
            <p className="font-semibold text-[#9a3412]">
              Could not load usage data
            </p>
            <p className="mt-2 text-sm text-[#9a3412]">{error}</p>
            <p className="mt-2 text-sm text-[#6B7280]">
              If the <code>roi_usage</code> table doesn&apos;t exist yet, apply
              the migration <code>20260603_000005_roi_usage.sql</code> and
              reload.
            </p>
          </div>
        )}

        {!loading && !error && data && data.ready === false && (
          <div className="rounded-xl border border-[#bfdbfe] bg-[#eff6ff] p-6">
            <p className="font-semibold text-[#1e40af]">
              Waiting for the database
            </p>
            <p className="mt-2 text-sm text-[#1e40af]">
              The <code>roi_usage</code> table isn&apos;t available yet. Once
              the migration is applied, generated reports will start appearing
              here.
            </p>
          </div>
        )}

        {!loading && !error && data && data.ready !== false && (
          <>
            <div className="mb-6 flex gap-6 border-b border-[#e5e7eb]">
              {[
                'Our reports',
                `Prospect activity${
                  engagement?.perReport?.length
                    ? ` (${engagement.perReport.length})`
                    : ''
                }`,
              ].map((label, i) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setTab(i)}
                  className={`-mb-px border-b-2 pb-2.5 text-sm font-semibold ${
                    tab === i
                      ? 'border-[#5B48F8] text-[#0F172A]'
                      : 'border-transparent text-[#6B7280]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === 0 && <Dashboard data={data} />}
            {tab === 1 &&
              (engagement && engagement.ready !== false ? (
                <EngagementPanel data={engagement} />
              ) : (
                <div className="rounded-xl border border-[#F3F4F6] p-8 text-center">
                  <p className="text-[#6B7280]">
                    No prospect activity available yet.
                  </p>
                </div>
              ))}
          </>
        )}
      </div>
    </>
  )
}

// Blue "View" link that opens the report (and its chat thread) in a new tab.
// Employees viewing /report/[id] see the full conversation, including chats
// from prospects who used "Edit with chat" in the email.
function ViewReportLink({ reportId, label = 'View' }) {
  if (!reportId) {
    return <span className="text-sm text-[#9CA3AF]">—</span>
  }
  return (
    <a
      href={`/report/${reportId}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-semibold text-[#5B48F8] no-underline hover:underline"
    >
      {label}
      <FaExternalLinkAlt size={12} />
    </a>
  )
}

function Dashboard({ data }) {
  const { totals, perDay, perModel, perMode, recent } = data

  if (!totals.reports) {
    return (
      <div className="rounded-xl border border-[#F3F4F6] p-8 text-center">
        <p className="text-[#6B7280]">
          No reports recorded in this window yet.
        </p>
      </div>
    )
  }

  return (
    <>
      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Total cost"
          value={usd(totals.costUsd)}
          accent="#5B48F8"
        />
        <StatCard
          label="Reports"
          value={num(totals.reports)}
          accent="#7c3aed"
        />
        <StatCard
          label="Avg cost / report"
          value={usd(totals.avgCostUsd)}
          accent="#0891b2"
        />
        <StatCard
          label="Avg duration"
          value={secs(totals.avgDurationMs)}
          accent="#ea580c"
        />
      </div>

      {/* Charts row */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-[2fr_1fr]">
        <Card>
          <p className="mb-4 font-semibold text-[#0F172A]">Cost over time</p>
          <BarChart
            items={perDay.map((d) => ({
              label: d.day.slice(5), // MM-DD
              value: d.costUsd,
              caption: `${usd(d.costUsd)} · ${d.count} rpt`,
            }))}
            color="#5B48F8"
          />
        </Card>
        <Card>
          <p className="mb-4 font-semibold text-[#0F172A]">Cost by model</p>
          <BarChart
            items={perModel.map((m) => ({
              label: m.model,
              value: m.costUsd,
              caption: `${usd(m.costUsd)} · ${num(m.totalTokens)} tok`,
            }))}
            color="#7c3aed"
          />
        </Card>
      </div>

      {/* Mode breakdown chips */}
      <div className="mb-6 flex flex-wrap gap-2">
        {perMode.map((m) => (
          <span
            key={m.mode}
            className="rounded-full border border-[#e5e7eb] bg-white px-3 py-1 text-xs text-[#0F172A]"
          >
            {m.mode}: {usd(m.costUsd)} ({m.count})
          </span>
        ))}
      </div>

      {/* Recent reports table */}
      <Card>
        <p className="mb-4 font-semibold text-[#0F172A]">Recent reports</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[#6B7280]">
              <Th />
              <Th>When</Th>
              <Th>Company</Th>
              <Th>Requested By</Th>
              <Th>Mode</Th>
              <Th align="right">Cost</Th>
              <Th align="right">Duration</Th>
              <Th align="right">Tokens</Th>
              <Th align="right">Report&nbsp;&amp;&nbsp;chat</Th>
            </tr>
          </thead>
          <tbody>
            {recent.map((r) => (
              <ReportRow key={r.id} row={r} />
            ))}
          </tbody>
        </table>
      </Card>
    </>
  )
}

// Recipient engagement: who opened "Edit with chat", time in panel, downloads.
function EngagementPanel({ data }) {
  const { totals, perReport } = data
  return (
    <div>
      <p className="mb-4 text-sm text-[#6B7280]">
        Activity from prospects who opened &quot;Edit with chat&quot; in the
        report emails. Open any row to read the full report and their chat
        thread.
      </p>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Reports opened"
          value={num(totals.reportsOpened)}
          accent="#16a34a"
        />
        <StatCard
          label="Total opens"
          value={num(totals.opens)}
          accent="#0891b2"
        />
        <StatCard
          label="Avg time in chat"
          value={dur(totals.avgDurationMs)}
          accent="#7c3aed"
        />
        <StatCard
          label="PDF downloads"
          value={num(totals.downloads)}
          accent="#ea580c"
        />
      </div>

      <Card>
        <p className="mb-4 font-semibold text-[#0F172A]">By report</p>
        {perReport.length === 0 ? (
          <p className="text-sm text-[#6B7280]">
            No recipient activity in this window yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[#6B7280]">
                <Th>Company</Th>
                <Th>Recipient</Th>
                <Th align="right">Opens</Th>
                <Th align="right">Avg time</Th>
                <Th align="right">Chat msgs</Th>
                <Th align="right">Downloads</Th>
                <Th align="right">Last activity</Th>
                <Th align="right">Report&nbsp;&amp;&nbsp;chat</Th>
              </tr>
            </thead>
            <tbody>
              {perReport.map((r) => (
                <tr key={r.reportId} className="border-t border-[#F3F4F6]">
                  <Td>{r.company}</Td>
                  <Td>{r.email}</Td>
                  <Td align="right">{num(r.opens)}</Td>
                  <Td align="right">{dur(r.avgDurationMs)}</Td>
                  <Td align="right">{num(r.chatMessages)}</Td>
                  <Td align="right">{num(r.downloads)}</Td>
                  <Td align="right">{fmtDateTimeUTC(r.lastActivity)}</Td>
                  <Td align="right">
                    <ViewReportLink reportId={r.reportId} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}

// Badges alpha-tour runs so they read as a separate category from real client
// reports. Purple to stand apart from the blue "View" links and stat accents.
function AlphaBadge() {
  return (
    <span className="rounded-full bg-[#f3e8ff] px-[6px] py-px text-[10px] font-bold uppercase tracking-[0.4px] text-[#7c3aed]">
      Alpha
    </span>
  )
}

function Card({ children, className = '', style }) {
  return (
    <div
      className={`rounded-xl border border-[#F3F4F6] bg-white p-5 shadow-[0_1px_6px_rgba(0,0,0,0.07)] ${className}`}
      style={style}
    >
      {children}
    </div>
  )
}

function Th({ children, align }) {
  return (
    <th
      className={`pb-2 text-xs font-semibold ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      {children}
    </th>
  )
}

function Td({ children, align }) {
  return (
    <td className={`py-2 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {children}
    </td>
  )
}

function StatCard({ label, value, accent }) {
  return (
    <Card className="!border-t-[3px]" style={{ borderTopColor: accent }}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#9CA3AF]">
        {label}
      </p>
      <p className="mt-0.5 text-xl font-bold text-[#0F172A]">{value}</p>
    </Card>
  )
}

// Lightweight horizontal bar chart — no chart dependency, just plain divs.
function BarChart({ items, color }) {
  if (!items.length) {
    return <p className="text-sm text-[#6B7280]">No data</p>
  }
  const max = Math.max(...items.map((i) => i.value), 0.000001)
  return (
    <div className="flex flex-col gap-2">
      {items.map((i, idx) => (
        <div key={`${i.label}-${idx}`}>
          <div className="mb-0.5 flex justify-between">
            <span className="truncate text-xs text-[#6B7280]">{i.label}</span>
            <span className="text-xs text-[#6B7280]">{i.caption}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#eef0f5]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max((i.value / max) * 100, 2)}%`,
                backgroundColor: color,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function ReportRow({ row }) {
  const [open, setOpen] = useState(false)
  const calls = row.calls || []
  return (
    <>
      <tr className="border-t border-[#F3F4F6] hover:bg-[#FAFAFA]">
        <Td>
          {calls.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="flex h-6 w-6 items-center justify-center text-[#6B7280]"
              aria-label={open ? 'Collapse' : 'Expand'}
            >
              {open ? <FaChevronUp size={12} /> : <FaChevronDown size={12} />}
            </button>
          )}
        </Td>
        <Td>{fmtDateTimeUTC(row.created_at)}</Td>
        <Td>
          <span className="inline-flex items-center gap-1.5">
            {row.company || '—'}
            {row.is_alpha && <AlphaBadge />}
          </span>
        </Td>
        <Td>{row.requester_email || '—'}</Td>
        <Td>{row.mode}</Td>
        <Td align="right">{usd(row.cost_usd)}</Td>
        <Td align="right">{secs(row.duration_ms)}</Td>
        <Td align="right">{num(row.total_tokens)}</Td>
        <Td align="right">
          <ViewReportLink reportId={row.report_id} />
        </Td>
      </tr>
      {open && (
        <tr>
          <td colSpan={9} className="border-0 py-0">
            <div className="my-2 ml-10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[#6B7280]">
                    <Th>Step</Th>
                    <Th>Model</Th>
                    <Th align="right">Input</Th>
                    <Th align="right">Output</Th>
                    <Th align="right">Total</Th>
                    <Th align="right">Cost</Th>
                  </tr>
                </thead>
                <tbody>
                  {calls.map((c, i) => (
                    <tr
                      key={`${c.call}-${i}`}
                      className="border-t border-[#F3F4F6]"
                    >
                      <Td>{c.call}</Td>
                      <Td>{c.model}</Td>
                      <Td align="right">{num(c.inputTokens)}</Td>
                      <Td align="right">{num(c.outputTokens)}</Td>
                      <Td align="right">{num(c.totalTokens)}</Td>
                      <Td align="right">{usd(c.costUsd)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
