import Link from 'next/link'

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

function ErrorState({ status, message, reportId }) {
  const title =
    status === 'missing'
      ? 'This report link is incomplete'
      : status === 'not-found'
        ? 'This report is not available'
        : 'Report unavailable'

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--surface-subtle)',
        color: 'var(--text-heading)',
        padding: 'var(--space-6)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '32rem',
          background: 'var(--surface-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-card)',
          padding: 'var(--space-6)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <p
          style={{
            margin: 0,
            font: 'var(--weight-semibold) var(--text-xs)/1 var(--font-body)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}
        >
          Report link
        </p>
        <h1
          style={{
            margin: 'var(--space-2) 0',
            font: 'var(--weight-extrabold) clamp(var(--text-2xl), 7vw, var(--text-4xl))/1.1 var(--font-display)',
          }}
        >
          {title}
        </h1>
        <p
          style={{
            margin: '0 0 var(--space-5)',
            font: 'var(--type-body)',
            color: 'var(--text-muted)',
            textWrap: 'pretty',
          }}
        >
          {message}
        </p>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
          }}
        >
          {reportId ? (
            <p
              style={{
                margin: 0,
                font: 'var(--weight-medium) var(--text-sm)/1.4 var(--font-body)',
                color: 'var(--text-heading)',
                wordBreak: 'break-all',
              }}
            >
              Report id: {reportId}
            </p>
          ) : null}
          <Link
            href="/v2"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '2.75rem',
              padding: '0 var(--space-4)',
              borderRadius: 'var(--radius-pill)',
              background: 'var(--dark-blue)',
              color: 'white',
              font: 'var(--weight-semibold) var(--text-sm)/1 var(--font-body)',
              textDecoration: 'none',
            }}
          >
            Back to the Profit Map
          </Link>
        </div>
      </div>
    </main>
  )
}

export default function MissingReportIdPage({ status, message, reportId }) {
  return <ErrorState status={status} message={message} reportId={reportId} />
}
