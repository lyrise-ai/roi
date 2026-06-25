/**
 * Smoke tests — tagged @smoke so the PostResponse Claude hook runs them fast.
 * These run in the `anon` project (no auth state) and cover the most critical
 * regressions: auth walls redirect, login page renders, APIs are alive.
 */
import { test, expect } from '@playwright/test'

test.describe('auth wall @smoke', () => {
  test('dashboard redirects unauthenticated to login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/auth\/login/)
  })

  test('roi-report redirects unauthenticated to login', async ({ page }) => {
    await page.goto('/roi-report')
    await expect(page).toHaveURL(/auth\/login/)
  })

  test('index redirects (to dashboard or login)', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/auth\/login|dashboard/)
  })
})

test.describe('login page @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/login')
  })

  test('renders without JS errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.waitForLoadState('networkidle')
    expect(errors).toHaveLength(0)
  })

  test('shows Google OAuth button', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /continue with google/i }),
    ).toBeVisible()
  })

  test('shows email and password inputs', async ({ page }) => {
    await expect(page.getByPlaceholder('Email')).toBeVisible()
    await expect(page.getByPlaceholder('Password')).toBeVisible()
  })

  test('log-in button is present and enabled', async ({ page }) => {
    const btn = page.getByRole('button', { name: /log in/i })
    await expect(btn).toBeVisible()
    await expect(btn).toBeEnabled()
  })
})

test.describe('api health @smoke', () => {
  test('roi-agent endpoint is reachable (not 500/404)', async ({ request }) => {
    const res = await request.get('/api/roi-agent')
    expect(res.status()).not.toBe(500)
    expect(res.status()).not.toBe(404)
  })

  test('feedback endpoint is reachable', async ({ request }) => {
    const res = await request.get('/api/feedback')
    expect(res.status()).not.toBe(500)
    expect(res.status()).not.toBe(404)
  })
})
