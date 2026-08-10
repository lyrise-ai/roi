import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Errors from Server Components, middleware, API routes and proxies. Both
// tools get every one: Sentry for the source-mapped stack trace, PostHog so it
// lands in the issue list that raises the Linear ticket.
export async function onRequestError(
  err: unknown,
  request: Parameters<typeof Sentry.captureRequestError>[1],
  context: Parameters<typeof Sentry.captureRequestError>[2],
) {
  Sentry.captureRequestError(err, request, context)

  // posthog-node is a Node-only module — importing it in the edge runtime
  // throws at module load, which would turn every edge error into two errors.
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
    // The lambda can freeze the moment the response is sent, so push it now
    // rather than trusting a batch timer that may never fire.
    await flushPostHog()
  } catch {
    // Reporting an error must never itself become an error.
  }
}
