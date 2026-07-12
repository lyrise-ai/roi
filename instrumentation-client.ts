const enableClientSentry = process.env.NEXT_PUBLIC_SENTRY_ENABLED !== 'false'
const enableReplay = process.env.NEXT_PUBLIC_SENTRY_REPLAY === 'true'
const enableFeedback = process.env.NEXT_PUBLIC_SENTRY_FEEDBACK !== 'false'

let sentryPromise = null

function loadSentry() {
  if (!enableClientSentry) return Promise.resolve(null)
  if (!sentryPromise) {
    sentryPromise = import('@sentry/nextjs')
      .then((Sentry) => {
        const integrations = []

        if (enableReplay) {
          integrations.push(
            Sentry.replayIntegration({
              maskAllText: false,
              blockAllMedia: false,
              maskAllInputs: false,
            }),
          )
        }

        if (enableFeedback) {
          integrations.push(
            Sentry.feedbackIntegration({
              colorScheme: 'system',
              triggerLabel: 'Feedback',
              triggerAriaLabel: 'Share feedback',
              formTitle: 'Got thoughts? We want them.',
              messagePlaceholder:
                "What worked, what didn't, what confused you?",
              submitButtonLabel: 'Send feedback',
              successMessageText: "Thanks! We'll dig into this.",
              enableScreenshot: true,
              autoInject: true,
            }),
          )
        }

        Sentry.init({
          dsn: 'https://35bc0693cb1fdcd1e6e5d2c146ca5c0b@o4511621876678656.ingest.de.sentry.io/4511621883428944',
          integrations,
          replaysSessionSampleRate: enableReplay
            ? process.env.NODE_ENV === 'development'
              ? 1.0
              : 0.1
            : 0,
          replaysOnErrorSampleRate: enableReplay ? 1.0 : 0,
          tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
          enableLogs: true,
        })

        return Sentry
      })
      .catch(() => null)
  }
  return sentryPromise
}

if (typeof window !== 'undefined') {
  if (window.requestIdleCallback) {
    window.requestIdleCallback(() => loadSentry(), { timeout: 1500 })
  } else {
    window.setTimeout(() => loadSentry(), 1)
  }
}

export const onRouterTransitionStart = (...args) => {
  loadSentry().then((Sentry) => {
    Sentry?.captureRouterTransitionStart?.(...args)
  })
}
