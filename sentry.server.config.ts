import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: 'https://35bc0693cb1fdcd1e6e5d2c146ca5c0b@o4511621876678656.ingest.de.sentry.io/4511621883428944',
  enabled: process.env.NODE_ENV !== 'development',
  // We deliberately do not pick up console output. It used to turn every
  // console.error in the repo — around 80 of them, most inside deliberate
  // catch blocks that had already handled the problem — into a Sentry issue, and
  // therefore a Linear ticket.
  // Real failures still arrive here, either as thrown errors or as explicit
  // calls to report them.
  integrations: [],
  // Vercel's module loader can produce this harmless Node warning on a cold
  // start. It has nothing to do with the request being handled, and should never
  // become a ticket.
  ignoreErrors: [
    /vm\.USE_MAIN_CONTEXT_DEFAULT_LOADER is an experimental feature/,
  ],
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
