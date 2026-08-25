export async function loadSentryFeedback() {
  const Sentry = await import('@sentry/nextjs')
  return Sentry.getFeedback?.() ?? null
}

// Sentry's feedback form tells us when it opens, closes and is submitted — but
// those callbacks are global and carry no clue about WHICH button opened the
// form.
//
// Only one feedback form can be open at a time, so each place that opens one
// records where it came from just beforehand, and we read that back when the
// global callbacks fire.
let activeFeedbackSource = null

export function setFeedbackSource(source) {
  activeFeedbackSource = source
}

export function reportFeedbackEvent(eventType, extra = {}) {
  if (typeof navigator === 'undefined' || !navigator.sendBeacon) return
  const payload = JSON.stringify({
    event_type: eventType,
    source: activeFeedbackSource ?? 'global-widget',
    ...extra,
  })
  navigator.sendBeacon(
    '/api/analytics/feedback-event',
    new Blob([payload], { type: 'application/json' }),
  )
}
