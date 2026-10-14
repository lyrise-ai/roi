// /v2/report/<id> — a public report link. Rebuild figures from the saved
// answers so the page never relies on a browser-supplied total.

import * as React from 'react'
import Head from 'next/head'
import PublicReportError from '@/src/v2/components/PublicReportError'
import { loadReport } from '@/src/v2/report/savedReport'
import { buildReport } from '@/src/v2/report/buildReport'
import { useAuthSession } from '@/src/lib/AuthSessionContext'
import { Report } from '@/src/ui'

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
    return {
      props: {
        reportId: result.report.id,
        model: buildReport(result.report),
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

export default function V2ReportPage({ model, error, reportId }) {
  // Back from signing in: claim it, if this browser is the one that made it.
  const { user } = useAuthSession()
  React.useEffect(() => {
    if (!reportId || error || !user) return
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
  }, [error, reportId, user])

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
        <title>
          {model.snapshot.find((row) => row.label === 'Company')?.value ||
            'Profit Map'}{' '}
          | LyRise Profit Map
        </title>
        <meta name="robots" content="noindex" />
      </Head>
      <Report model={model} />
    </>
  )
}
