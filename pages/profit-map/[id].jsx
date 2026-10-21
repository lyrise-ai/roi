// pages/profit-map/[id].jsx — what a forwarded report link opens (LYR-239). No account,
// no chat. The server rebuilds the report from the saved answers; the browser
// only gets the finished ReportModel.

import * as React from 'react'
import Head from 'next/head'
import Link from 'next/link'
import PublicReportError from '@/src/v2/components/PublicReportError'
import { buildReport } from '@/src/v2/report/buildReport'
import { loadReport } from '@/src/v2/report/savedReport'
import { useAuthSession } from '@/src/lib/AuthSessionContext'
import { Button, Report } from '@/src/ui'

const MESSAGES = {
  'not-found':
    'We could not find this report. The link may be mistyped, or the report may have been deleted.',
  unreadable:
    'We could not reach our report store just now. Please try again in a minute.',
}

export async function getServerSideProps({ params, res }) {
  const id = params?.id ?? ''
  const result = await loadReport(id)

  if (result.status === 'ok') {
    const { report } = result
    return {
      props: {
        reportId: report.id,
        company: report.company?.name || 'Your company',
        model: buildReport(report),
      },
    }
  }

  res.statusCode = result.status === 'unreadable' ? 503 : 404
  return {
    props: {
      error: { status: result.status, message: MESSAGES[result.status] },
      reportId: id,
    },
  }
}

export default function ProfitMapReportPage({
  reportId,
  company,
  model,
  error,
}) {
  // Back from signing in: claim it, if this browser is the one that made it.
  const { user } = useAuthSession()
  React.useEffect(() => {
    if (!model || !user) return
    const key = `v2_claim_${reportId}`
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
      body: JSON.stringify({ reportId, claimToken }),
    })
      .then((r) => {
        if (r.ok) localStorage.removeItem(key)
      })
      .catch(() => {})
  }, [model, user, reportId])

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

  return (
    <>
      <Head>
        <title>{company} | LyRise Profit Map</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main
        style={{
          padding: 'var(--space-12) var(--space-6)',
          maxWidth: 'var(--container-max)',
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
        </header>
        <Report model={model} />
        <footer style={{ marginTop: 'var(--space-12)', textAlign: 'center' }}>
          <Button as={Link} href="/" variant="secondary">
            Make your own Profit Map
          </Button>
        </footer>
      </main>
    </>
  )
}
