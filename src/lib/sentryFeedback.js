export async function loadSentryFeedback() {
  const Sentry = await import('@sentry/nextjs')
  return Sentry.getFeedback?.() ?? null
}

// Sentry's feedback form callbacks (onFormOpen/onFormClose/onSubmitSuccess)
// are global singletons with no argument identifying which touchpoint
// triggered them. Since only one feedback form can be open at a time, call
// sites set the active source right before opening their form, and the
// global callbacks in instrumentation-client.ts read it back when logging.
let activeFeedbackSource = null

export function setFeedbackSource(source) {
  activeFeedbackSource = source
}

export function getFeedbackSource() {
  return activeFeedbackSource
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
