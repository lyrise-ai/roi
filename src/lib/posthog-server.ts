// ─────────────────────────────────────────────────────────────────────────────
// posthog-server — the analytics client that runs on the server.
//
// Named to match supabase-server.js: "-server" means it runs in API routes and
// never goes to the browser. The browser has its own, set up in
// instrumentation-client.ts.
//
// Two things make it different from the browser one:
//
// 1. There must only ever be one. Vercel reuses a warm server across requests,
//    and creating a new client per request would leave a timer behind every
//    time.
// 2. Nothing here may throw. This sits on the report-generation path (see
//    CLAUDE.md), and analytics failing is never a reason for a prospect's
//    report to fail. Every function here swallows its own errors.
//
// It returns nothing when the PostHog token is unset — the case in CI and on any
// dev machine that has not opted in — so callers never have to check first.
// ─────────────────────────────────────────────────────────────────────────────

import { PostHog } from 'posthog-node'

let client: PostHog | null = null
let initialised = false

export function getPostHogServer(): PostHog | null {
  if (initialised) return client
  initialised = true

  const key = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
  if (!key) return null

  try {
    client = new PostHog(key, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      // On Vercel a request can finish before a batching timer would fire, so we
      // keep batches at one event and let the helper below force the send.
      flushAt: 1,
      flushInterval: 0,
    })
  } catch {
    client = null
  }

  return client
}

/**
 * Records one event from the server. Callers start it and move on; nothing on
 * the request path waits for it, and it never throws.
 */
export function captureServer(
  event: string,
  properties?: Record<string, unknown>,
  distinctId?: string | null,
): void {
  const ph = getPostHogServer()
  if (!ph) return
  try {
    ph.capture({
      // An event with no signed-in user still needs some id. One fixed value
      // keeps them together, rather than inventing a new person per request.
      distinctId: distinctId || 'server',
      event,
      properties,
    })
  } catch {
    /* telemetry must not break the caller */
  }
}

/**
 * Records an error so it shows up in PostHog's error list.
 */
export function captureServerException(
  error: unknown,
  properties?: Record<string, unknown>,
  distinctId?: string | null,
): void {
  const ph = getPostHogServer()
  if (!ph) return
  try {
    ph.captureException(
      error instanceof Error ? error : new Error(String(error)),
      distinctId || 'server',
      properties,
    )
  } catch {
    /* telemetry must not break the caller */
  }
}

/**
 * Push anything buffered before the lambda freezes. Await this at the end of a
 * handler that captured events; on Vercel the process can be suspended the
 * instant the response is sent, taking unflushed events with it.
 */
export async function flushPostHog(): Promise<void> {
  const ph = getPostHogServer()
  if (!ph) return
  try {
    await ph.flush()
  } catch {
    /* a dropped event is not worth a failed request */
  }
}
