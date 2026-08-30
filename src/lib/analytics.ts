// ─────────────────────────────────────────────────────────────────────────────
// analytics — the names of the events this app deliberately records.
//
// Why names live here rather than being typed in at each call site: PostHog
// builds everything — funnels, charts, alerts — on exact event names. A typo
// does not fail, it quietly creates a SECOND event that no chart is watching.
// Renaming one here renames it everywhere.
//
// The list is deliberately short: only the ROI pipeline's own events, which
// exist nowhere else. The demo-tour, feedback and share-link event names are NOT
// here. Those are already fixed by the allowed-types lists in
// pages/api/analytics/* and pages/api/track/share-event.js, which check the
// incoming name before passing it on. Repeating them here would create exactly
// the second copy this file exists to prevent.
//
// Everything else in PostHog — page views, clicks, rage clicks, errors — is
// recorded automatically by the browser library and needs no name from us.
//
// Events are sent through captureServer() in posthog-server.ts. There is no
// browser-side helper because nothing has needed one yet; add one when
// something does.
// ─────────────────────────────────────────────────────────────────────────────

export const EVENTS = {
  /** A report run or a chat edit started. Carries which of the two it was, the
   *  report id, and whether it was an alpha tester or a share link. */
  GENERATION_STARTED: 'roi_generation_started',
  /** A chat-edit run began — the chat half of the same handler. */
  CHAT_MESSAGE_SENT: 'chat_message_sent',
  /** A run finished. Adds duration_ms and client_disconnected. */
  GENERATION_COMPLETED: 'roi_generation_completed',
  /** A run failed. Carries the error, and how long it lasted — so a fast
   *  rejection is easy to tell apart from a four-minute timeout. */
  GENERATION_FAILED: 'roi_generation_failed',
  /** What one run cost. Carries the dollar cost, the token count, which models
   *  were used, and a line per call. */
  LLM_USAGE: 'roi_llm_usage',
  /** An employee successfully deletes a report. */
  REPORT_DELETED: 'report_deleted',
  /** An authenticated report accessor successfully sends a report by email. */
  REPORT_SHARED_VIA_EMAIL: 'report_shared_via_email',
  /** An authorized user completes report validation. */
  VALIDATION_COMPLETED: 'validation_completed',
  /** An authorized user skips report validation. */
  VALIDATION_SKIPPED: 'validation_skipped',
  /** One research run finished. Carries how many findings, how sure it was, how
   *  many calls it made and how many of those failed. This is the one that
   *  answers "how often do we come back with nothing?" without anyone having to
   *  run a harness against a sample of domains. */
  RESEARCH_COMPLETED: 'research_completed',
  /** One tool call failed, and why — timeout, not-found, refused, never-read,
   *  rescue-spent. On its own it is noise; added up across every company it is
   *  the shape of what beats us, measured on real prospects instead of on 25
   *  domains we picked. */
  RESEARCH_CALL_FAILED: 'research_call_failed',
  /** The agent tried to say something about a page we never opened, and was
   *  refused. This is the fabrication alarm. One is normal — it retries with a
   *  real page. A spike means the agent is inventing citations, which is the
   *  exact failure the whole research system was rebuilt to make impossible. */
  RESEARCH_FINDING_REFUSED: 'research_finding_refused',
  /** One V2 agent woke, took a turn and went back to sleep. Carries which agent,
   *  how many turns it took, what it cost and whether it stopped to ask a
   *  question. Waking often is only cheap if each wake is small, and this is
   *  what tells us whether it is. */
  AGENT_WAKE: 'agent_wake',
  /** An agent's saved state crossed the size line. Almost always page text in
   *  `messages` instead of a URL — a row that is read and rewritten on every
   *  wake, getting worse each time, and invisible until somebody looks. */
  AGENT_RUN_TOO_BIG: 'agent_run_too_big',
} as const
