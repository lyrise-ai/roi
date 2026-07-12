export async function loadSentryFeedback() {
  const Sentry = await import('@sentry/nextjs')
  return Sentry.getFeedback?.() ?? null
}
