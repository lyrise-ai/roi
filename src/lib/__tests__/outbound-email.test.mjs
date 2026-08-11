// The gate in front of every outbound email. This exists because the e2e
// suite drives the real report-access and share flows against the real
// Supabase project, and both `npm run dev` and a local `npm start` read
// .env.local — which has a working RESEND_API_KEY. Alerts about fixture
// companies reached real inboxes.
//
// The property worth locking in is asymmetric: the gate must block every
// non-production environment, and must NOT block production. Getting the
// first half wrong spams people; getting the second half wrong silently stops
// prospects receiving their report.
import assert from 'node:assert/strict'
import { test } from 'node:test'

const { outboundEmailBlockedReason } = await import('../outboundEmail.ts')

const withEnv = (env, fn) => {
  const saved = {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_ENV: process.env.NEXT_PUBLIC_ENV,
    ALLOW_OUTBOUND_EMAIL: process.env.ALLOW_OUTBOUND_EMAIL,
  }
  for (const key of Object.keys(saved)) delete process.env[key]
  Object.assign(process.env, env)
  try {
    return fn()
  } finally {
    for (const key of Object.keys(saved)) delete process.env[key]
    for (const [key, value] of Object.entries(saved)) {
      if (value !== undefined) process.env[key] = value
    }
  }
}

test('production sends, with or without NEXT_PUBLIC_ENV configured', () => {
  withEnv({ NODE_ENV: 'production' }, () =>
    assert.equal(outboundEmailBlockedReason(), null),
  )
  withEnv({ NODE_ENV: 'production', NEXT_PUBLIC_ENV: 'production' }, () =>
    assert.equal(outboundEmailBlockedReason(), null),
  )
})

test('CI never sends, even though it runs a production build', () => {
  withEnv({ NODE_ENV: 'production', NEXT_PUBLIC_ENV: 'ci' }, () =>
    assert.equal(outboundEmailBlockedReason(), 'NEXT_PUBLIC_ENV=ci'),
  )
})

test('a dev server never sends', () => {
  withEnv({ NODE_ENV: 'development' }, () =>
    assert.equal(outboundEmailBlockedReason(), 'NODE_ENV=development'),
  )
})

// The case that actually leaked: a local production build reading .env.local,
// which is how Playwright's webServer is configured to run in CI mode locally.
test('a local production build flagged as development never sends', () => {
  withEnv({ NODE_ENV: 'production', NEXT_PUBLIC_ENV: 'development' }, () =>
    assert.equal(outboundEmailBlockedReason(), 'NEXT_PUBLIC_ENV=development'),
  )
})

test('ALLOW_OUTBOUND_EMAIL=1 is the deliberate local escape hatch', () => {
  withEnv({ NODE_ENV: 'development', ALLOW_OUTBOUND_EMAIL: '1' }, () =>
    assert.equal(outboundEmailBlockedReason(), null),
  )
})
