// ─────────────────────────────────────────────────────────────────────────────
// posthog-server — the server-side PostHog client.
//
// Named to match supabase-server.js: `-server` means "runs in the API route /
// instrumentation, never shipped to the browser". The browser gets posthog-js,
// initialised in instrumentation-client.ts.
//
// Two things make this different from the browser client:
//
// 1. It must be a singleton. Vercel reuses a warm lambda across requests, and a
//    new PostHog() per request would leak a flush timer each time.
// 2. Nothing here may throw. This module sits on the report-generation path
//    (see CLAUDE.md) and telemetry failing is never a reason for a prospect's
//    report to fail. Every export swallows.
//
// Returns null when NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is unset — which is the
// case in CI and in any dev environment that hasn't opted in — so callers can
// stay unconditional.
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
      // Serverless: a request can end before a batch timer would fire, so keep
      // batches small and let flushIfServerless() below force the send.
      flushAt: 1,
      flushInterval: 0,
    })
  } catch {
    client = null
  }

  return client
}

/**
 * Capture a server-side event. Fire-and-forget — never awaited by callers on
 * the request path, never throws.
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
      // Server events without a signed-in user still need an id. A stable
      // literal keeps them grouped rather than inventing a person per request.
      distinctId: distinctId || 'server',
      event,
      properties,
    })
  } catch {
    /* telemetry must not break the caller */
  }
}

/**
 * Capture an exception for PostHog error tracking.
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
