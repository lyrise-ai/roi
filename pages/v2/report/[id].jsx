import Head from 'next/head'
import Link from 'next/link'
import ProfitMapReport from '@/src/components/v2/ProfitMapReport'
import { resolveSavedReportForPublicView } from '@/src/lib/roi/v2/savedReport'

export async function getServerSideProps({ params }) {
  const id = params?.id
  const result = resolveSavedReportForPublicView(id)

  if (result.status !== 'ok') {
    return {
      props: {
        status: result.status,
        message: result.message,
        reportId: typeof id === 'string' ? id : '',
      },
    }
  }

  return {
    props: {
      status: 'ok',
      report: result.report,
      reportId: result.report.id,
    },
  }
}

function ErrorState({ status, message, reportId }) {
  const title =
    status === 'missing'
      ? 'This report link is incomplete'
      : status === 'not-found'
        ? 'This report is not available'
        : 'Report unavailable'

  return (
    <main className="v2-report-error">
      <div className="v2-report-error-card">
        <p className="v2-report-eyebrow">Report link</p>
        <h1>{title}</h1>
        <p>{message}</p>
        {reportId ? (
          <p className="v2-report-error-id">Report id: {reportId}</p>
        ) : null}
        <Link href="/v2">Back to the Profit Map</Link>
      </div>
      <style jsx>{`
        .v2-report-error {
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: var(--space-6);
          background: var(--surface-subtle);
          color: var(--text-heading);
        }
        .v2-report-error-card {
          width: min(100%, 32rem);
          padding: var(--space-8);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-card);
          background: var(--surface-card);
          box-shadow: var(--shadow-md);
        }
        .v2-report-eyebrow {
          color: var(--text-muted);
          font: var(--type-eyebrow);
          letter-spacing: var(--tracking-caps);
          text-transform: uppercase;
        }
        .v2-report-error h1 {
          margin-top: var(--space-2);
          font: var(--type-h1);
          letter-spacing: var(--tracking-tight);
        }
        .v2-report-error-card
          > p:not(.v2-report-eyebrow):not(.v2-report-error-id) {
          margin-top: var(--space-4);
          color: var(--text-muted);
          font: var(--type-body);
        }
        .v2-report-error-id {
          margin-top: var(--space-4);
          color: var(--text-heading);
          font-size: var(--text-sm);
          overflow-wrap: anywhere;
        }
        .v2-report-error-card a {
          display: inline-flex;
          min-height: var(--space-12);
          align-items: center;
          margin-top: var(--space-6);
          padding: 0 var(--space-5);
          border-radius: var(--radius-control);
          background: var(--lyrise-purple);
          color: var(--text-inverse);
          font: var(--type-label);
          text-decoration: none;
        }
      `}</style>
    </main>
  )
}

export default function PublicReportPage({
  status,
  message,
  reportId,
  report,
}) {
  if (status !== 'ok') {
    return <ErrorState status={status} message={message} reportId={reportId} />
  }

  return (
    <>
      <Head>
        <title>{report.company.name} | LyRise Profit Map</title>
        <meta name="robots" content="noindex" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, interactive-widget=resizes-content"
        />
      </Head>
      <ProfitMapReport report={report} />
    </>
  )
}
