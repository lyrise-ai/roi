import Head from 'next/head'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { FaTrash } from 'react-icons/fa'
import {
  createClient as createServerClient,
  createAdminClient,
} from '../src/lib/supabase-server'
import { createClient as createBrowserClient } from '../src/lib/supabase-browser'
import MainHeader from '../src/layout/MainHeader/index'
import { getRoleForUser } from '../src/lib/authHelpers'
import AlphaDashboardPanel from '../src/components/AlphaDashboardPanel'
import ErrorBoundary from '../src/components/shared/ErrorBoundary'

const STATUS_STYLES = {
  SUCCESS: { bg: 'bg-green-50', text: 'text-green-700', label: 'Done' },
  RUNNING: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Running' },
  FAILED: { bg: 'bg-red-50', text: 'text-red-600', label: 'Failed' },
  PENDING: { bg: 'bg-gray-100', text: 'text-gray-500', label: 'Pending' },
}

const EVENT_LABELS = {
  report_created: 'generated a report',
  report_viewed: 'viewed a report',
  chat_message_sent: 'sent a chat message',
  chat_limit_reached: 'reached the chat limit',
}

const EVENT_COLORS = {
  report_created: 'bg-green-400',
  report_viewed: 'bg-blue-400',
  chat_message_sent: 'bg-purple-400',
  chat_limit_reached: 'bg-orange-400',
}

function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.PENDING
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}
    >
      {s.label}
    </span>
  )
}

// Distinguishes alpha-tour runs from real client/employee reports. Purple so it
// reads as a separate category from the green/blue status + role badges.
function AlphaBadge() {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-purple-100 text-purple-700">
      Alpha
    </span>
  )
}

