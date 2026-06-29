import * as Sentry from '@sentry/nextjs'
Sentry.init({
  dsn: 'https://35bc0693cb1fdcd1e6e5d2c146ca5c0b@o4511621876678656.ingest.de.sentry.io/4511621883428944',
  integrations: [
    Sentry.replayIntegration({
      maskAllText: false,
      blockAllMedia: false,
      maskAllInputs: false,
    }),
    Sentry.feedbackIntegration({
      colorScheme: 'system',
      buttonLabel: 'Feedback',
      formTitle: 'Something off? Tell us.',
      submitButtonLabel: 'Send',
      enableScreenshot: true,
      autoInject: true,
    }),
  ],
  replaysSessionSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
  replaysOnErrorSampleRate: 1.0,
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
  enableLogs: true,
})
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
