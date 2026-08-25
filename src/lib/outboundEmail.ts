/* One check in front of every email this app sends.
 *
 * Four separate places in this repo call Resend directly: report delivery,
 * report-access alerts, usage alerts, and alpha-tour notifications. Nothing
 * stopped any of them firing during a test run. The browser test suite drives
 * the real access and sharing flows against the real database, and both
 * `npm run dev` and a local `npm start` read `.env.local`, which holds a
 * working Resend key. So alerts about made-up test companies were landing in
 * real inboxes.
 *
 * This check is written so it can only ever ADD a reason not to send, never
 * remove one production depends on. Sending requires that we are running in
 * production, so no dev server ever sends, and that the environment is not
 * explicitly a test one.
 *
 * On Vercel we decide from the platform's own environment variable, which
 * Vercel sets and nobody can mistype, rather than from ours. The first version
 * trusted ours everywhere, assuming production either left it unset or set it
 * to "production". It was actually set to a test value there — so from
 * 2026-08-12 this check silently blocked every production email, and a
 * 28-report batch generated on 2026-08-17 never reached Resend at all.
 * Preview deployments are now blocked too, which is the direction this check is
 * allowed to move in.
 *
 * To really send from your own machine, set ALLOW_OUTBOUND_EMAIL=1.
 */

// "ci" is what our GitHub workflow sets; "development" is what a developer's
// .env.local sets. Neither should ever reach a real inbox.
const TEST_ENVS = new Set(['ci', 'development', 'test'])

/**
 * Returns nothing when it is safe to send, or a short readable reason when the
 * email must be skipped. Callers log the reason and carry on. A blocked email is
 * never an error.
 */
export function outboundEmailBlockedReason(): string | null {
  if (process.env.ALLOW_OUTBOUND_EMAIL === '1') return null
  // Vercel sets this itself, so it can never disagree with what the deployment
  // actually is.
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