function RoleBadge({ role }) {
  const isEmployee = role === 'EMPLOYEE'
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
        isEmployee ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500'
      }`}
    >
      {isEmployee ? 'Employee' : 'Client'}
    </span>
  )
}

// Tags each report with the email + role of the user who actually requested
// it. The requester is the authenticated account that submitted the request
// (resolved via user_id) — for bulk uploads that is the LyRise employee who
// uploaded the CSV, NOT the company contact in reports.email the report is
// addressed to. Showing reports.email here made employee bulk runs look like
// self-service client requests. Only @lyrise.ai addresses count as employees.
function withRequester(reports, requesterEmailFor) {
  return (reports ?? []).map((r) => {
    const requesterEmail = requesterEmailFor(r) ?? r.email ?? null
    return {
      ...r,
      requester_email: requesterEmail,
      requester_role: requesterEmail?.endsWith('@lyrise.ai')
        ? 'EMPLOYEE'
        : 'CLIENT',
    }
  })
}

// Some Supabase columns (e.g. reports.created_at) are stored as `timestamp`
// WITHOUT a timezone, so the API returns them with no offset (e.g.
// "2026-06-10T15:59:39"). `new Date()` would then parse them as LOCAL time and
// render the wrong hour — the value is actually UTC. Normalize a naive
// timestamp to UTC by appending "Z" before parsing. Values that already carry a
// zone ("Z" or "+00:00") are left untouched.
function parseTimestamp(iso) {
  if (!iso) return null
  const hasZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso)
  return new Date(hasZone ? iso : `${iso}Z`)
}

// Month abbreviations used by the manual formatters below.
// Avoids toLocaleString() whose output can differ between Node.js and browsers
// depending on the ICU data bundle, causing React hydration mismatches.
const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function formatDate(iso) {
  const d = parseTimestamp(iso)
  if (!d) return '—'
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

// Full timestamp with 12-hour clock, e.g. "10 Jun 2026, 6:59:40 PM".
// Uses explicit UTC accessors so server and client always produce the same string.
function formatDateTime(iso) {
  const d = parseTimestamp(iso)
  if (!d) return '—'
  const day = d.getUTCDate()
  const mon = MONTHS_SHORT[d.getUTCMonth()]
  const yr = d.getUTCFullYear()
  let hr = d.getUTCHours()
  const min = String(d.getUTCMinutes()).padStart(2, '0')
  const sec = String(d.getUTCSeconds()).padStart(2, '0')
  const ampm = hr >= 12 ? 'PM' : 'AM'
  hr = hr % 12 || 12
  return `${day} ${mon} ${yr}, ${hr}:${min}:${sec} ${ampm}`
}

function timeAgo(iso) {
  const d = parseTimestamp(iso)
  if (!d) return '—'
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function StatCard({ label, value }) {
  return (
    <div className="px-6 py-5 bg-white border border-gray-100 shadow-sm rounded-2xl">
      <p className="font-outfit text-[11px] uppercase tracking-wider text-gray-400 font-semibold mb-1">
        {label}
      </p>
      <p className="font-outfit text-3xl font-bold text-[#2C2C2C]">{value}</p>
    </div>
  )
}

export async function getServerSideProps({ req, res }) {
  const supabase = createServerClient(req, res)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { redirect: { destination: '/auth/login', permanent: false } }
  }

  const { role, error: roleError } = await getRoleForUser(user.id)
  if (roleError || !role) {
    return { redirect: { destination: '/auth/login', permanent: false } }
  }
  const isEmployee = role === 'EMPLOYEE'

  let query = supabase
    .from('reports')
    .select(
      'id, user_id, company_name, email, status, created_at, completed_at, is_alpha',
    )
    .order('created_at', { ascending: false })

  if (!isEmployee) {
    query = query.eq('user_id', user.id)
  }

  const { data: reports } = await query

  const oneWeekAgoIso = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString()
  const reportsThisWeek = (reports ?? []).filter(
    (r) => r.created_at >= oneWeekAgoIso,
  ).length

  const todayStartIso = new Date(
    new Date().setUTCHours(0, 0, 0, 0),
  ).toISOString()
  const reportsToday = (reports ?? []).filter(
    (r) => r.created_at >= todayStartIso,
  ).length

  if (!isEmployee) {
    return {
      props: {
        user: {
          email: user.email,
          name: user.user_metadata?.full_name ?? null,
        },
        isEmployee,
        reports: withRequester(reports, () => user.email),
        reportsThisWeek,
        reportsToday,
        users: [],
        recentEvents: [],
      },
    }
  }

  const admin = createAdminClient()
  const [{ data: allUsers }, { data: allReports }, { data: rawEvents }] =
    await Promise.all([
      admin
        .from('users')
        .select('id, email, role, created_at')
        .order('created_at', { ascending: false }),
      admin.from('reports').select('id, user_id, created_at'),
      admin
        .from('events')
        .select('user_id, type, report_id, created_at')
        .order('created_at', { ascending: false })
        .limit(50),
    ])

  const reportCountByUser = (allReports ?? []).reduce((acc, r) => {
    acc[r.user_id] = (acc[r.user_id] ?? 0) + 1
    return acc
  }, {})

  const lastActiveByUser = (rawEvents ?? []).reduce((acc, e) => {
    if (!acc[e.user_id]) acc[e.user_id] = e.created_at
    return acc
  }, {})

  const usersWithStats = (allUsers ?? []).map((u) => ({
    ...u,
    report_count: reportCountByUser[u.id] ?? 0,
    last_active: lastActiveByUser[u.id] ?? null,
  }))

  const userEmailById = (allUsers ?? []).reduce((acc, u) => {
    acc[u.id] = u.email
    return acc
  }, {})
  const recentEvents = (rawEvents ?? []).map((e) => ({
    ...e,
    user_email: userEmailById[e.user_id] ?? 'Unknown',
  }))

  return {
    props: {
      user: { email: user.email, name: user.user_metadata?.full_name ?? null },
      isEmployee,
      userId: user.id,
      reports: withRequester(reports, (r) => userEmailById[r.user_id]),
      reportsThisWeek,
      reportsToday,
      users: usersWithStats,
      recentEvents,
    },
  }
}

function DashboardInner({
  user,
  reports: initialReports,
  isEmployee,
  userId,
  reportsThisWeek,
  reportsToday,
  users,
  recentEvents,
}) {
  const router = useRouter()
  const [reports, setReports] = useState(initialReports)
  const [confirmingId, setConfirmingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [navigatingId, setNavigatingId] = useState(null)
  const [activeTab, setActiveTab] = useState('Reports')

  useEffect(() => {
    if (isEmployee && router.query.tab === 'my-reports')
      setActiveTab('My Reports')
  }, [isEmployee, router.query.tab])

  useEffect(() => {
    if (localStorage.getItem('alpha_redirect_pending') === 'true') {
      localStorage.removeItem('alpha_redirect_pending')
      window.location.href = '/roi-report?alpha=alpha123'
    }
  }, [])

  const myReports = reports.filter((r) => r.user_id === userId)

  const goToReport = (id) => {
    if (navigatingId) return
    setNavigatingId(id)
    router.push(`/report/${id}`)
  }

  const handleDelete = async (id) => {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/reports/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setReports((prev) => prev.filter((r) => r.id !== id))
      }
    } finally {
      setDeletingId(null)
      setConfirmingId(null)
    }
  }

  return (
    <div className="rebranding-landing-page min-h-screen -mt-[12px]">
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <MainHeader />
      <Head>
        <title>{isEmployee ? 'Admin Dashboard' : 'My Reports'} | LyRise</title>
      </Head>

      <div className="max-w-5xl px-4 py-12 mx-auto">
        {/* Header row */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-outfit text-2xl font-bold text-[#2C2C2C]">
              {isEmployee ? 'Admin Dashboard' : 'My Reports'}
            </h1>
            <p className="font-outfit text-sm text-gray-500 mt-0.5">
              {user.email}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isEmployee && (
              <Link
                href="/dashboard/usage"
                className="font-outfit text-sm font-semibold text-[#2C2C2C] hover:bg-gray-50 transition-colors border border-gray-300 rounded-full px-5 py-2.5"
              >
                Usage
              </Link>
            )}
            {isEmployee && (
              <Link
                href="/roi-report/bulk"
                className="font-outfit text-[#2C2C2C] hover:bg-gray-50 transition-colors border border-gray-300 rounded-full px-5 py-1.5 flex flex-col items-center leading-tight"
              >
                <span className="text-sm font-semibold">
                  Create multiple reports
                </span>
                <span className="text-[10px] font-medium text-gray-500">
                  Upload CSV file
                </span>
              </Link>
            )}
            <Link
              href="/roi-report"
              className="font-outfit text-sm font-semibold text-white bg-[#2C2C2C] hover:bg-black transition-colors rounded-full px-5 py-2.5"
            >
              + New Report
            </Link>
          </div>
        </div>

        {/* Employee: stats + tabs */}
        {isEmployee && (
          <>
            <div className="grid grid-cols-4 gap-4 mb-6">
              <StatCard label="Total Users" value={users.length} />
              <StatCard label="Total Reports" value={reports.length} />
              <StatCard label="Reports This Week" value={reportsThisWeek} />
              <StatCard label="Reports Today" value={reportsToday} />
            </div>

            <div className="flex gap-1 p-1 mb-6 bg-gray-100 rounded-xl w-fit">
              {['Reports', 'My Reports', 'Users', 'Activity', 'Alpha'].map(
                (tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`font-outfit text-sm font-medium px-4 py-1.5 rounded-lg transition-colors ${
                      activeTab === tab
                        ? 'bg-white text-[#2C2C2C] shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tab}
                  </button>
                ),
              )}
            </div>
          </>
        )}

        {/* Reports tab */}
        {(!isEmployee ||
          activeTab === 'Reports' ||
          activeTab === 'My Reports') &&
          ((activeTab === 'My Reports' ? myReports : reports).length === 0 ? (
            <div className="py-20 text-center bg-white border border-gray-100 shadow-sm rounded-2xl">
              <p className="mb-4 text-sm text-gray-400 font-outfit">
                No reports yet.
              </p>
              <Link
                href="/roi-report"
                className="font-outfit text-sm font-semibold text-white bg-[#2C2C2C] hover:bg-black transition-colors rounded-full px-6 py-3"
              >
                Generate your first report
              </Link>
            </div>
          ) : (
            <div className="overflow-hidden bg-white border border-gray-100 shadow-sm rounded-2xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="font-outfit font-semibold text-[11px] uppercase tracking-wider text-gray-400 text-left px-6 py-3.5">
                      Company
                    </th>
                    <th className="font-outfit font-semibold text-[11px] uppercase tracking-wider text-gray-400 text-left px-6 py-3.5">
                      Requested By
                    </th>
                    {/* pl offset (px-6 + badge's px-2.5) aligns the header with the badge text */}
                    <th className="font-outfit font-semibold text-[11px] uppercase tracking-wider text-gray-400 text-left pl-[34px] pr-6 py-3.5">
                      Role
                    </th>
                    <th className="font-outfit font-semibold text-[11px] uppercase tracking-wider text-gray-400 text-left px-6 py-3.5">
                      Status
                    </th>
                    <th className="font-outfit font-semibold text-[11px] uppercase tracking-wider text-gray-400 text-left px-6 py-3.5">
                      When
                    </th>
                    <th className="px-6 py-3.5" />
                  </tr>
                </thead>
                <tbody>
                  {(activeTab === 'My Reports' ? myReports : reports).map(
                    (r, i) => {
                      const clickable = isEmployee || r.status === 'SUCCESS'
                      return (
                        <tr
                          key={r.id}
                          className={`${
                            i <
                            (activeTab === 'My Reports' ? myReports : reports)
                              .length -
                              1
                              ? 'border-b border-gray-50'
                              : ''
                          } hover:bg-gray-50 transition-colors`}
                        >
                          <td className="font-outfit font-medium text-[#2C2C2C] px-6 py-4">
                            <span className="inline-flex items-center gap-2">
                              {r.company_name || '—'}
                              {r.is_alpha && <AlphaBadge />}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-gray-500 font-outfit">
                            {r.requester_email || '—'}
                          </td>
                          <td className="px-6 py-4">
                            <RoleBadge role={r.requester_role} />
                          </td>
                          <td className="px-6 py-4">
                            <StatusBadge status={r.status} />
                          </td>
                          <td className="px-6 py-4 text-gray-400 font-outfit whitespace-nowrap">
                            {formatDateTime(r.created_at)}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-3">
                              {clickable &&
                                (navigatingId === r.id ? (
                                  <span
                                    style={{
                                      display: 'inline-block',
                                      width: 14,
                                      height: 14,
                                      border: '2px solid #e2e8f0',
                                      borderTopColor: '#2957FF',
                                      borderRadius: '50%',
                                      animation: 'spin 0.75s linear infinite',
                                      flexShrink: 0,
                                    }}
                                  />
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => goToReport(r.id)}
                                    className="font-outfit text-xs font-semibold text-[#2957FF] hover:underline cursor-pointer"
                                  >
                                    View →
                                  </button>
                                ))}
                              {isEmployee &&
                                (confirmingId === r.id ? (
                                  <span className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleDelete(r.id)}
                                      disabled={deletingId === r.id}
                                      className="text-xs font-semibold text-red-600 transition-colors font-outfit hover:text-red-800 disabled:opacity-50"
                                    >
                                      {deletingId === r.id
                                        ? 'Deleting…'
                                        : 'Confirm'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmingId(null)}
                                      className="text-xs text-gray-400 transition-colors font-outfit hover:text-gray-600"
                                    >
                                      Cancel
                                    </button>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmingId(r.id)}
                                    className="text-gray-300 transition-colors hover:text-red-500"
                                    title="Delete report"
                                  >
                                    <FaTrash size={13} />
                                  </button>
                                ))}
                            </div>
                          </td>
                        </tr>
                      )
                    },
                  )}
                </tbody>
              </table>
            </div>
          ))}

        {/* Users tab */}
        {isEmployee && activeTab === 'Users' && (
          <div className="overflow-hidden bg-white border border-gray-100 shadow-sm rounded-2xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="font-outfit font-semibold text-[11px] uppercase tracking-wider text-gray-400 text-left px-6 py-3.5">
                    Email
                  </th>
                  <th className="font-outfit font-semibold text-[11px] uppercase tracking-wider text-gray-400 text-left px-6 py-3.5">
                    Role
                  </th>
                  <th className="font-outfit font-semibold text-[11px] uppercase tracking-wider text-gray-400 text-left px-6 py-3.5">
                    Reports
                  </th>
                  <th className="font-outfit font-semibold text-[11px] uppercase tracking-wider text-gray-400 text-left px-6 py-3.5">
                    Joined
                  </th>
                  <th className="font-outfit font-semibold text-[11px] uppercase tracking-wider text-gray-400 text-left px-6 py-3.5">
                    Recent Activity
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-12 text-sm text-center text-gray-400 font-outfit"
                    >
                      No users found.
                    </td>
                  </tr>
                ) : (
                  users.map((u, i) => (
                    <tr
                      key={u.id}
                      className={
                        i < users.length - 1 ? 'border-b border-gray-50' : ''
                      }
                    >
                      <td className="font-outfit font-medium text-[#2C2C2C] px-6 py-4">
                        {u.email}
                      </td>
                      <td className="px-6 py-4">
                        <RoleBadge
                          role={
                            u.email?.endsWith('@lyrise.ai')
                              ? 'EMPLOYEE'
                              : 'CLIENT'
                          }
                        />
                      </td>
                      <td className="px-6 py-4 text-gray-500 font-outfit">
                        {u.report_count}
                      </td>
                      <td className="px-6 py-4 text-gray-400 font-outfit">
                        {formatDate(u.created_at)}
                      </td>
                      <td
                        className="px-6 py-4 text-gray-400 font-outfit"
                        suppressHydrationWarning
                      >
                        {timeAgo(u.last_active)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Activity tab */}
        {isEmployee && activeTab === 'Activity' && (
          <div className="overflow-hidden bg-white border border-gray-100 shadow-sm rounded-2xl">
            {recentEvents.length === 0 ? (
              <p className="px-6 py-12 text-sm text-center text-gray-400 font-outfit">
                No activity recorded yet.
              </p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {recentEvents.map((e) => (
                  <li
                    key={`${e.user_id}-${e.created_at}-${e.type}`}
                    className="flex items-center gap-4 px-6 py-3.5"
                  >
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        EVENT_COLORS[e.type] ?? 'bg-gray-300'
                      }`}
                    />
                    <span className="font-outfit text-sm text-[#2C2C2C] flex-1 min-w-0">
                      <span className="font-medium">{e.user_email}</span>{' '}
                      <span className="text-gray-500">
                        {EVENT_LABELS[e.type] ?? e.type}
                      </span>
                    </span>
                    <span
                      className="flex-shrink-0 text-xs text-gray-400 font-outfit"
                      suppressHydrationWarning
                    >
                      {timeAgo(e.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Alpha tab */}
        {isEmployee && activeTab === 'Alpha' && <AlphaDashboardPanel />}
      </div>
    </div>
  )
}

export default function Dashboard(props) {
  const { isEmployee } = props
  return (
    <ErrorBoundary isEmployee={isEmployee} pageContext={{ page: 'dashboard' }}>
      <DashboardInner {...props} />
    </ErrorBoundary>
  )
}
