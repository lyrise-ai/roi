const enableClientSentry = process.env.NEXT_PUBLIC_SENTRY_ENABLED !== 'false'
const enableReplay = process.env.NEXT_PUBLIC_SENTRY_REPLAY === 'true'
const enableFeedback = process.env.NEXT_PUBLIC_SENTRY_FEEDBACK === 'true'

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
              buttonLabel: 'Feedback',
              formTitle: 'Something off? Tell us.',
              submitButtonLabel: 'Send',
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
  const schedule =
    window.requestIdleCallback ?? ((callback) => window.setTimeout(callback, 1))
  schedule(() => {
    loadSentry()
  })
}

export const onRouterTransitionStart = (...args) => {
  loadSentry().then((Sentry) => {
    Sentry?.captureRouterTransitionStart?.(...args)
  })
}
