import { useEffect, useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import ReportViewer from '@/src/v1/components/ROIGenerator/ReportViewer'
import { cancelBulkSession } from '@/src/v1/hooks/useBulkSession'

const STORAGE_PREFIX = 'lyrise_bulk_'

function readSession(sessionId) {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${sessionId}`)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export default function ReportViewerWithBatch(props) {
  const router = useRouter()
  const sessionId =
    typeof router.query.batch === 'string' ? router.query.batch : null
  const cursorParam = Number(router.query.pos ?? NaN)
  const cursor = Number.isFinite(cursorParam) ? cursorParam : 0

  const [session, setSession] = useState(() =>
    sessionId ? readSession(sessionId) : null,
  )

  // Poll localStorage so we pick up status updates written by the bulk
  // session hook from other tabs / the review page tab.
  useEffect(() => {
    if (!sessionId) return undefined
    const tick = () => setSession(readSession(sessionId))
    tick()
    const id = window.setInterval(tick, 2000)
    const onStorage = (e) => {
      if (e.key === `${STORAGE_PREFIX}${sessionId}`) tick()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('storage', onStorage)
    }
  }, [sessionId])

  const onNext = useCallback(() => {
    if (!session) return
    router.push(`/roi-report/bulk/${session.id}?pos=${cursor + 1}`)
  }, [router, session, cursor])

  const onFinish = useCallback(() => {
    router.push('/dashboard')
  }, [router])

  const onCancel = useCallback(() => {
    if (!sessionId) return
    const remaining = (session?.rows ?? []).filter(
      (r) => r.status !== 'DONE',
    ).length
    const msg =
      remaining > 0
        ? `Cancel the bulk batch? ${remaining} report${
            remaining === 1 ? '' : 's'
          } still pending or generating will be stopped. Already-generated reports stay in your dashboard.`
        : 'Cancel the bulk batch and return to the dashboard?'
    // eslint-disable-next-line no-alert
    if (!window.confirm(msg)) return
    cancelBulkSession(sessionId)
    router.push('/dashboard')
  }, [router, sessionId, session])

  const batchContext = useMemo(() => {
    if (!sessionId || !session) return null
    if (session.cancelled) return null
    const total = session.rows?.length ?? 0
    if (!total) return null
    const nextRow = session.rows[cursor + 1]
    const isNextReady = !!nextRow && nextRow.status === 'DONE'
    const isNextFailed = !!nextRow && nextRow.status === 'FAILED'
    return {
      currentIndex: cursor,
      total,
      isNextReady: isNextReady || isNextFailed,
      isNextFailed,
      onNext,
      onFinish,
      onCancel,
    }
  }, [sessionId, session, cursor, onNext, onFinish, onCancel])

  return <ReportViewer {...props} batchContext={batchContext} />
}
