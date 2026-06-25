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

const FONT =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

const STATUS_STYLES = {
  SUCCESS: { bg: '#F0FDF4', color: '#15803D', label: 'Done' },
  RUNNING: { bg: '#EFF6FF', color: '#1D4ED8', label: 'Running' },
  FAILED: { bg: '#FEF2F2', color: '#DC2626', label: 'Failed' },
  PENDING: { bg: '#F9FAFB', color: '#6B7280', label: 'Pending' },
}

const EVENT_LABELS = {
  report_created: 'generated a report',
  report_viewed: 'viewed a report',
  chat_message_sent: 'sent a chat message',
  chat_limit_reached: 'reached the chat limit',
}

const EVENT_DOT_COLORS = {
  report_created: '#4ADE80',
  report_viewed: '#60A5FA',
  chat_message_sent: '#A78BFA',
  chat_limit_reached: '#FB923C',
}

const thStyle = {
  padding: '12px 24px',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: '#9CA3AF',
  textAlign: 'left',
  whiteSpace: 'nowrap',
  fontFamily: FONT,
}

const tdStyle = {
  padding: '16px 24px',
  fontSize: 13,
  fontFamily: FONT,
}

function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.PENDING
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: s.bg,
        color: s.color,
        fontFamily: FONT,
      }}
    >
      {s.label}
    </span>
  )
}

function AlphaBadge() {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '1px 8px',
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        background: '#F3E8FF',
        color: '#7C3AED',
        fontFamily: FONT,
      }}
    >
      Alpha
    </span>
  )
}

function RoleBadge({ role }) {
  const isEmployee = role === 'EMPLOYEE'
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: isEmployee ? '#EFF6FF' : '#F9FAFB',
        color: isEmployee ? '#1D4ED8' : '#6B7280',
        fontFamily: FONT,
      }}
    >
      {isEmployee ? 'Employee' : 'Client'}
    </span>
  )
}

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

function parseTimestamp(iso) {
  if (!iso) return null
  const hasZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso)
  return new Date(hasZone ? iso : `${iso}Z`)
}

