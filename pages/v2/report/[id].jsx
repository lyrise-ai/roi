import Head from 'next/head'
import PublicReportError from '@/src/components/v2/PublicReportError'
import {
  resolveSavedReportForPublicView,
  toPublicReport,
  resetViewerTokenForReport,
} from '@/src/lib/roi/v2/savedReport'

export async function getServerSideProps({ params, req, res, query }) {
  const id = params?.id
  const cleanedId = typeof id === 'string' ? id.trim() : ''

  // Support dev-only reset: ?reset=1 resets viewer token in development
  if (
    process.env.NODE_ENV !== 'production' &&
    query?.reset === '1' &&
    cleanedId
  ) {
    resetViewerTokenForReport(cleanedId)
  }

  // Read one-time viewer cookie
  const cookieName = `report_viewer_${cleanedId}`
  const cookieToken =
    req?.cookies?.[cookieName] ||
    (req?.headers?.cookie
      ? (req.headers.cookie
          .split(';')
          .find((c) => c.trim().startsWith(`${cookieName}=`))
          ?.split('=')[1] ?? undefined)
      : undefined)

  const result = resolveSavedReportForPublicView(cleanedId, cookieToken)

  if (result.status !== 'ok') {
    if (result.status === 'not-found') res.statusCode = 404
    if (result.status === 'unauthorized') res.statusCode = 403
    return {
      props: {
        status: result.status,
        message: result.message,
        reportId: cleanedId,
      },
    }
  }

  // If first visitor, set one-time cookie so subsequent visits from this browser work
  // but any other visitor without this cookie is blocked
  if (result.setViewerToken) {
    const cookieHeader = `${cookieName}=${result.setViewerToken}; Path=/v2/report; Max-Age=31536000; HttpOnly; SameSite=Lax`
    const existingCookies = res.getHeader('Set-Cookie')
    if (existingCookies) {
      const arr = Array.isArray(existingCookies)
        ? existingCookies
        : [existingCookies]
      res.setHeader('Set-Cookie', [...arr, cookieHeader])
    } else {
      res.setHeader('Set-Cookie', cookieHeader)
    }
  }

  return {
    props: {
      status: 'ok',
      report: toPublicReport(result.report),
      reportId: cleanedId,
    },
  }
}

function PublicReportDisplay({ report }) {
  const figures = report.featured?.figures
  const observation = report.observation || 'This report has been saved.'
  const companyName = report.company?.name || 'Your company'

  return (
    <>
      <Head>
        <title>{companyName} | LyRise Profit Map</title>
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
              {companyName}
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
                  Wages you get back
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
                <p
                  style={{
                    margin: 'var(--space-1) 0 0',
                    font: 'var(--type-body)',
                    color: 'var(--text-muted)',
                    fontSize: 'var(--text-sm)',
                  }}
                >
                  the operational dividend
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
                  Combined opportunity
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
              {report.pains && report.pains.length > 0 ? (
                report.pains.map((pain, index) => (
                  <li
                    key={`${pain.text}-${index}`}
                    style={{ font: 'var(--type-body)' }}
                  >
                    {pain.text}
                  </li>
                ))
              ) : (
                <li style={{ font: 'var(--type-body)' }}>
                  No pain points were saved with this report.
                </li>
              )}
            </ul>
          </section>

          {report.legend ? (
            <p
              style={{
                margin: 0,
                font: 'var(--text-sm) var(--font-body)',
                color: 'var(--text-muted)',
              }}
            >
              {report.legend}
            </p>
          ) : null}

          {report.disclaimer ? (
            <p
              style={{
                margin: 0,
                font: 'var(--text-xs) var(--font-body)',
                color: 'var(--text-muted)',
                lineHeight: 1.5,
              }}
            >
              {report.disclaimer}
            </p>
          ) : null}
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
    return (
      <PublicReportError
        status={status}
        message={message}
        reportId={reportId}
      />
    )
  }

  return <PublicReportDisplay report={report} />
}
