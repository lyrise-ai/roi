// ─────────────────────────────────────────────────────────────────────────────
// Browser tracking. Two tools, one job each (CLAUDE.md explains the split):
//
//   PostHog — the front door: product analytics, session recordings, and the
//             error list we actually work through. It loads straight away,
//             because it has to be running before the first page view and
//             before a recording would have started. Delaying it loses exactly
//             the seconds you want.
//
//   Sentry  — the detail you click through to from a PostHog issue. It loads
//             later, when the browser is idle, because nothing needs it until
//             something has already gone wrong.
//
// PostHog does nothing at all without its token, which is how CI and any dev
// machine that has not opted in stay out of the real project.
// ─────────────────────────────────────────────────────────────────────────────

import { getPostHog } from '@/src/lib/posthog-browser'
import {
  reportFeedbackEvent,
  setFeedbackSource,
} from '@/src/lib/sentryFeedback'

// Only used to build the links from PostHog into Sentry. The project id is the
// last part of the Sentry address below, but the organisation name is not in
// there at all, so it comes from settings. If those links 404, this is the value
// that is wrong.
const SENTRY_ORG = process.env.NEXT_PUBLIC_SENTRY_ORG || 'lyrise'
const SENTRY_PROJECT_ID = 4511621883428944

const enableClientSentry =
  process.env.NODE_ENV !== 'development' &&
  process.env.NEXT_PUBLIC_SENTRY_ENABLED !== 'false'
const enableFeedback = process.env.NEXT_PUBLIC_SENTRY_FEEDBACK !== 'false'

// ── PostHog ──────────────────────────────────────────────────────────────────

// Start loading right away. getPostHog() owns both the settings and the
// promise.
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
          // Recording sessions is PostHog's job. These stay at zero so we never
          // pay two companies to record the same session.
          replaysSessionSampleRate: 0,
          replaysOnErrorSampleRate: 0,
          tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
          enableLogs: true,
        })

        // Links the two together: it stamps the PostHog person and the link to
        // their session recording onto Sentry events, so a Sentry issue opens
        // straight into a recording of the person who hit it. We add it after
        // setup because it needs both libraries loaded, and PostHog loads
        // separately.
        //
        // Sending exceptions on to PostHog stays switched OFF on purpose.
        // posthog-browser.ts already sends browser errors to PostHog itself.
        // Both at once would count each error twice — and since PostHog alerts
        // create the Linear tickets, counting twice means two tickets.
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
