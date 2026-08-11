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
 * environment that is not explicitly a test one. Vercel sets NODE_ENV itself,
 * so production keeps working whether or not NEXT_PUBLIC_ENV is configured
 * there.
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
  if (process.env.NODE_ENV !== 'production') {
    return `NODE_ENV=${process.env.NODE_ENV}`
  }
  const env = process.env.NEXT_PUBLIC_ENV
  if (env && TEST_ENVS.has(env)) return `NEXT_PUBLIC_ENV=${env}`
  return null
}
