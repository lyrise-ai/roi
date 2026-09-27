import Head from 'next/head'
import ProfitMapReport from '@/src/components/v2/ProfitMapReport'
import PublicReportError from '@/src/components/v2/PublicReportError'
import {
  resolveSavedReportForPublicView,
  toPublicReport,
} from '@/src/lib/roi/v2/savedReport'

export async function getServerSideProps({ params, res }) {
  const id = params?.id
  const result = resolveSavedReportForPublicView(id)

  if (result.status !== 'ok') {
    if (result.status === 'not-found') res.statusCode = 404
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
      report: toPublicReport(result.report),
    },
  }
}

export default function PublicReportPage({
  status,
  message,
  reportId,
  report,
}) {
  if (status !== 'ok') {
    return (
      <PublicReportError
        status={status}
        message={message}
        reportId={reportId}
      />
    )
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
