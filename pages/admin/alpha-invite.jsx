import { useEffect, useState } from 'react'
import Head from 'next/head'
import { createClient } from '../../src/lib/supabase-server'
import { getRoleForUser } from '../../src/lib/authHelpers'
import LoadingButton from '../../src/components/shared/Button/LoadingButton'

export async function getServerSideProps({ req, res }) {
  const supabase = createClient(req, res)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      redirect: {
        destination: '/auth/login?next=%2Fadmin%2Falpha-invite',
        permanent: false,
      },
    }
  }

  const { role } = await getRoleForUser(user.id)
  if (role !== 'EMPLOYEE') {
    return { redirect: { destination: '/dashboard', permanent: false } }
  }

  return { props: {} }
}

const inputStyle = {
  border: '1.5px solid #E5E7EB',
  borderRadius: 10,
  padding: '11px 14px',
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
  color: '#0F172A',
  background: '#FAFAFA',
  boxSizing: 'border-box',
  width: '100%',
}

function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function AlphaInvite() {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [invites, setInvites] = useState([])
  const [invitesLoading, setInvitesLoading] = useState(true)
  const [copiedId, setCopiedId] = useState(null)
  const [revokingId, setRevokingId] = useState(null)

  const loadInvites = async () => {
    setInvitesLoading(true)
    try {
      const res = await fetch('/api/admin/alpha-invites')
      const data = await res.json()
      if (res.ok) setInvites(data.invites ?? [])
    } finally {
      setInvitesLoading(false)
    }
  }

  useEffect(() => {
    loadInvites()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/admin/alpha-invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          fullName: fullName.trim(),
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Something went wrong.')
        if (res.status === 409) await loadInvites()
        return
      }
      setEmail('')
      setFullName('')
      await loadInvites()
    } catch (err) {
      console.error('[alpha-invite] create failed:', err)
      setError('Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async (invite) => {
    try {
      await navigator.clipboard.writeText(invite.link)
      setCopiedId(invite.id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {}
  }

  const handleToggleRevoke = async (invite) => {
    setRevokingId(invite.id)
    try {
      const res = await fetch(`/api/admin/alpha-invites/${invite.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revoked: !invite.revoked_at }),
      })
      if (!res.ok) throw new Error(`Revoke request failed (${res.status})`)
      await loadInvites()
    } catch (err) {
      console.error('[alpha-invite] revoke failed:', err)
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <>
      <Head>
        <title>Alpha Invites | LyRise</title>
      </Head>
      <div
        style={{
          minHeight: '100vh',
          padding: '48px 16px',
          background: '#E2DED8',
        }}
      >
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <div
            style={{
              background: '#ffffff',
              borderRadius: 16,
              padding: '32px 28px',
              boxShadow: '0 2px 24px rgba(0,0,0,0.08)',
              marginBottom: 24,
            }}
          >
            <h1
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: '#0F172A',
                margin: '0 0 6px',
              }}
            >
              Generate alpha invite link
            </h1>
            <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 24px' }}>
              Creates a reusable link that signs the recipient in instantly and
              tags their account as an alpha tester. It keeps working until you
              revoke it below.
            </p>

            <form
              onSubmit={handleSubmit}
              style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              <input
                type="email"
                placeholder="Alpha user's email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={inputStyle}
              />
              <input
                type="text"
                placeholder="Full name (optional)"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                style={inputStyle}
              />
              <LoadingButton
                type="submit"
                loading={loading}
                loadingText="Generating…"
                style={{
                  width: '100%',
                  background: loading ? '#A49CF4' : '#5B48F8',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  padding: '12px 16px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Generate link
              </LoadingButton>
            </form>

            {error && (
              <p style={{ fontSize: 12, color: '#EF4444', marginTop: 12 }}>
                {error}
              </p>
            )}
          </div>

          <div
            style={{
              background: '#ffffff',
              borderRadius: 16,
              padding: '24px 28px',
              boxShadow: '0 2px 24px rgba(0,0,0,0.08)',
            }}
          >
            <h2
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: '#0F172A',
                margin: '0 0 16px',
              }}
            >
              Existing invites
            </h2>

            {invitesLoading ? (
              <p style={{ fontSize: 13, color: '#9CA3AF' }}>Loading…</p>
            ) : invites.length === 0 ? (
              <p style={{ fontSize: 13, color: '#9CA3AF' }}>No invites yet.</p>
            ) : (
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
              >
                {invites.map((invite) => (
                  <div
                    key={invite.id}
                    style={{
                      border: '1px solid #F3F4F6',
                      borderRadius: 12,
                      padding: '14px 16px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: 12,
                        marginBottom: 8,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            color: '#0F172A',
                          }}
                        >
                          {invite.email}
                          {invite.full_name ? ` · ${invite.full_name}` : ''}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: '#9CA3AF',
                            marginTop: 2,
                          }}
                        >
                          Created {formatDateTime(invite.created_at)} · Last
                          used {formatDateTime(invite.last_used_at)}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: invite.revoked_at ? '#FEF2F2' : '#F0FDF4',
                          color: invite.revoked_at ? '#DC2626' : '#15803D',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {invite.revoked_at ? 'Revoked' : 'Active'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        readOnly
                        value={invite.link}
                        style={{ ...inputStyle, flex: 1, fontSize: 12 }}
                        onFocus={(e) => e.target.select()}
                      />
                      <button
                        type="button"
                        onClick={() => handleCopy(invite)}
                        style={{
                          width: 'auto',
                          padding: '0 14px',
                          background: '#0F172A',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 10,
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        {copiedId === invite.id ? 'Copied' : 'Copy'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleRevoke(invite)}
                        disabled={revokingId === invite.id}
                        style={{
                          width: 'auto',
                          padding: '0 14px',
                          background: '#fff',
                          color: invite.revoked_at ? '#15803D' : '#DC2626',
                          border: `1.5px solid ${
                            invite.revoked_at ? '#15803D' : '#DC2626'
                          }`,
                          borderRadius: 10,
                          fontSize: 13,
                          fontWeight: 600,
                          cursor:
                            revokingId === invite.id
                              ? 'not-allowed'
                              : 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        {invite.revoked_at ? 'Reactivate' : 'Revoke'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
