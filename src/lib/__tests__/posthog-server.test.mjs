// The load-bearing property of the server client: with no project token it is
// completely inert. CI runs the full Playwright suite against a real Supabase
// project, and if these calls did anything without a token, every CI run would
// pour synthetic traffic and fake "errors" into the production PostHog project
// — the one the 2am alerts fire from.
//
// The other half is that nothing here throws. These functions sit on the
// report-generation path, where CLAUDE.md's rule is that a failure degrades to
// a partial result rather than an exception, and telemetry is the last thing
// that should ever break a prospect's report.
import assert from 'node:assert/strict'
import { test } from 'node:test'

delete process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN

const {
  getPostHogServer,
  captureServer,
  captureServerException,
  flushPostHog,
} = await import('../posthog-server.ts')

test('no token means no client at all', () => {
  assert.equal(getPostHogServer(), null)
})

test('capture is a no-op rather than a crash when unconfigured', () => {
  assert.doesNotThrow(() => captureServer('roi_generation_started', { a: 1 }))
  assert.doesNotThrow(() => captureServer('evt', undefined, null))
})

test('exception capture survives non-Error values', () => {
  assert.doesNotThrow(() => captureServerException(new Error('boom')))
  assert.doesNotThrow(() => captureServerException('a string'))
  assert.doesNotThrow(() => captureServerException(undefined))
})

test('flush resolves instead of hanging when unconfigured', async () => {
  await assert.doesNotReject(flushPostHog())
})
