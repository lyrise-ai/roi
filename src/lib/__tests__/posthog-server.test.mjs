// The thing that matters most about the server analytics client: with no token
// set, it does absolutely nothing. CI runs the whole browser suite against a
// real database, and if these calls did anything without a token, every CI run
// would pour fake traffic and fake errors into the real PostHog project — the
// one the 2am alerts come from.
//
// The other half is that nothing here throws. These functions sit on the
// report-generation path, where the rule (see CLAUDE.md) is that a failure gives
// a partial result rather than an exception. Analytics is the last thing that
// should ever break a prospect's report.
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
