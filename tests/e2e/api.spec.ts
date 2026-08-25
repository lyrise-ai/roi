/**
 * Tests for how our API endpoints behave. Runs signed out.
 *
 * Three promises:
 *   1. A route that only accepts POST answers a GET with "method not allowed",
 *      not "not found" or an error.
 *   2. A protected route answers "not signed in", never an error.
 *   3. A route with a missing required field answers "bad request".
 *
 * None of these tests make a real model or email call.
 */
import { test, expect } from '@playwright/test'

// ── 1. Method guards ─────────────────────────────────────────────────────────

test.describe('method guards (GET on POST-only endpoints → 405)', () => {
  // Note: /api/roi-agent accepts both GET, for chat, and POST, for generating.
  // Both need you signed in, so a signed-out GET answers "not signed in" rather
  // than "method not allowed".
  const postOnlyRoutes = [
    '/api/roi-pdf',
    '/api/roi-share-email',
    '/api/feedback',
    '/api/auth/login',
    '/api/auth/signup',
    '/api/auth/logout',
    '/api/track/share-event',
    '/api/analytics/demo-event',
  ]

  for (const route of postOnlyRoutes) {
    test(`GET ${route} → 405`, async ({ request }) => {
      const res = await request.get(route)
      expect(res.status()).toBe(405)
    })
  }
})

test.describe('method guards (GET-only endpoints → 405 for POST)', () => {
  test('POST /api/usage/summary → 405', async ({ request }) => {
    const res = await request.post('/api/usage/summary', { data: {} })
    expect(res.status()).toBe(405)
  })
})

test.describe('method guards (GET/DELETE-only endpoints → 405 for POST)', () => {
  test('POST /api/roi-report-shares → 405', async ({ request }) => {
    const res = await request.post('/api/roi-report-shares', { data: {} })
    expect(res.status()).toBe(405)
  })
})

// ── 2. Auth guards ────────────────────────────────────────────────────────────

test.describe('auth guards (unauthenticated → 401, not 500)', () => {
  test('POST /api/roi-agent without auth → 401', async ({ request }) => {
    const res = await request.post('/api/roi-agent', {
      data: { companyName: 'Test', mode: 'generate' },
    })
    expect(res.status()).toBe(401)
  })

  test('POST /api/roi-pdf without auth → 401', async ({ request }) => {
    const res = await request.post('/api/roi-pdf', {
      data: { reportId: 'test-id' },
    })
    expect(res.status()).toBe(401)
  })

  test('POST /api/roi-share-email without auth → 401', async ({ request }) => {
    const res = await request.post('/api/roi-share-email', {
      data: { reportId: 'test-id', to: 'someone@example.com' },
    })
    expect(res.status()).toBe(401)
  })

  test('GET /api/reports/[id] without auth → 401', async ({ request }) => {
    const res = await request.get('/api/reports/nonexistent-id')
    expect(res.status()).toBe(401)
  })

  test('GET /api/usage/summary without auth → 401', async ({ request }) => {
    const res = await request.get('/api/usage/summary')
    expect(res.status()).toBe(401)
  })

  test('GET /api/roi-report-shares without auth → 401', async ({ request }) => {
    const res = await request.get('/api/roi-report-shares?reportId=test-id')
    expect(res.status()).toBe(401)
  })

  test('DELETE /api/roi-report-shares without auth → 401', async ({
    request,
  }) => {
    const res = await request.delete('/api/roi-report-shares', {
      data: { reportId: 'test-id', grantId: 'test-grant' },
    })
    expect(res.status()).toBe(401)
  })
})

// ── 3. Input validation ───────────────────────────────────────────────────────

test.describe('input validation (missing required fields → 400)', () => {
  test('POST /api/feedback without submissionId → 400', async ({ request }) => {
    const res = await request.post('/api/feedback', {
      data: { answers: { clarity: 5 } },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toBeTruthy()
  })

  test('POST /api/analytics/demo-event with empty body → 4xx', async ({
    request,
  }) => {
    const res = await request.post('/api/analytics/demo-event', { data: {} })
    expect(res.status()).toBeGreaterThanOrEqual(400)
    expect(res.status()).toBeLessThan(500)
  })
})
