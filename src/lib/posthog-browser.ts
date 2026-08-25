// ─────────────────────────────────────────────────────────────────────────────
// posthog-browser — the analytics client that runs in the browser. Named to
// match supabase-browser.js.
//
// It exists to solve two problems:
//
// 1. **Download size.** The PostHog library is about 68kB. Imported the normal
//    way, that lands in the main bundle for every page. Loading it separately,
//    as we do below, puts it in its own file. We start that load immediately,
//    so in practice it arrives a few hundred milliseconds after the page
//    appears. What that costs us is the first moment of the session recording,
//    not the recording itself.
//
// 2. **Calls that arrive before it has loaded.** Identifying a user on sign-in,
//    or recording an action, can happen before the library is ready. Checking
//    "is it loaded yet" at each call site would quietly throw those away — and
//    an anonymous session that never gets tied to its user is exactly what we
//    are trying to avoid. So every caller waits on the same promise, and calls
//    line up behind loading instead of racing it.
//
// It gives back nothing at all when the PostHog token is unset, which is how CI
// and any dev machine that has not opted in stay out of the real project.
// ─────────────────────────────────────────────────────────────────────────────

import type { PostHog } from 'posthog-js'

let ready: Promise<PostHog | null> | null = null

export function getPostHog(): Promise<PostHog | null> {
  if (ready) return ready

  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST
  if (typeof window === 'undefined') {
    ready = Promise.resolve(null)
    return ready
  }

  if (!token || !host) {
    if (process.env.NODE_ENV === 'development') {
      const missingVariable = token
        ? 'NEXT_PUBLIC_POSTHOG_HOST'
        : 'NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN'
      throw new Error(
        `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`,
      )
    }

    ready = Promise.resolve(null)
    return ready
  }

  ready = import('posthog-js')
    .then(({ default: posthog }) => {
      posthog.init(token, {
        api_host: host,

        // Lets the library pass its current person and session ids through to
        // our own API on the same domain. Server code may use those as
        // analytics context, but must still check who someone is
        // separately.
        tracing_headers: [window.location.hostname],

        // Pins all the defaults to one dated set, rather than "whatever this
        // version of the library thinks today". That way an npm upgrade cannot
        // quietly change what we collect.
        //
        // Among other things, this set counts a page view every time the app
        // moves between pages. Before it, we only counted the first page of
        // each full browser load.
        //
        // This is the value PostHog's own Next.js guide uses. Newer sets exist;
        // do not move to one without reading their changelog for what
        // changes.
        defaults: '2026-05-30',

        // Record browser errors automatically. Sentry sees them too, but
        // PostHog is where we actually work through them.
        capture_exceptions: true,

        session_recording: {
          // Where we draw the privacy line. Reports contain a named prospect's
          // finances, and a session recording is useless if it cannot show
          // them, so text on the page stays visible. Everything TYPED is
          // hidden, which covers the login form and the intake form.
          maskAllInputs: true,
          // Two ways out: add `ph-mask` to hide an element's text, or
          // `ph-no-capture` to leave the element out of the recording
          // entirely.
          maskTextClass: 'ph-mask',
          blockClass: 'ph-no-capture',
        },

        // The two settings that turn a recording into something you can debug
        // rather than just watch: what the console said, and which request was
        // slow. The ROI pipeline reports its progress as it goes, so this plays
        // the generation log back in step with what the user was looking at.
        enable_recording_console_log: true,
        capture_performance: true,
      })
      return posthog
    })
    .catch(() => null)

  return ready
}
