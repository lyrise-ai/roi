import Head from 'next/head'
import { buildStateFromReportRow } from '@/src/lib/roi/reportState'
import { resolveReportViewerAccess } from '@/src/lib/roi/reportViewerAccess'
import ValidationWizard from '../../../src/components/ROIGenerator/Validation/ValidationWizard'
import ErrorBoundary from '../../../src/components/shared/ErrorBoundary'

export async function getServerSideProps({
  req,
  res,
  params,
  query,
  resolvedUrl,
}) {
  const access = await resolveReportViewerAccess({
    req,
    res,
    params,
    query,
    resolvedUrl,
  })
  if (access.redirect) return access

  const { report, isShareLink, isEmployee, isBulk } = access

  // Already validated — can't be re-forced through the wizard by URL.
  if (report.validated_at) {
    return {
      redirect: { destination: `/report/${report.id}`, permanent: false },
    }
  }

  // Share-link recipients review an already-finished report by email; they
  // never see the wizard at all.
  if (isShareLink) {
    return {
      redirect: { destination: `/report/${report.id}`, permanent: false },
    }
  }

  return {
    props: {
      initialState: buildStateFromReportRow(report),
      reportId: report.id,
      canSkip: isEmployee || isBulk,
    },
  }
}

export default function ValidatePage({ initialState, reportId, canSkip }) {
  return (
    <ErrorBoundary pageContext={{ page: 'report-validate', reportId }}>
      <Head>
        <title>Validate Your ROI Report | LyRise</title>
      </Head>
      <ValidationWizard
        initialState={initialState}
        reportId={reportId}
        canSkip={canSkip}
      />
    </ErrorBoundary>
  )
}
