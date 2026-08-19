/* One gate in front of every outbound email.
 *
 * There are four independent `fetch('https://api.resend.com/emails')` call
 * sites in this repo (report delivery, report-access alerts, usage alerts,
 * alpha-tour notifications). Nothing stopped them firing from a test run: the
 * e2e suite drives the real report-access and share flows against the real
 * Supabase project, and both `npm run dev` and a local `npm start` read
 * `.env.local` — which has a working RESEND_API_KEY. That put alerts about
 * fixture companies in real inboxes.
 *
 * The gate is deliberately written so it can only ever *add* a block, never
 * remove one that production depends on: sending requires
 * `NODE_ENV === 'production'` (so no dev server ever sends) and an
 * environment that is not explicitly a test one.
 *
 * On Vercel the decision comes from `VERCEL_ENV`, which the platform sets and
 * nobody can typo, rather than from `NEXT_PUBLIC_ENV`, which is ours. The
 * original version trusted `NEXT_PUBLIC_ENV` everywhere on the assumption that
 * production either left it unset or set it to `production`. It was set to a
 * test value there, so from 2026-08-12 the gate silently suppressed every
 * production email — a 28-report bulk batch generated on 2026-08-17 reached
 * Resend zero times. Preview deployments are now blocked too, which is the
 * direction this gate is allowed to move in.
 *
 * To send for real from a local machine, set ALLOW_OUTBOUND_EMAIL=1.
 */

// `ci` is what .github/workflows/e2e.yml sets; `development` is what a
// developer's .env.local sets. Neither should ever reach a real inbox.
const TEST_ENVS = new Set(['ci', 'development', 'test'])

/**
 * Returns null when it is safe to send, or a short human-readable reason when
 * the send must be skipped. Callers log the reason and return without
 * throwing — a suppressed email is never an error.
 */
export function outboundEmailBlockedReason(): string | null {
  if (process.env.ALLOW_OUTBOUND_EMAIL === '1') return null
  // Platform-owned, so it cannot drift from what the deployment actually is.
  if (process.env.VERCEL_ENV) {
    return process.env.VERCEL_ENV === 'production'
      ? null
      : `VERCEL_ENV=${process.env.VERCEL_ENV}`
  }
  if (process.env.NODE_ENV !== 'production') {
    return `NODE_ENV=${process.env.NODE_ENV}`
  }
  const env = process.env.NEXT_PUBLIC_ENV
  if (env && TEST_ENVS.has(env)) return `NEXT_PUBLIC_ENV=${env}`
  return null
}
