import * as Sentry from '@sentry/nextjs'
Sentry.init({
  dsn: 'https://35bc0693cb1fdcd1e6e5d2c146ca5c0b@o4511621876678656.ingest.de.sentry.io/4511621883428944',
  integrations: [
    Sentry.feedbackIntegration({
      colorScheme: 'system',
      buttonLabel: 'Feedback',
      formTitle: 'Something off? Tell us.',
      submitButtonLabel: 'Send',
      enableScreenshot: true,
      autoInject: true,
      onSubmitSuccess: (data) => {
        const key = `${data.email}|${(data.message || '').slice(0, 80)}`
        if ((globalThis as any).__lastFeedbackKey === key) return
        ;(globalThis as any).__lastFeedbackKey = key
        setTimeout(() => {
          delete (globalThis as any).__lastFeedbackKey
        }, 5000)
        fetch('/api/linear/triage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: `[Feedback] ${(data.message || '').slice(0, 80) || 'User feedback'}`,
            description: [
              data.email ? `**Email:** ${data.email}` : null,
              data.name ? `**Name:** ${data.name}` : null,
              data.message ? `**Message:** ${data.message}` : null,
            ]
              .filter(Boolean)
              .join('\n'),
            source: 'Sentry feedback widget',
            priority: 3,
          }),
        }).catch(() => {})
      },
    }),
  ],
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
  enableLogs: true,
})
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
