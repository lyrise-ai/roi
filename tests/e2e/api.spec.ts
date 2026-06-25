/**
 * API contract tests — runs in the `anon` project.
 *
 * Three guarantees:
 *   1. Method guards  — POST-only routes return 405 for GET (not 404/500)
 *   2. Auth guards    — protected routes return 401 (not 500) when unauthenticated
 *   3. Validation     — routes return 400 for missing required fields
 *
 * None of these tests make real AI or email calls.
 */
import { test, expect } from '@playwright/test'

// ── 1. Method guards ─────────────────────────────────────────────────────────

test.describe('method guards (GET on POST-only endpoints → 405)', () => {
  // Note: /api/roi-agent handles both GET (SSE chat) and POST (generate),
  // both require auth — so GET unauthenticated returns 401, not 405.
  const postOnlyRoutes = [
    '/api/roi-pdf',
    '/api/roi-email',
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

  test('POST /api/roi-email without auth → 401', async ({ request }) => {
    const res = await request.post('/api/roi-email', {
      data: { reportId: 'test-id' },
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
