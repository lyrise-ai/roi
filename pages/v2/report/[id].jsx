// ─────────────────────────────────────────────────────────────────────────────
// pages/v2/report/[id].jsx — Opens a V2 Profit Map report by its exact link
//
// "A report can have no owner. owner_id stays empty until sign-in, and the link
// still works. The link is the key: a random UUID."
//
// Opening by link goes through our server by exact id using the admin client,
// which bypasses RLS (the link is the key).
// ─────────────────────────────────────────────────────────────────────────────

import * as React from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { loadReport } from '@/src/lib/roi/v2/savedReport'
import { Button } from '@components/ui'

export async function getServerSideProps({ params }) {
  const { id } = params ?? {}

  // Read by exact id via admin client (link is the key)
  const result = await loadReport(id)

  if (result.status === 'missing' || result.status === 'not-found') {
    return { notFound: true }
  }

  if (result.status === 'unreadable') {
    return {
      props: {
        error:
          'We could not reach the report database. Please try again shortly.',
      },
    }
  }

  return {
    props: {
      reportId: id,
      model: result.model,
    },
  }
}

export default function V2ReportPage({ reportId, model, error }) {
  if (error) {
    return (
      <main
        style={{
          padding: 'var(--space-12) var(--space-6)',
          maxWidth: '640px',
          margin: '0 auto',
        }}
      >
        <h1 style={{ font: 'var(--type-h2)', color: 'var(--text-heading)' }}>
          Unable to load report
        </h1>
        <p
          style={{
            font: 'var(--type-body)',
            color: 'var(--text-muted)',
            margin: 'var(--space-4) 0',
          }}
        >
          {error}
        </p>
        <Link href="/v2">
          <Button variant="primary">Start a new Profit Map</Button>
        </Link>
      </main>
    )
  }

  return (
    <>
      <Head>
        <title>Profit Map · {model?.thesis ? 'Report' : 'LyRise'}</title>
      </Head>
      <main
        style={{
          padding: 'var(--space-12) var(--space-6)',
          maxWidth: '960px',
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
            V2 Profit Map Report
          </div>
          <h1
            style={{
              font: 'var(--weight-extrabold) var(--text-3xl)',
              color: 'var(--text-heading)',
              margin: 0,
            }}
          >
            {model?.thesis || 'Your Profit Map'}
          </h1>
        </header>

        {model?.snapshot && model.snapshot.length > 0 && (
          <section
            style={{
              marginBottom: 'var(--space-8)',
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
              Company snapshot
            </h2>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {model.snapshot.map((s, idx) => (
                <li
                  key={idx}
                  style={{
                    padding: 'var(--space-2) 0',
                    borderBottom:
                      idx < model.snapshot.length - 1
                        ? '1px solid var(--border-subtle)'
                        : 'none',
                    font: 'var(--type-body)',
                  }}
                >
                  <strong>{s.label}: </strong>
                  {s.value}
                </li>
              ))}
            </ul>
          </section>
        )}

        {model?.workflowRows && model.workflowRows.length > 0 && (
          <section
            style={{
              marginBottom: 'var(--space-8)',
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
              Proposed workflows
            </h2>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-4)',
              }}
            >
              {model.workflowRows.map((row) => (
                <div
                  key={row.id}
                  style={{
                    padding: 'var(--space-4)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--neutral-50)',
                  }}
                >
                  <div
                    style={{
                      font: 'var(--weight-bold) var(--text-base)',
                      color: 'var(--text-heading)',
                    }}
                  >
                    {row.workflow}
                  </div>
                  <div
                    style={{
                      font: 'var(--text-sm)',
                      color: 'var(--text-muted)',
                      margin: 'var(--space-1) 0',
                    }}
                  >
                    {row.today}
                  </div>
                  <div
                    style={{
                      font: 'var(--weight-semibold) var(--text-sm)',
                      color: 'var(--brand)',
                    }}
                  >
                    Hours returned: {row.hours} · Gain: {row.gain}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <footer style={{ marginTop: 'var(--space-12)', textAlign: 'center' }}>
          <Link href="/v2">
            <Button variant="secondary">Start over</Button>
          </Link>
        </footer>
      </main>
    </>
  )
}
