/* eslint-disable no-console */
import * as Sentry from '@sentry/nextjs'
import { APICallError } from 'ai'
import { notifyDevTeam } from '@/src/lib/notifyError'
import { captureServerException, flushPostHog } from '@/src/lib/posthog-server'

// When our OpenAI credit runs out, they refuse the request with the code
// "insufficient_quota". A refusal marked "rate_limit_exceeded" is a different
// thing: it passes on its own and is not a billing problem. "Payment required"
// is the other way billing trouble shows up.
const QUOTA_STATUS_CODES = new Set([402, 429])
const QUOTA_SIGNAL_RE =
  /insufficient.quota|billing|credit|quota.exceeded|exceeded.your.current.quota/i

export function isOpenAIQuotaError(err: unknown): boolean {
  if (!(err instanceof Error)) return false

  // Check the error text itself, whatever kind of error it is
  if (QUOTA_SIGNAL_RE.test(err.message)) return true

  if (APICallError.isInstance(err)) {
    if (!QUOTA_STATUS_CODES.has(err.statusCode ?? 0)) return false
    // A plain rate limit with nothing about billing in it — ignore
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

  // Sentry, so the team can see it on the dashboard and any Sentry alerts fire
  // — for example the one that posts to Slack.
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

  // PostHog as well. This is the failure that stops every report at once, so it
  // has to appear in the list that creates the Linear ticket, not only in
  // Sentry. This call never throws.
  captureServerException(err, {
    kind: 'openai_quota_exhausted',
    company: context?.company ?? null,
    mode: context?.mode ?? null,
  })
  await flushPostHog()

  // Send the email straight away, without waiting for Sentry to finish. A
  // failed alert must never be passed on to the caller: we try our best and
  // never block.
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
