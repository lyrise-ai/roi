import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Errors from everything running on the server. Both tools get every one:
// Sentry for the readable stack trace, PostHog so it lands in the error list
// that creates the Linear ticket.
export async function onRequestError(
  err: unknown,
  request: Parameters<typeof Sentry.captureRequestError>[1],
  context: Parameters<typeof Sentry.captureRequestError>[2],
) {
  Sentry.captureRequestError(err, request, context)

  // PostHog's server library only runs under Node. Importing it in the lighter
  // edge runtime fails at load, which would turn every edge error into two.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  try {
    const { captureServerException, flushPostHog } =
      await import('./src/lib/posthog-server')
    captureServerException(err, {
      $process_person_profile: false,
      path: request?.path,
      method: request?.method,
      router: context?.routerKind,
      route: context?.routePath,
      route_type: context?.routeType,
    })
    // The server can be frozen the moment the response is sent, so send this now
    // rather than trusting a timer that may never fire.
    await flushPostHog()
  } catch {
    // Reporting an error must never itself cause one.
  }
}
