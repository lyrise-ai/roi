/* eslint-disable no-console */
import * as Sentry from '@sentry/nextjs'
import { APICallError } from 'ai'
import { notifyDevTeam } from '@/src/lib/notifyError'

// OpenAI returns 429 + code "insufficient_quota" when credits run out.
// "rate_limit_exceeded" is a different 429 — transient, not a billing crisis.
// 402 (payment required) is the other billing surface.
const QUOTA_STATUS_CODES = new Set([402, 429])
const QUOTA_SIGNAL_RE =
  /insufficient.quota|billing|credit|quota.exceeded|exceeded.your.current.quota/i

export function isOpenAIQuotaError(err: unknown): boolean {
  if (!(err instanceof Error)) return false

  // Direct message match for any error type
  if (QUOTA_SIGNAL_RE.test(err.message)) return true

  if (APICallError.isInstance(err)) {
    if (!QUOTA_STATUS_CODES.has(err.statusCode ?? 0)) return false
    // Rate-limit 429s that are not billing-related — skip
    if (err.statusCode === 429 && !QUOTA_SIGNAL_RE.test(err.message)) {
      const body = typeof err.responseBody === 'string' ? err.responseBody : ''
      if (!QUOTA_SIGNAL_RE.test(body)) return false
    }
    return true
  }

  return false
}

export async function alertOpenAIQuotaError(
  err: unknown,
  context?: { company?: string | null; mode?: string | null },
): Promise<void> {
  if (!(err instanceof Error)) return

  // Sentry: gives the team visibility in the Sentry dashboard and fires any
  // configured Sentry alerts (e.g. the Sentry → Slack integration).
  try {
    Sentry.captureException(err, {
      tags: { kind: 'openai_quota_exhausted' },
      extra: {
        company: context?.company ?? null,
        mode: context?.mode ?? null,
        statusCode: APICallError.isInstance(err)
          ? (err.statusCode ?? null)
          : null,
      },
    })
  } catch (sentryErr) {
    console.error('[openai-quota-alert] Sentry capture failed:', sentryErr)
  }

  // Immediate email: fire without waiting on Sentry flush. A failed alert
  // must never propagate — the goal is best-effort, not blocking the caller.
  try {
    const statusCode = APICallError.isInstance(err)
      ? (err.statusCode ?? null)
      : null
    const contextEntries: Record<string, string> = {
      'Error type': 'OpenAI quota / billing exhaustion',
    }
    if (statusCode != null) contextEntries['HTTP status'] = String(statusCode)
    if (context?.company) contextEntries['Company'] = context.company
    if (context?.mode) contextEntries['Mode'] = context.mode

    await notifyDevTeam({
      error: `OpenAI quota exhausted: ${err.message.slice(0, 200)}`,
      stack: err.stack,
      context: contextEntries,
    })
  } catch (emailErr) {
    console.error('[openai-quota-alert] email notification failed:', emailErr)
  }
}
