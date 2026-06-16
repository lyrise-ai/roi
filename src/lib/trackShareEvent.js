// ─────────────────────────────────────────────────────────────────────────────
// trackShareEvent — client-side helper to log share-link recipient behaviour.
//
// Fire-and-forget; never throws into the UI. Posts to /api/track/share-event,
// which validates the share token before writing to the `events` table.
//
// For session-end we prefer navigator.sendBeacon: it survives the page being
// closed/navigated away, which a normal fetch does not. That's what lets us
// reliably capture how long the recipient spent in the chat panel.
// ─────────────────────────────────────────────────────────────────────────────

export function trackShareEvent({ reportId, shareToken, type, durationMs }) {
  if (!reportId || !shareToken || !type) return
  const payload = JSON.stringify({ reportId, shareToken, type, durationMs })

  try {
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.sendBeacon === 'function'
    ) {
      const blob = new Blob([payload], { type: 'application/json' })
      navigator.sendBeacon('/api/track/share-event', blob)
      return
    }
  } catch {
    /* fall through to fetch */
  }

  try {
    fetch('/api/track/share-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true, // best-effort if the page is unloading
    }).catch(() => {})
  } catch {
    /* tracking must never break the page */
  }
}
