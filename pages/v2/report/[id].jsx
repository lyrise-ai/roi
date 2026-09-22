import Head from 'next/head'
import Link from 'next/link'
import { useMemo } from 'react'
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

function PublicReportDisplay({ report }) {
  const figures = report.featured?.figures
  const observation = report.observation || 'This report has been saved.'

  const headline = useMemo(() => {
    const companyName = report.company?.name || 'Your company'
    return companyName
  }, [report])

  return (
    <>
      <Head>
        <title>{headline} | LyRise Profit Map</title>
        <meta name="robots" content="noindex" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, interactive-widget=resizes-content"
        />
      </Head>
      <main
        style={{
          minHeight: '100vh',
          background: 'var(--surface-subtle)',
          color: 'var(--text-heading)',
          padding: 'var(--space-6) clamp(var(--space-4), 5vw, var(--space-6))',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 'var(--container-narrow)',
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-6)',
          }}
        >
          <header
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
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
              Profit Map report
            </p>
            <h1
              style={{
                margin: 0,
                font: 'var(--weight-extrabold) clamp(var(--text-2xl), 9vw, var(--text-5xl))/1.1 var(--font-display)',
                letterSpacing: 'var(--tracking-tight)',
                textWrap: 'pretty',
              }}
            >
              {headline}
            </h1>
          </header>

          <section
            style={{
              background: 'var(--surface-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-card)',
              padding: 'var(--space-5)',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <p
              style={{
                margin: 0,
                font: 'var(--type-body)',
                color: 'var(--text-muted)',
                textWrap: 'pretty',
              }}
            >
              {observation}
            </p>
          </section>

          {figures?.calc ? (
            <section
              style={{
                display: 'grid',
                gap: 'var(--space-4)',
              }}
            >
              <div
                style={{
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-card)',
                  padding: 'var(--space-5)',
                }}
              >
                <p
                  style={{
                    margin: 0,
                    color: 'var(--text-muted)',
                    font: 'var(--weight-medium) var(--text-sm)/1.4 var(--font-body)',
                  }}
                >
                  Hours currently spent
                </p>
                <p
                  style={{
                    margin: 'var(--space-2) 0 0',
                    font: 'var(--weight-extrabold) clamp(var(--text-3xl), 9vw, var(--text-5xl))/1.1 var(--font-display)',
                    color: 'var(--text-heading)',
                  }}
                >
                  {Math.round(figures.calc.annualHours).toLocaleString('en-US')}
                  <span
                    style={{
                      font: 'var(--weight-regular) var(--text-lg)/1 var(--font-body)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {' '}
                    hrs / year
                  </span>
                </p>
              </div>

              <div
                style={{
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-card)',
                  padding: 'var(--space-5)',
                }}
              >
                <p
                  style={{
                    margin: 0,
                    color: 'var(--text-muted)',
                    font: 'var(--weight-medium) var(--text-sm)/1.4 var(--font-body)',
                  }}
                >
                  Hours Returned
                </p>
                <p
                  style={{
                    margin: 'var(--space-2) 0 0',
                    font: 'var(--weight-extrabold) clamp(var(--text-3xl), 9vw, var(--text-5xl))/1.1 var(--font-display)',
                    color: 'var(--text-heading)',
                  }}
                >
                  {Math.round(figures.calc.hoursReturned).toLocaleString(
                    'en-US',
                  )}
                  <span
                    style={{
                      font: 'var(--weight-regular) var(--text-lg)/1 var(--font-body)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {' '}
                    hrs / year
                  </span>
                </p>
              </div>

              <div
                style={{
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-card)',
                  padding: 'var(--space-5)',
                }}
              >
                <p
                  style={{
                    margin: 0,
                    color: 'var(--text-muted)',
                    font: 'var(--weight-medium) var(--text-sm)/1.4 var(--font-body)',
                  }}
                >
                  Operational Dividend
                </p>
                <p
                  style={{
                    margin: 'var(--space-2) 0 0',
                    font: 'var(--weight-extrabold) clamp(var(--text-3xl), 9vw, var(--text-5xl))/1.1 var(--font-display)',
                    color: 'var(--text-heading)',
                  }}
                >
                  $
                  {Math.round(figures.calc.operationalDividend).toLocaleString(
                    'en-US',
                  )}
                </p>
              </div>

              <div
                style={{
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-card)',
                  padding: 'var(--space-5)',
                }}
              >
                <p
                  style={{
                    margin: 0,
                    color: 'var(--text-muted)',
                    font: 'var(--weight-medium) var(--text-sm)/1.4 var(--font-body)',
                  }}
                >
                  Total Financial Gain
                </p>
                <p
                  style={{
                    margin: 'var(--space-2) 0 0',
                    font: 'var(--weight-extrabold) clamp(var(--text-3xl), 9vw, var(--text-5xl))/1.1 var(--font-display)',
                    color: 'var(--text-heading)',
                  }}
                >
                  $
                  {Math.round(figures.calc.totalFinancialGain).toLocaleString(
                    'en-US',
                  )}
                </p>
              </div>
            </section>
          ) : (
            <section
              style={{
                background: 'var(--surface-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-card)',
                padding: 'var(--space-5)',
              }}
            >
              <p
                style={{
                  margin: 0,
                  font: 'var(--type-body)',
                  color: 'var(--text-muted)',
                }}
              >
                This report is saved, but it does not yet have enough numbers to
                display a complete calculation.
              </p>
            </section>
          )}

          <section
            style={{
              background: 'var(--surface-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-card)',
              padding: 'var(--space-5)',
            }}
          >
            <h2
              style={{
                margin: '0 0 var(--space-3)',
                font: 'var(--weight-semibold) var(--text-lg)/1.2 var(--font-body)',
              }}
            >
              What the team flagged
            </h2>
            <ul
              style={{
                margin: 0,
                paddingLeft: '1.25rem',
                display: 'grid',
                gap: 'var(--space-2)',
                color: 'var(--text-heading)',
              }}
            >
              {report.pains?.map((pain, index) => (
                <li
                  key={`${pain.text}-${index}`}
                  style={{ font: 'var(--type-body)' }}
                >
                  {pain.text}
                </li>
              )) || (
                <li style={{ font: 'var(--type-body)' }}>
                  No pain points were saved with this report.
                </li>
              )}
            </ul>
          </section>
        </div>
      </main>
    </>
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

  return <PublicReportDisplay report={report} />
}
