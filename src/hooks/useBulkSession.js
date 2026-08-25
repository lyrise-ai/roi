import { useCallback, useEffect, useState } from 'react'
import { drainSSE } from '../lib/drainSSE'
import { loginRedirect } from '../lib/routes'

export const STAGGER_MS = 60_000
const STORAGE_PREFIX = 'lyrise_bulk_'

// -- State kept outside React ------------------------------------------------
// The queue, what is currently running, and the log buffers all live outside
// React, so a bulk run keeps going while the user moves between pages.

const scheduledTimers = new Map() // key -> setTimeout handle
const inFlight = new Set() // key
const controllers = new Map() // key -> AbortController
const cancelled = new Set() // sessionId (so an in-flight fetch knows not to mark itself FAILED)
const logBuffers = new Map() // key -> string
const logSubs = new Map() // key -> Set<fn>
const sessionSubs = new Map() // sessionId -> Set<fn>

const rowKey = (sessionId, index) => `${sessionId}-${index}`

// ─── localStorage I/O ────────────────────────────────────────────────────────

function storageKey(sessionId) {
  return `${STORAGE_PREFIX}${sessionId}`
}

function readSession(sessionId) {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(storageKey(sessionId))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeSession(session) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey(session.id), JSON.stringify(session))
  } catch {
    /* localStorage full or disabled */
  }
}

// ─── Notification ────────────────────────────────────────────────────────────

function notifySession(sessionId) {
  const subs = sessionSubs.get(sessionId)
  if (subs) subs.forEach((fn) => fn())
}

function notifyLog(sessionId, index) {
  const subs = logSubs.get(rowKey(sessionId, index))
  if (subs)
    subs.forEach((fn) => fn(logBuffers.get(rowKey(sessionId, index)) ?? ''))
}

function subscribeSession(sessionId, fn) {
  let subs = sessionSubs.get(sessionId)
  if (!subs) {
    subs = new Set()
    sessionSubs.set(sessionId, subs)
  }
  subs.add(fn)
  return () => {
    subs.delete(fn)
    if (subs.size === 0) sessionSubs.delete(sessionId)
  }
}

function subscribeLog(sessionId, index, fn) {
  const key = rowKey(sessionId, index)
  let subs = logSubs.get(key)
  if (!subs) {
    subs = new Set()
    logSubs.set(key, subs)
  }
  subs.add(fn)
  fn(logBuffers.get(key) ?? '')
  return () => {
    subs.delete(fn)
    if (subs.size === 0) logSubs.delete(key)
  }
}

// ─── Mutations ───────────────────────────────────────────────────────────────

function updateSessionInStorage(sessionId, mutate) {
  const session = readSession(sessionId)
  if (!session) return null
  const next = mutate(session)
  if (!next) return null
  writeSession(next)
  notifySession(sessionId)
  return next
}

function updateRowInStorage(sessionId, index, patch) {
  return updateSessionInStorage(sessionId, (session) => {
    const rows = session.rows.map((r, i) =>
      i === index ? { ...r, ...patch } : r,
    )
    return { ...session, rows }
  })
}

function appendRowLog(sessionId, index, chunk) {
  const key = rowKey(sessionId, index)
  const next = ((logBuffers.get(key) ?? '') + chunk).slice(-2000)
  logBuffers.set(key, next)
  notifyLog(sessionId, index)
}

// ─── Scheduler + generator ───────────────────────────────────────────────────

async function generateRow(sessionId, index) {
  const key = rowKey(sessionId, index)
  if (inFlight.has(key)) return
  const session = readSession(sessionId)
  if (!session) return
  const row = session.rows[index]
  if (!row || row.status === 'DONE' || row.status === 'GENERATING') return

  inFlight.add(key)
  const controller = new AbortController()
  controllers.set(key, controller)
  updateRowInStorage(sessionId, index, { status: 'GENERATING', error: null })
  appendRowLog(
    sessionId,
    index,
    `Contacting agent for ${row.payload?.companyName || 'company'}…\n`,
  )

  try {
    const response = await fetch('/api/roi-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'generate',
        formData: row.payload,
        emailOverride: session.emailOverride || undefined,
      }),
      signal: controller.signal,
    })

    if (response.status === 401) {
      window.location.href = loginRedirect(
        `${window.location.pathname}${window.location.search}`,
      )
      return
    }

    if (!response.ok || !response.body) {
      let message = `HTTP ${response.status}`
      try {
        const data = await response.json()
        message = data?.error ?? message
        if (response.status === 409 && data?.report_id) {
          updateRowInStorage(sessionId, index, {
            status: 'DONE',
            reportId: data.report_id,
            error: null,
          })
          return
        }
      } catch {
        /* non-JSON body */
      }
      updateRowInStorage(sessionId, index, { status: 'FAILED', error: message })
      return
    }

    let savedReportId = null
    let sawDone = false
    // The agent says it is done BEFORE it renders the PDF and sends the email,
    // so a row marked done has not necessarily been emailed. We attach any
    // failure to the row rather than dropping it: a whole batch once ran with
    // every email failing silently and every row showing green.
    let emailError = null
    await drainSSE(response.body.getReader(), new TextDecoder(), (event) => {
      if (event.type === 'text_delta') {
        appendRowLog(sessionId, index, event.delta ?? '')
      } else if (event.type === 'tool_start') {
        appendRowLog(sessionId, index, `\n[${event.tool}]`)
      } else if (event.type === 'report_saved') {
        savedReportId = event.report_id
        updateRowInStorage(sessionId, index, { reportId: event.report_id })
      } else if (event.type === 'done') {
        sawDone = true
      } else if (event.type === 'email_error') {
        emailError = event.message ?? 'Email failed'
        appendRowLog(sessionId, index, `\n[email failed] ${emailError}\n`)
      } else if (event.type === 'error') {
        throw new Error(event.message ?? 'Generation failed')
      }
    })

    if (sawDone && savedReportId) {
      updateRowInStorage(sessionId, index, {
        status: 'DONE',
        error: null,
        emailError,
      })
    } else {
      updateRowInStorage(sessionId, index, {
        status: 'FAILED',
        error: 'Generation finished without saving a report.',
      })
    }
  } catch (err) {
    if (err?.name === 'AbortError' || cancelled.has(sessionId)) {
      // The user cancelled. Leave the row marked cancelled.
      return
    }
    updateRowInStorage(sessionId, index, {
      status: 'FAILED',
      error: err?.message ?? 'Unknown error',
    })
  } finally {
    inFlight.delete(key)
    controllers.delete(key)
  }
}

