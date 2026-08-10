import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: 'https://35bc0693cb1fdcd1e6e5d2c146ca5c0b@o4511621876678656.ingest.de.sentry.io/4511621883428944',
  enabled: process.env.NODE_ENV !== 'development',
  // See sentry.server.config.ts — console capture is off on purpose.
  integrations: [],
  dataCollection: {
    // To disable sending user data and HTTP bodies, uncomment the lines below. For more info visit:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#dataCollection
    // userInfo: false,
    // httpBodies: [],
  },
  // Development telemetry is disabled above; sample production traces at 10%.
  tracesSampleRate: 0.1,
  // Enable logs to be sent to Sentry
  enableLogs: true,
})
