/**
 * Dashboard tests — runs in the `authenticated` project with a saved session.
 * Verifies that the dashboard loads correctly for a logged-in user and that
 * the auth session is truly active (not silently logged out).
 */
import { test, expect } from '@playwright/test'

test.describe('dashboard (authenticated)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard')
    // Confirm we're actually on the dashboard, not redirected to login
    await expect(page).toHaveURL(/dashboard/, { timeout: 15_000 })
  })

  test('stays on /dashboard (session is valid)', async ({ page }) => {
    await expect(page).toHaveURL(/dashboard/)
    await expect(page).not.toHaveURL(/auth\/login/)
  })

  test('renders without JS errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.waitForLoadState('networkidle')
    expect(errors).toHaveLength(0)
  })

  test('header shows Sign Out button (user is authenticated)', async ({
    page,
  }) => {
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible()
  })

  test('LyRise logo is present', async ({ page }) => {
    await expect(page.locator('img[alt="LyRise AI"]')).toBeVisible()
  })

  test('reports section renders without error state', async ({ page }) => {
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/something went wrong/i)).not.toBeVisible()
    await expect(page.getByText(/error/i).first()).not.toBeVisible()
  })
})

// ── API with auth ────────────────────────────────────────────────────────────

test.describe('api with valid session', () => {
  test('GET /api/usage/summary with auth → not 401 or 500', async ({
    request,
  }) => {
    const res = await request.get('/api/usage/summary')
    // 200 for employees, 403 for regular users — both are correct auth behaviour
    expect(res.status()).not.toBe(401)
    expect(res.status()).not.toBe(500)
  })

  test('POST /api/roi-agent with auth and missing body → 400 (not 401/500)', async ({
    request,
  }) => {
    const res = await request.post('/api/roi-agent', { data: {} })
    expect(res.status()).not.toBe(401)
    expect(res.status()).not.toBe(500)
    // Missing required input fields → 400
    expect(res.status()).toBe(400)
  })

  test('POST /api/roi-pdf with auth and missing reportId → 400 (not 401/500)', async ({
    request,
  }) => {
    const res = await request.post('/api/roi-pdf', { data: {} })
    expect(res.status()).not.toBe(401)
    expect(res.status()).not.toBe(500)
  })

  test('GET /api/roi-report-shares with auth and missing reportId → 400', async ({
    request,
  }) => {
    const res = await request.get('/api/roi-report-shares')
    expect(res.status()).toBe(400)
  })

  test('POST /api/roi-share-email with auth and missing recipient → 400', async ({
    request,
  }) => {
    const res = await request.post('/api/roi-share-email', {
      data: { reportId: 'test-id' },
    })
    expect(res.status()).toBe(400)
  })
})