function scheduleAll(sessionId) {
  let session = readSession(sessionId)
  if (!session) return

  // After a page reload, any row still marked "generating" is left over from
  // before: its request died along with the page. We reset those so they get
  // queued again. We can tell nothing is really running, because the list of
  // in-flight requests is empty after a full reload.
  let dirty = false
  const rows = session.rows.map((row, i) => {
    if (row.status === 'GENERATING' && !inFlight.has(rowKey(sessionId, i))) {
      dirty = true
      return { ...row, status: 'PENDING' }
    }
    return row
  })
  if (dirty) {
    session = { ...session, rows }
    writeSession(session)
    notifySession(sessionId)
  }

  session.rows.forEach((row, index) => {
    if (row.status !== 'PENDING') return
    const key = rowKey(sessionId, index)
    if (scheduledTimers.has(key) || inFlight.has(key)) return
    const delay = Math.max(0, (row.scheduledAt ?? Date.now()) - Date.now())
    const handle = setTimeout(() => {
      scheduledTimers.delete(key)
      generateRow(sessionId, index)
    }, delay)
    scheduledTimers.set(key, handle)
  })
}

// ─── Public API ──────────────────────────────────────────────────────────────

function buildInitialSession(payloads, { emailOverride } = {}) {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    cursor: 0,
    emailOverride: emailOverride || null,
    rows: payloads.map((payload, i) => ({
      payload,
      status: 'PENDING',
      scheduledAt: now + i * STAGGER_MS,
      reportId: null,
      error: null,
    })),
  }
}

export function createBulkSession(payloads, options = {}) {
  const fresh = buildInitialSession(payloads, options)
  writeSession(fresh)
  scheduleAll(fresh.id)
  return fresh.id
}

/**
 * Stops a bulk run: cancels anything waiting to start, aborts anything in
 * progress, and marks every unfinished row as cancelled. Reports that were
 * already saved are untouched and still available from the dashboard.
 */
export function cancelBulkSession(sessionId) {
  if (!sessionId) return
  cancelled.add(sessionId)
  const prefix = `${sessionId}-`
  scheduledTimers.forEach((handle, key) => {
    if (key.startsWith(prefix)) {
      clearTimeout(handle)
      scheduledTimers.delete(key)
    }
  })
  controllers.forEach((controller, key) => {
    if (key.startsWith(prefix)) {
      controller.abort()
      controllers.delete(key)
    }
  })
  updateSessionInStorage(sessionId, (session) => ({
    ...session,
    cancelled: true,
    rows: session.rows.map((r) =>
      r.status === 'DONE' ? r : { ...r, status: 'CANCELLED' },
    ),
  }))
}

export default function useBulkSession(sessionId) {
  const [session, setSession] = useState(() =>
    sessionId ? readSession(sessionId) : null,
  )
  const [activeLogs, setActiveLogs] = useState({})

  // Listen for changes, and queue up any waiting rows when this mounts. That
  // covers a page refresh, where the queue in memory is gone but the saved one
  // in the browser is still there.
  useEffect(() => {
    if (!sessionId) return undefined
    const sync = () => setSession(readSession(sessionId))
    sync()
    scheduleAll(sessionId)
    const unsub = subscribeSession(sessionId, sync)
    const onStorage = (e) => {
      if (e.key === storageKey(sessionId)) sync()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      unsub()
      window.removeEventListener('storage', onStorage)
    }
  }, [sessionId])

  // Listen for new log output, per row
  useEffect(() => {
    if (!sessionId || !session?.rows) return undefined
    const unsubs = session.rows.map((_, index) =>
      subscribeLog(sessionId, index, (logText) => {
        setActiveLogs((prev) =>
          prev[index] === logText ? prev : { ...prev, [index]: logText },
        )
      }),
    )
    return () => unsubs.forEach((fn) => fn())
    // This depends on how MANY rows there are, not on the rows themselves. The
    // array is replaced on every log update, and re-subscribing that often would
    // lose the logs we have buffered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, session?.rows?.length])

  const setCursor = useCallback(
    (index) => {
      if (!sessionId) return
      updateSessionInStorage(sessionId, (s) =>
        s.cursor === index ? s : { ...s, cursor: index },
      )
    },
    [sessionId],
  )

  const retryRow = useCallback(
    (index) => {
      if (!sessionId) return
      updateRowInStorage(sessionId, index, { status: 'PENDING', error: null })
      logBuffers.delete(rowKey(sessionId, index))
      notifyLog(sessionId, index)
      generateRow(sessionId, index)
    },
    [sessionId],
  )

  return {
    session,
    setCursor,
    retryRow,
    activeLogs,
  }
}