function formatDate(iso) {
  const d = parseTimestamp(iso)
  if (!d) return '—'
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateTime(iso) {
  const d = parseTimestamp(iso)
  if (!d) return '—'
  return d
    .toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    })
    .replace(/\b(am|pm)\b/i, (m) => m.toUpperCase())
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
    <div
      style={{
        background: '#fff',
        borderRadius: 12,
        padding: '20px 24px',
        boxShadow: '0 1px 6px rgba(0,0,0,0.07)',
        border: '1px solid #F3F4F6',
        fontFamily: FONT,
      }}
    >
      <p
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: '#9CA3AF',
          fontWeight: 600,
          margin: '0 0 8px',
        }}
      >
        {label}
      </p>
      <p style={{ fontSize: 28, fontWeight: 700, color: '#0F172A', margin: 0 }}>
        {value}
      </p>
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
  const [hoveredRowId, setHoveredRowId] = useState(null)

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
  const activeReports = activeTab === 'My Reports' ? myReports : reports

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

  const TABS = ['Reports', 'My Reports', 'Users', 'Activity', 'Alpha']

  return (
    <div
      style={{ minHeight: '100vh', background: '#E2DED8', fontFamily: FONT }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <MainHeader />
      <Head>
        <title>
          {isEmployee ? 'Admin Dashboard' : 'My Profit Maps'} | LyRise
        </title>
      </Head>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '48px 16px' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            marginBottom: 32,
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: '#0F172A',
                margin: '0 0 4px',
                letterSpacing: '-0.3px',
                lineHeight: 1.2,
              }}
            >
              {isEmployee ? 'Admin Dashboard' : 'My Profit Maps'}
            </h1>
            <p style={{ fontSize: 13, color: '#6B7280', margin: 0 }}>
              {user.email}
            </p>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexShrink: 0,
              flexWrap: 'wrap',
            }}
          >
            {isEmployee && (
              <Link
                href="/dashboard/usage"
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#374151',
                  border: '1px solid #E5E7EB',
                  borderRadius: 999,
                  padding: '9px 18px',
                  textDecoration: 'none',
                  background: '#fff',
                  fontFamily: FONT,
                }}
              >
                Usage
              </Link>
            )}
            {isEmployee && (
              <Link
                href="/roi-report/bulk"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  lineHeight: 1.35,
                  color: '#374151',
                  border: '1px solid #E5E7EB',
                  borderRadius: 999,
                  padding: '6px 18px',
                  textDecoration: 'none',
                  background: '#fff',
                  fontFamily: FONT,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  Create multiple reports
                </span>
                <span style={{ fontSize: 10, color: '#9CA3AF' }}>
                  Upload CSV file
                </span>
              </Link>
            )}
            <Link
              href="/roi-report"
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: '#fff',
                background: '#5B48F8',
                borderRadius: 999,
                padding: '10px 20px',
                textDecoration: 'none',
                fontFamily: FONT,
                whiteSpace: 'nowrap',
              }}
            >
              + New Profit Map
            </Link>
          </div>
        </div>

        {/* Employee: stat cards + tab bar */}
        {isEmployee && (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 16,
                marginBottom: 24,
              }}
            >
              <StatCard label="Total Users" value={users.length} />
              <StatCard label="Total Reports" value={reports.length} />
              <StatCard label="Reports This Week" value={reportsThisWeek} />
              <StatCard label="Reports Today" value={reportsToday} />
            </div>

            <div
              style={{
                display: 'flex',
                background: '#F3F4F6',
                borderRadius: 999,
                padding: 3,
                gap: 2,
                width: 'fit-content',
                marginBottom: 24,
              }}
            >
              {TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: '6px 18px',
                    fontSize: 13,
                    fontWeight: 500,
                    borderRadius: 999,
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: FONT,
                    background: activeTab === tab ? '#5B48F8' : 'transparent',
                    color: activeTab === tab ? '#fff' : '#6B7280',
                    transition: 'background 0.15s, color 0.15s',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Reports / My Reports (and client view) */}
        {(!isEmployee ||
          activeTab === 'Reports' ||
          activeTab === 'My Reports') &&
          (activeReports.length === 0 ? (
            <div
              style={{
                background: '#fff',
                borderRadius: 12,
                border: '1px solid #F3F4F6',
                boxShadow: '0 1px 6px rgba(0,0,0,0.07)',
                padding: '80px 24px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  background: '#EDE9FE',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                }}
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#5B48F8"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14,2 14,8 20,8" />
                  <line x1="12" y1="18" x2="12" y2="12" />
                  <line x1="9" y1="15" x2="15" y2="15" />
                </svg>
              </div>
              <p
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: '#0F172A',
                  margin: '0 0 6px',
                }}
              >
                {isEmployee
                  ? 'No reports yet'
                  : 'Your first Profit Map is one click away'}
              </p>
              <p
                style={{
                  fontSize: 13,
                  color: '#9CA3AF',
                  margin: '0 0 24px',
                  maxWidth: 340,
                  marginLeft: 'auto',
                  marginRight: 'auto',
                  lineHeight: 1.6,
                }}
              >
                {isEmployee
                  ? 'Reports will appear here once generated.'
                  : "Enter your prospect's company name and we'll build an AI-powered business case in minutes."}
              </p>
              <Link
                href="/roi-report"
                style={{
                  display: 'inline-block',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#fff',
                  background: '#5B48F8',
                  borderRadius: 999,
                  padding: '10px 24px',
                  textDecoration: 'none',
                  fontFamily: FONT,
                }}
              >
                + New Profit Map
              </Link>
            </div>
          ) : (
            <div
              style={{
                background: '#fff',
                borderRadius: 12,
                border: '1px solid #F3F4F6',
                boxShadow: '0 1px 6px rgba(0,0,0,0.07)',
                overflow: 'hidden',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <th style={thStyle}>Company</th>
                    {isEmployee && <th style={thStyle}>Requested By</th>}
                    {isEmployee && (
                      <th style={{ ...thStyle, paddingLeft: 34 }}>Role</th>
                    )}
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>When</th>
                    <th style={{ ...thStyle, width: 1 }} />
                  </tr>
                </thead>
                <tbody>
                  {activeReports.map((r, i) => {
                    const clickable = isEmployee || r.status === 'SUCCESS'
                    const isLast = i === activeReports.length - 1
                    return (
                      <tr
                        key={r.id}
                        onMouseEnter={() => setHoveredRowId(r.id)}
                        onMouseLeave={() => setHoveredRowId(null)}
                        style={{
                          borderBottom: isLast ? 'none' : '1px solid #F9FAFB',
                          background:
                            hoveredRowId === r.id ? '#FAFAFA' : 'transparent',
                          transition: 'background 0.1s',
                        }}
                      >
                        <td
                          style={{
                            ...tdStyle,
                            fontWeight: 500,
                            color: '#0F172A',
                          }}
                        >
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 8,
                            }}
                          >
                            {r.company_name || '—'}
                            {r.is_alpha && <AlphaBadge />}
                          </span>
                        </td>
                        {isEmployee && (
                          <td style={{ ...tdStyle, color: '#6B7280' }}>
                            {r.requester_email || '—'}
                          </td>
                        )}
                        {isEmployee && (
                          <td style={tdStyle}>
                            <RoleBadge role={r.requester_role} />
                          </td>
                        )}
                        <td style={tdStyle}>
                          <StatusBadge status={r.status} />
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            color: '#9CA3AF',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {formatDateTime(r.created_at)}
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            textAlign: 'right',
                            paddingRight: 24,
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                              gap: 12,
                            }}
                          >
                            {clickable &&
                              (navigatingId === r.id ? (
                                <span
                                  style={{
                                    display: 'inline-block',
                                    width: 14,
                                    height: 14,
                                    border: '2px solid #E5E7EB',
                                    borderTopColor: '#5B48F8',
                                    borderRadius: '50%',
                                    animation: 'spin 0.75s linear infinite',
                                    flexShrink: 0,
                                  }}
                                />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => goToReport(r.id)}
                                  style={{
                                    fontSize: 12,
                                    fontWeight: 600,
                                    color: '#5B48F8',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontFamily: FONT,
                                    padding: 0,
                                  }}
                                >
                                  View →
                                </button>
                              ))}
                            {isEmployee &&
                              (confirmingId === r.id ? (
                                <span
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                  }}
                                >
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(r.id)}
                                    disabled={deletingId === r.id}
                                    style={{
                                      fontSize: 12,
                                      fontWeight: 600,
                                      color: '#DC2626',
                                      background: 'none',
                                      border: 'none',
                                      cursor:
                                        deletingId === r.id
                                          ? 'not-allowed'
                                          : 'pointer',
                                      fontFamily: FONT,
                                      padding: 0,
                                      opacity: deletingId === r.id ? 0.5 : 1,
                                    }}
                                  >
                                    {deletingId === r.id
                                      ? 'Deleting…'
                                      : 'Confirm'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmingId(null)}
                                    style={{
                                      fontSize: 12,
                                      color: '#9CA3AF',
                                      background: 'none',
                                      border: 'none',
                                      cursor: 'pointer',
                                      fontFamily: FONT,
                                      padding: 0,
                                    }}
                                  >
                                    Cancel
                                  </button>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmingId(r.id)}
                                  style={{
                                    color: '#D1D5DB',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: 0,
                                    display: 'flex',
                                    alignItems: 'center',
                                    transition: 'color 0.15s',
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.color = '#EF4444'
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.color = '#D1D5DB'
                                  }}
                                  title="Delete report"
                                >
                                  <FaTrash size={12} />
                                </button>
                              ))}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))}

        {/* Users tab */}
        {isEmployee && activeTab === 'Users' && (
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              border: '1px solid #F3F4F6',
              boxShadow: '0 1px 6px rgba(0,0,0,0.07)',
              overflow: 'hidden',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #F3F4F6' }}>
                  {['Email', 'Role', 'Reports', 'Joined', 'Last Active'].map(
                    (h) => (
                      <th key={h} style={thStyle}>
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      style={{
                        textAlign: 'center',
                        padding: '48px 24px',
                        fontSize: 13,
                        color: '#9CA3AF',
                        fontFamily: FONT,
                      }}
                    >
                      No users found.
                    </td>
                  </tr>
                ) : (
                  users.map((u, i) => (
                    <tr
                      key={u.id}
                      style={{
                        borderBottom:
                          i < users.length - 1 ? '1px solid #F9FAFB' : 'none',
                      }}
                    >
                      <td
                        style={{
                          ...tdStyle,
                          fontWeight: 500,
                          color: '#0F172A',
                        }}
                      >
                        {u.email}
                      </td>
                      <td style={tdStyle}>
                        <RoleBadge
                          role={
                            u.email?.endsWith('@lyrise.ai')
                              ? 'EMPLOYEE'
                              : 'CLIENT'
                          }
                        />
                      </td>
                      <td style={{ ...tdStyle, color: '#6B7280' }}>
                        {u.report_count}
                      </td>
                      <td style={{ ...tdStyle, color: '#9CA3AF' }}>
                        {formatDate(u.created_at)}
                      </td>
                      <td style={{ ...tdStyle, color: '#9CA3AF' }}>
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
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              border: '1px solid #F3F4F6',
              boxShadow: '0 1px 6px rgba(0,0,0,0.07)',
              overflow: 'hidden',
            }}
          >
            {recentEvents.length === 0 ? (
              <p
                style={{
                  padding: '48px 24px',
                  textAlign: 'center',
                  fontSize: 13,
                  color: '#9CA3AF',
                  fontFamily: FONT,
                  margin: 0,
                }}
              >
                No activity recorded yet.
              </p>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {recentEvents.map((e, i) => (
                  <li
                    key={`${e.user_id}-${e.created_at}-${e.type}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 16,
                      padding: '12px 24px',
                      borderBottom:
                        i < recentEvents.length - 1
                          ? '1px solid #F9FAFB'
                          : 'none',
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        flexShrink: 0,
                        background: EVENT_DOT_COLORS[e.type] ?? '#D1D5DB',
                      }}
                    />
                    <span
                      style={{
                        fontSize: 13,
                        color: '#0F172A',
                        flex: 1,
                        minWidth: 0,
                        fontFamily: FONT,
                      }}
                    >
                      <span style={{ fontWeight: 500 }}>{e.user_email}</span>{' '}
                      <span style={{ color: '#6B7280' }}>
                        {EVENT_LABELS[e.type] ?? e.type}
                      </span>
                    </span>
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: 12,
                        color: '#9CA3AF',
                        fontFamily: FONT,
                      }}
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
