// ─────────────────────────────────────────────────────────────────────────────
// pages/v2/dashboard.jsx — Signed-in user's V2 Profit Map reports
//
// Shows all previous reports created or claimed by the authenticated user.
// Enforced by PostgreSQL RLS on public.v2_reports (auth.uid() = owner_id).
// ─────────────────────────────────────────────────────────────────────────────

import * as React from 'react'
import Head from 'next/head'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/router'
import Logo from '@/src/assets/logo.svg'
import { createRouteClient } from '@/src/lib/supabaseRouteClient'
import { createClient as createBrowserClient } from '@/src/lib/supabase-browser'
import { Button, Card, Icon } from '@components/ui'

export async function getServerSideProps({ req, res }) {
  const supabase = createRouteClient(req, res)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      redirect: {
        destination: '/auth/login?next=/v2/dashboard',
        permanent: false,
      },
    }
  }

  // RLS ensures only rows where owner_id = user.id are returned
  const { data: reports, error } = await supabase
    .from('v2_reports')
    .select('id, company, pains, words, settings, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[v2/dashboard] failed to fetch reports:', error)
  }

  return {
    props: {
      user: { id: user.id, email: user.email },
      reports: reports || [],
    },
  }
}

export default function V2Dashboard({ user, reports = [] }) {
  const router = useRouter()

  const handleSignOut = async () => {
    const supabase = createBrowserClient()
    await supabase.auth.signOut()
    router.push('/v2')
  }

  return (
    <>
      <Head>
        <title>My Profit Maps · LyRise</title>
      </Head>
      <main
        style={{
          minHeight: '100vh',
          background: 'var(--surface-subtle)',
          display: 'flex',
          flexDirection: 'column',
          color: 'var(--text-heading)',
        }}
      >
        <header
          style={{
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-4)',
            padding:
              'var(--space-5) clamp(var(--space-4), 5vw, var(--space-8))',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--surface-card)',
          }}
        >
          <Link
            href="/v2"
            style={{ display: 'inline-flex', alignItems: 'center' }}
          >
            <Image src={Logo} alt="LyRise" width={70} height={24} priority />
          </Link>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-4)',
            }}
          >
            <span
              style={{
                font: 'var(--weight-medium) var(--text-xs)/1 var(--font-body)',
                color: 'var(--text-muted)',
              }}
            >
              {user.email}
            </span>
            <Link href="/v2">
              <Button size="sm" variant="secondary">
                New Profit Map
              </Button>
            </Link>
            <Button size="sm" variant="ghost" onClick={handleSignOut}>
              Sign out
            </Button>
          </div>
        </header>

        <section
          style={{
            flex: 1,
            width: '100%',
            maxWidth: '56rem',
            margin: '0 auto',
            padding:
              'var(--space-8) clamp(var(--space-4), 4vw, var(--space-8)) var(--space-20)',
          }}
        >
          <div style={{ marginBottom: 'var(--space-8)' }}>
            <h1
              style={{
                font: 'var(--weight-extrabold) var(--text-3xl)/var(--leading-tight) var(--font-display)',
                letterSpacing: 'var(--tracking-tight)',
                margin: '0 0 var(--space-2)',
              }}
            >
              Your Profit Maps
            </h1>
            <p
              style={{
                font: 'var(--type-body)',
                color: 'var(--text-muted)',
                margin: 0,
              }}
            >
              Reports saved to your account. Click any report to view its full
              business case.
            </p>
          </div>

          {reports.length === 0 ? (
            <Card
              style={{
                padding: 'var(--space-10) var(--space-6)',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 'var(--space-4)',
              }}
            >
              <div
                style={{
                  font: 'var(--weight-semibold) var(--text-base)',
                  color: 'var(--text-heading)',
                }}
              >
                No reports saved yet
              </div>
              <p
                style={{
                  font: 'var(--type-body)',
                  color: 'var(--text-muted)',
                  maxWidth: '24rem',
                  margin: 0,
                }}
              >
                Generate your first Profit Map interview and save it to your
                account on the reveal screen.
              </p>
              <Link href="/v2">
                <Button variant="primary">Start a Profit Map</Button>
              </Link>
            </Card>
          ) : (
            <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
              {reports.map((report) => {
                const companyName = report.company?.name || 'Company'
                const thesis =
                  report.words?.thesis || 'Automated workflow analysis'
                const date = new Date(report.created_at).toLocaleDateString(
                  'en-US',
                  {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  },
                )

                return (
                  <Link
                    key={report.id}
                    href={`/v2/report/${encodeURIComponent(report.id)}`}
                    style={{ textDecoration: 'none' }}
                  >
                    <Card
                      style={{
                        padding: 'var(--space-5)',
                        transition:
                          'transform var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 'var(--space-4)',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            font: 'var(--weight-bold) var(--text-lg)',
                            color: 'var(--text-heading)',
                            marginBottom: 'var(--space-1)',
                          }}
                        >
                          {companyName}
                        </div>
                        <div
                          style={{
                            font: 'var(--text-sm)',
                            color: 'var(--text-muted)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: '36rem',
                          }}
                        >
                          {thesis}
                        </div>
                        <div
                          style={{
                            font: 'var(--text-xs)',
                            color: 'var(--neutral-400)',
                            marginTop: 'var(--space-2)',
                          }}
                        >
                          Saved on {date}
                        </div>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--space-2)',
                          color: 'var(--brand)',
                          font: 'var(--weight-semibold) var(--text-sm)',
                          flexShrink: 0,
                        }}
                      >
                        View report <Icon name="arrow-right" size={16} />
                      </div>
                    </Card>
                  </Link>
                )
              })}
            </div>
          )}
        </section>
      </main>
    </>
  )
}
