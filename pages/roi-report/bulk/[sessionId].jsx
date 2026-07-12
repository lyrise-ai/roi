import { useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { createClient as createServerClient } from '../../../src/lib/supabase-server'
import MainHeader from '../../../src/layout/MainHeader'
import GeneratingView from '../../../src/components/ROIGenerator/GeneratingView'
import useBulkSession, {
  cancelBulkSession,
} from '../../../src/hooks/useBulkSession'
import { ROUTES, loginRedirect } from '@/src/lib/routes'

export async function getServerSideProps({ req, res, resolvedUrl }) {
  const supabase = createServerClient(req, res)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      redirect: { destination: loginRedirect(resolvedUrl), permanent: false },
    }
  }

  const isEmployee = user.email?.endsWith('@lyrise.ai') === true
  if (!isEmployee) {
    return { redirect: { destination: ROUTES.dashboard, permanent: false } }
  }

  return { props: {} }
}

function StatusStrip({ rows, cursor }) {
  const counts = rows.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1
      return acc
    },
    { PENDING: 0, GENERATING: 0, DONE: 0, FAILED: 0, CANCELLED: 0 },
  )

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2 text-[10px] font-outfit font-semibold uppercase tracking-wider text-gray-500">
        <span>{counts.DONE} done</span>
        <span>·</span>
        <span className="text-[#2957FF]">{counts.GENERATING} generating</span>
        <span>·</span>
        <span>{counts.PENDING} waiting</span>
        {counts.FAILED > 0 && (
          <>
            <span>·</span>
            <span className="text-red-600">{counts.FAILED} failed</span>
          </>
        )}
        {counts.CANCELLED > 0 && (
          <>
            <span>·</span>
            <span className="text-gray-500">{counts.CANCELLED} cancelled</span>
          </>
        )}
      </div>
      <style>{`@keyframes bulkPulse { 0%,100% { opacity: 1 } 50% { opacity: 0.55 } }`}</style>
      <div className="flex flex-wrap items-center gap-1 max-w-[520px] justify-end">
        {rows.map((row, i) => {
          const isCurrent = i === cursor
          let cls = ''
          if (row.status === 'DONE') {
            cls = 'bg-green-500 text-white'
          } else if (row.status === 'GENERATING') {
            cls = 'bg-[#2957FF] text-white'
          } else if (row.status === 'FAILED') {
            cls = 'bg-red-500 text-white'
          } else if (row.status === 'CANCELLED') {
            cls = 'bg-gray-300 text-white line-through'
          } else {
            cls = 'bg-white text-gray-400 border border-gray-200'
          }
          return (
            <span
              key={i}
              className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-semibold ${cls} ${
                isCurrent ? 'ring-2 ring-offset-1 ring-[#2C2C2C]' : ''
              }`}
              style={
                row.status === 'GENERATING'
                  ? { animation: 'bulkPulse 1.4s ease-in-out infinite' }
                  : undefined
              }
              title={
                row.payload?.companyName
                  ? `${i + 1}. ${row.payload.companyName} — ${row.status}`
                  : `${i + 1} — ${row.status}`
              }
            >
              {i + 1}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export default function BulkReviewPage() {
  const router = useRouter()
  const { sessionId, pos } = router.query
  const cursor = Math.max(0, Number(pos ?? 0) || 0)

  const { session, setCursor, retryRow, activeLogs } = useBulkSession(
    typeof sessionId === 'string' ? sessionId : null,
  )

  const row = session?.rows?.[cursor]

  // Keep the persisted cursor in sync with the URL.
  useEffect(() => {
    if (!session) return
    if (session.cursor !== cursor) setCursor(cursor)
  }, [cursor, session, setCursor])

  // Once the active row is DONE, redirect into the standard report viewer.
  useEffect(() => {
    if (!router.isReady) return
    if (!row || !row.reportId) return
    if (row.status !== 'DONE') return
    router.replace(`/report/${row.reportId}?batch=${session.id}&pos=${cursor}`)
  }, [router, row, session, cursor])

  if (!router.isReady) {
    return (
      <div className="rebranding-landing-page min-h-screen -mt-[12px]">
        <MainHeader />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="rebranding-landing-page min-h-screen -mt-[12px]">
        <MainHeader />
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <h1 className="font-outfit text-xl font-bold text-[#2C2C2C] mb-2">
            Bulk session not found
          </h1>
          <p className="font-outfit text-sm text-gray-500 mb-6">
            This bulk session has been cleared or wasn&apos;t started from this
            browser.
          </p>
          <Link
            href="/roi-report/bulk"
            className="font-outfit text-sm font-semibold text-white bg-[#2C2C2C] hover:bg-black transition-colors rounded-full px-5 py-2.5"
          >
            Start a new bulk upload
          </Link>
        </div>
      </div>
    )
  }

  if (!row) {
    return (
      <div className="rebranding-landing-page min-h-screen -mt-[12px]">
        <MainHeader />
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <h1 className="font-outfit text-xl font-bold text-[#2C2C2C] mb-2">
            All reports reviewed
          </h1>
          <Link
            href="/dashboard"
            className="font-outfit text-sm font-semibold text-white bg-[#2C2C2C] hover:bg-black transition-colors rounded-full px-5 py-2.5"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    )
  }

  const total = session.rows.length
  const isGenerating = row.status === 'PENDING' || row.status === 'GENERATING'
  const isFailed = row.status === 'FAILED'
  const isCancelled = row.status === 'CANCELLED' || session.cancelled

  const handleCancelBatch = () => {
    const remaining = session.rows.filter((r) => r.status !== 'DONE').length
    const msg =
      remaining > 0
        ? `Cancel the bulk batch? ${remaining} report${
            remaining === 1 ? '' : 's'
          } still pending or generating will be stopped. Already-generated reports stay in your dashboard.`
        : 'Cancel the bulk batch and return to the dashboard?'
    // eslint-disable-next-line no-alert
    if (!window.confirm(msg)) return
    cancelBulkSession(session.id)
    router.push('/dashboard')
  }

  return (
    <div className="rebranding-landing-page min-h-screen -mt-[12px]">
      <Head>
        <title>Bulk Review · {row.payload?.companyName ?? '…'} | LyRise</title>
      </Head>
      <MainHeader />
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link
              href="/dashboard"
              className="font-outfit text-xs text-gray-500 hover:text-gray-800"
            >
              ← Back to dashboard
            </Link>
            <h1 className="font-outfit text-lg font-bold text-[#2C2C2C] mt-2">
              Bulk Review · Report {cursor + 1} of {total}
            </h1>
            <p className="font-outfit text-sm text-gray-500 mt-0.5">
              {row.payload?.companyName ?? 'Unknown company'}
              {row.payload?.recipientName
                ? ` · ${row.payload.recipientName}`
                : ''}
            </p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <StatusStrip rows={session.rows} cursor={cursor} />
            {!isCancelled && (
              <button
                type="button"
                onClick={handleCancelBatch}
                title="Stop the bulk batch — already-generated reports stay in your dashboard"
                className="font-outfit text-xs font-medium text-red-600 hover:bg-red-50 border border-red-200 rounded-full px-3 py-1.5"
              >
                Cancel batch
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          {isCancelled && (
            <div className="p-10 text-center">
              <h2 className="font-outfit text-lg font-bold text-[#2C2C2C] mb-2">
                Bulk batch cancelled
              </h2>
              <p className="font-outfit text-sm text-gray-600 mb-6 max-w-md mx-auto">
                Already-generated reports are still available on your dashboard.
              </p>
              <Link
                href="/dashboard"
                className="inline-block font-outfit text-sm font-semibold text-white bg-[#2C2C2C] hover:bg-black transition-colors rounded-full px-5 py-2.5"
              >
                Back to dashboard
              </Link>
            </div>
          )}

          {!isCancelled && isGenerating && (
            <GeneratingView generationLog={activeLogs[cursor]} />
          )}

          {!isCancelled && isFailed && (
            <div className="p-10 text-center">
              <h2 className="font-outfit text-lg font-bold text-red-600 mb-2">
                Generation failed
              </h2>
              <p className="font-outfit text-sm text-gray-600 mb-6 max-w-md mx-auto">
                {row.error || 'Unknown error during generation.'}
              </p>
              <div className="flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => retryRow(cursor)}
                  className="font-outfit text-sm font-semibold text-white bg-[#2C2C2C] hover:bg-black transition-colors rounded-full px-5 py-2.5"
                >
                  Retry
                </button>
                {cursor + 1 < total && (
                  <button
                    type="button"
                    onClick={() =>
                      router.push(
                        `/roi-report/bulk/${session.id}?pos=${cursor + 1}`,
                      )
                    }
                    className="font-outfit text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-full px-5 py-2.5"
                  >
                    Skip to next
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
