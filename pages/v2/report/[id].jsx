// /v2/report/<id> — what a forwarded report link opens (LYR-239). No account,
// no chat. Figures come back with buildReport (LYR-243); until then this shows
// only what was saved, never a stand-in number.

import * as React from 'react'
import Head from 'next/head'
import Link from 'next/link'
import PublicReportError from '@/src/components/v2/PublicReportError'
import { loadReport } from '@/src/lib/roi/v2/savedReport'
import { useAuthSession } from '@/src/context/AuthSessionContext'
import { Button } from '@components/ui'

const MESSAGES = {
  'not-found':
    'We could not find this report. The link may be mistyped, or the report may have been deleted.',
  unreadable:
    'We could not reach our report store just now. Please try again in a minute.',
}

export async function getServerSideProps({ params, res }) {
  const id = params?.id ?? ''
  const result = await loadReport(id)

  if (result.status === 'ok') return { props: { report: result.report } }

  res.statusCode = result.status === 'unreadable' ? 503 : 404
  return {
    props: {
      error: { status: result.status, message: MESSAGES[result.status] },
      reportId: id,
    },
  }
}

export default function V2ReportPage({ report, error, reportId }) {
  // Back from signing in: claim it, if this browser is the one that made it.
  const { user } = useAuthSession()
  React.useEffect(() => {
    if (!report || !user) return
    const key = `v2_claim_${report.id}`
    let claimToken
    try {
      claimToken = localStorage.getItem(key)
    } catch {
      return
    }
    if (!claimToken) return
    fetch('/api/v2/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId: report.id, claimToken }),
    })
      .then((r) => {
        if (r.ok) localStorage.removeItem(key)
      })
      .catch(() => {})
  }, [report, user])

  if (error) {
    return (
      <>
        <Head>
          <meta name="robots" content="noindex" />
        </Head>
        <PublicReportError
          status={error.status}
          message={error.message}
          reportId={reportId}
        />
      </>
    )
  }

  const company = report.company?.name || 'Your company'
  const pains = (report.pains ?? []).filter((p) => p?.text)

  return (
    <>
      <Head>
        <title>{company} | LyRise Profit Map</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main
        style={{
          padding: 'var(--space-12) var(--space-6)',
          maxWidth: '760px',
          margin: '0 auto',
        }}
      >
        <header style={{ marginBottom: 'var(--space-8)' }}>
          <div
            style={{
              font: 'var(--weight-semibold) var(--text-xs)',
              color: 'var(--brand)',
              textTransform: 'uppercase',
              letterSpacing: 'var(--tracking-wider)',
              marginBottom: 'var(--space-2)',
            }}
          >
            Profit Map
          </div>
          <h1
            style={{
              font: 'var(--weight-extrabold) var(--text-3xl)',
              color: 'var(--text-heading)',
              margin: 0,
            }}
          >
            {company}
          </h1>
          {report.words?.observation && (
            <p
              style={{
                font: 'var(--type-body)',
                color: 'var(--text-body)',
                marginTop: 'var(--space-4)',
              }}
            >
              {report.words.observation}
            </p>
          )}
        </header>

        {pains.length > 0 && (
          <section
            style={{
              padding: 'var(--space-6)',
              background: 'var(--surface-card)',
              borderRadius: 'var(--radius-card)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <h2
              style={{
                font: 'var(--weight-bold) var(--text-base)',
                margin: '0 0 var(--space-4)',
              }}
            >
              The work we looked at
            </h2>
            <ul style={{ margin: 0, paddingLeft: 'var(--space-5)' }}>
              {pains.map((p, i) => (
                <li
                  key={i}
                  style={{
                    font: 'var(--type-body)',
                    padding: 'var(--space-1) 0',
                  }}
                >
                  {p.text}
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer style={{ marginTop: 'var(--space-12)', textAlign: 'center' }}>
          <Button as={Link} href="/v2" variant="secondary">
            Make your own Profit Map
          </Button>
        </footer>
      </main>
    </>
  )
}
