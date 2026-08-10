// ─────────────────────────────────────────────────────────────────────────────
// posthog-browser — the browser PostHog client. Named to match
// supabase-browser.js.
//
// Two things this exists to solve:
//
// 1. **Bundle size.** posthog-js is ~68kB of the main chunk if imported
//    statically, on every page. The dynamic import below moves it into its own
//    async chunk. Kicked off immediately from instrumentation-client.ts, so in
//    practice it lands within a few hundred ms of first paint — the cost is
//    the first moments of the session recording, not the recording.
//
// 2. **The init race.** Callers (identify on auth, capture on user action) can
//    fire before the SDK has finished loading. Guarding each call site on
//    `__loaded` would silently drop those — an anonymous session that never
//    gets linked to its user. Everyone awaits the same promise instead, so
//    calls queue behind init rather than racing it.
//
// Resolves to null when NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is unset, which is
// how CI and un-opted-in dev environments stay out of the production project.
// ─────────────────────────────────────────────────────────────────────────────

import type { PostHog } from 'posthog-js'

let ready: Promise<PostHog | null> | null = null

export function getPostHog(): Promise<PostHog | null> {
  if (ready) return ready

  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
  if (typeof window === 'undefined' || !token) {
    ready = Promise.resolve(null)
    return ready
  }

  ready = import('posthog-js')
    .then(({ default: posthog }) => {
      posthog.init(token, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,

        // Pins the whole defaults bundle to a dated set rather than "whatever
        // this SDK version thinks today", so an npm upgrade can't quietly
        // change what we collect. Among other things this makes
        // capture_pageview 'history_change', which is what makes Pages Router
        // client-side navigations register — the previous init captured only
        // the first pageview per hard load.
        defaults: '2026-06-25',

        // Client-side exception autocapture. Sentry sees these too; PostHog is
        // where they get triaged.
        capture_exceptions: true,

        session_recording: {
          // The privacy line for this app. Reports carry a named prospect's
          // financials, and a replay is worthless if it can't show them — so
          // rendered text stays visible. Everything *typed* is masked, which
          // covers the login form and the ROI intake form.
          maskAllInputs: true,
          // Escape hatches: `ph-mask` hides an element's text, `ph-no-capture`
          // blocks the element entirely.
          maskTextClass: 'ph-mask',
          blockClass: 'ph-no-capture',
        },

        // The two settings that make a replay debuggable rather than just a
        // video: what the console said, and which request was slow. The ROI
        // pipeline logs its progress over SSE, so this replays the generation
        // log in sync with what the user was looking at.
        enable_recording_console_log: true,
        capture_performance: true,
      })
      return posthog
    })
    .catch(() => null)

  return ready
}
