// ─────────────────────────────────────────────────────────────────────────────
// Browser telemetry. Two tools, one job each (see CLAUDE.md for the split):
//
//   PostHog — the front door. Product analytics, session replay, and the error
//             list you actually triage. Loads eagerly: it has to be running
//             before the first pageview and before the replay would have
//             started, so deferring it loses exactly the seconds you want.
//
//   Sentry  — the deep dive you click through to from a PostHog issue. Loads
//             lazily on idle, because nothing needs it until something has
//             already gone wrong.
//
// PostHog no-ops without NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN, which is how CI and
// un-opted-in dev environments stay out of the production project.
// ─────────────────────────────────────────────────────────────────────────────

import { getPostHog } from '@/src/lib/posthog-browser'
import {
  reportFeedbackEvent,
  setFeedbackSource,
} from '@/src/lib/sentryFeedback'

// Used only to build the PostHog→Sentry links. The project id is the last path
// segment of the DSN below; the org *slug* isn't in the DSN, so it comes from
// env — if the links 404, this is the value that's wrong.
const SENTRY_ORG = process.env.NEXT_PUBLIC_SENTRY_ORG || 'lyrise'
const SENTRY_PROJECT_ID = 4511621883428944

const enableClientSentry =
  process.env.NODE_ENV !== 'development' &&
  process.env.NEXT_PUBLIC_SENTRY_ENABLED !== 'false'
const enableFeedback = process.env.NEXT_PUBLIC_SENTRY_FEEDBACK !== 'false'

// ── PostHog ──────────────────────────────────────────────────────────────────

// Start loading immediately — getPostHog() owns the config and the promise.
const posthogReady = getPostHog()

// ── Sentry ───────────────────────────────────────────────────────────────────

let sentryPromise: Promise<typeof import('@sentry/nextjs') | null> | null = null

function loadSentry() {
  if (!enableClientSentry) return Promise.resolve(null)
  if (!sentryPromise) {
    sentryPromise = import('@sentry/nextjs')
      .then((Sentry) => {
        const integrations = []

        if (enableFeedback) {
          integrations.push(
            Sentry.feedbackIntegration({
              colorScheme: 'system',
              triggerLabel: 'Feedback',
              triggerAriaLabel: 'Share feedback',
              formTitle: 'Got thoughts? We want them.',
              messagePlaceholder:
                "What worked, what didn't, what confused you?",
              submitButtonLabel: 'Send feedback',
              successMessageText: "Thanks! We'll dig into this.",
              enableScreenshot: true,
              autoInject: true,
              onFormOpen: () =>
                reportFeedbackEvent('sentry_feedback_form_opened'),
              onFormClose: () => {
                reportFeedbackEvent('sentry_feedback_form_abandoned')
                setFeedbackSource(null)
              },
              onSubmitSuccess: (_data, eventId) =>
                reportFeedbackEvent('sentry_feedback_form_submitted', {
                  event_id: eventId,
                }),
              onSubmitError: (err) =>
                reportFeedbackEvent('sentry_feedback_form_error', {
                  error_message: err?.message,
                }),
              onFormSubmitted: () => setFeedbackSource(null),
            }),
          )
        }

        Sentry.init({
          dsn: 'https://35bc0693cb1fdcd1e6e5d2c146ca5c0b@o4511621876678656.ingest.de.sentry.io/4511621883428944',
          integrations,
          // Replay is PostHog's job. These stay at 0 so we never pay two
          // vendors to record the same session.
          replaysSessionSampleRate: 0,
          replaysOnErrorSampleRate: 0,
          tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
          enableLogs: true,
        })

        // Two-way link: stamps the PostHog person and session replay URL onto
        // Sentry events, so a Sentry issue opens straight into the recording of
        // the user who hit it. Added after init because it needs both SDKs
        // loaded, and PostHog is on its own async chunk.
        //
        // sendExceptionsToPostHog stays false on purpose — capture_exceptions
        // in posthog-browser.ts already sends client exceptions to PostHog.
        // Both on would double-count, and since PostHog alerts open the Linear
        // tickets, a double count is a duplicate ticket.
        posthogReady
          .then((posthog) => {
            if (!posthog) return
            Sentry.addIntegration(
              posthog.sentryIntegration({
                organization: SENTRY_ORG,
                projectId: SENTRY_PROJECT_ID,
                sendExceptionsToPostHog: false,
              }),
            )
          })
          .catch(() => {})

        return Sentry
      })
      .catch(() => null)
  }
  return sentryPromise
}

if (typeof window !== 'undefined') {
  if (window.requestIdleCallback) {
    window.requestIdleCallback(() => loadSentry(), { timeout: 1500 })
  } else {
    window.setTimeout(() => loadSentry(), 1)
  }
}

export const onRouterTransitionStart = (...args) => {
  loadSentry().then((Sentry) => {
    Sentry?.captureRouterTransitionStart?.(...args)
  })
}
