import PublicReportError from '@/src/v2/components/PublicReportError'

export async function getServerSideProps() {
  return {
    props: {
      status: 'missing',
      message:
        'This report link is missing the report id. Please check the URL and try again.',
      reportId: '',
    },
  }
}

export default function MissingReportIdPage({ status, message, reportId }) {
  return (
    <PublicReportError status={status} message={message} reportId={reportId} />
  )
}
