// ─────────────────────────────────────────────────────────────────────────────
// analytics — the one place a PostHog event gets its name.
//
// Why a constant instead of string literals at the call site: PostHog builds
// its whole UI (funnels, insights, alerts) around exact event names. A typo
// doesn't error, it silently creates a second event that no dashboard is
// watching. Renaming one here renames it everywhere.
//
// This module deliberately imports nothing at the top level. API routes need
// the names, and a static `import posthog from 'posthog-js'` here would drag
// the browser SDK into every serverless bundle that wants a string. `track()`
// below loads it dynamically instead.
//
// Server-side capture does NOT live here — it's captureServer() in
// posthog-server.ts, which owns the posthog-node singleton.
// ─────────────────────────────────────────────────────────────────────────────

export const EVENTS = {
  // ── The ROI pipeline. This is the 2am payload. ──
  /** A generation run began. Properties: mode, company, is_alpha. */
  GENERATION_STARTED: 'roi_generation_started',
  /** A run finished and produced a report. Adds duration_ms, workflow_count. */
  GENERATION_COMPLETED: 'roi_generation_completed',
  /** A run died. Adds error_message, and duration_ms so you can tell a fast
   *  validation reject from a 4-minute timeout. */
  GENERATION_FAILED: 'roi_generation_failed',
  /** Token spend for one run, from UsageTracker.flush(). Adds cost_usd,
   *  total_tokens and a per-call breakdown. */
  LLM_USAGE: 'roi_llm_usage',

  // ── Report interaction ──
  CHAT_MESSAGE_SENT: 'chat_message_sent',
  VALIDATION_COMPLETED: 'validation_completed',
  VALIDATION_SKIPPED: 'validation_skipped',
  SHARE_LINK_OPENED: 'chat_link_opened',
  REPORT_EMAIL_SENT: 'email_sent',
  REPORT_EMAIL_ERROR: 'email_error',

  // ── Demo tour ──
  DEMO_TOUR_STARTED: 'demo_tour_started',
  DEMO_TOUR_STEP_VIEW: 'demo_tour_step_view',
  DEMO_TOUR_SKIPPED: 'demo_tour_skipped',
  DEMO_TOUR_COMPLETED: 'demo_tour_completed',
  DEMO_TOUR_CHIP_CLICKED: 'demo_tour_chip_clicked',

  // ── Feedback widget funnel (Sentry renders it, PostHog counts it) ──
  // Named for the widget that emits them, and matching the strings already in
  // the Supabase events table — renaming would orphan the existing rows.
  FEEDBACK_FORM_OPENED: 'sentry_feedback_form_opened',
  FEEDBACK_FORM_ABANDONED: 'sentry_feedback_form_abandoned',
  FEEDBACK_FORM_SUBMITTED: 'sentry_feedback_form_submitted',
  FEEDBACK_FORM_ERROR: 'sentry_feedback_form_error',
} as const

export type AnalyticsEvent = (typeof EVENTS)[keyof typeof EVENTS]

/**
 * Capture a client-side event.
 *
 * No-ops when PostHog isn't configured (CI, and any dev environment without a
 * token), so call sites stay unconditional. Never throws — an analytics failure
 * has no business surfacing in the UI.
 */
export function track(
  event: AnalyticsEvent,
  properties?: Record<string, unknown>,
): void {
  if (typeof window === 'undefined') return
  // Awaits the shared init promise rather than checking a "is it loaded yet"
  // flag — an early click would otherwise be dropped instead of queued.
  import('@/src/lib/posthog-browser')
    .then(({ getPostHog }) => getPostHog())
    .then((posthog) => posthog?.capture(event, properties))
    .catch(() => {})
}
