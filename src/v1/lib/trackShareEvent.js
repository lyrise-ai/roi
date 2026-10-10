// ─────────────────────────────────────────────────────────────────────────────
// trackShareEvent — records what someone on a share link did. Runs in the
// browser.
//
// We start it and move on; it never throws into the interface. It posts to
// /api/track/share-event, which checks the share token before writing anything.
//
// When a session ends we use the browser's "send this even if I'm leaving"
// method instead of a normal request. A normal request dies when the page
// closes; that one survives. It is what lets us reliably capture how long
// someone spent in the chat panel.
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
    }).catch((err) => {
      console.error('[share-event] fetch failed:', err)
    })
  } catch (err) {
    console.error('[share-event] tracking failed:', err)
  }
}
