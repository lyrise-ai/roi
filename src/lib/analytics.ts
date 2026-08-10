// ─────────────────────────────────────────────────────────────────────────────
// analytics — names for the PostHog events this app emits deliberately.
//
// Why a constant instead of string literals at the call site: PostHog builds
// its whole UI (funnels, insights, alerts) around exact event names. A typo
// doesn't error, it silently creates a second event that no dashboard is
// watching. Renaming one here renames it everywhere.
//
// Scope is deliberately narrow — only the ROI pipeline's own telemetry, which
// exists nowhere else. The demo-tour, feedback and share-link events are NOT
// listed here: those names are already fixed by the VALID_TYPES sets in
// pages/api/analytics/* and pages/api/track/share-event.js, which validate the
// incoming event_type before mirroring it to PostHog. Restating them here would
// create the second source of truth this file exists to prevent.
//
// Everything else in PostHog — pageviews, clicks, rageclicks, exceptions — is
// autocaptured by the browser SDK and needs no name from us.
//
// Capture goes through captureServer() in posthog-server.ts. There is no
// client-side capture helper because nothing has needed one yet; add one when
// something does.
// ─────────────────────────────────────────────────────────────────────────────

export const EVENTS = {
  /** A generation or chat-edit run began. Properties: mode, company, is_alpha. */
  GENERATION_STARTED: 'roi_generation_started',
  /** A chat-edit run began — the chat half of the same handler. */
  CHAT_MESSAGE_SENT: 'chat_message_sent',
  /** A run finished. Adds duration_ms and client_disconnected. */
  GENERATION_COMPLETED: 'roi_generation_completed',
  /** A run died. Adds error_message, and duration_ms so a fast validation
   *  reject is distinguishable from a four-minute timeout. */
  GENERATION_FAILED: 'roi_generation_failed',
  /** Token spend for one run, from UsageTracker.flush(). Adds cost_usd,
   *  total_tokens, models, and a per-call breakdown. */
  LLM_USAGE: 'roi_llm_usage',
} as const
