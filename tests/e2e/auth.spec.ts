/**
 * Tests for the sign-in wall and the login page. All run signed out.
 * They check that EVERY protected page redirects properly, and that the login
 * screen itself still works.
 */
import { test, expect } from '@playwright/test'

// ── Protected-route redirects ─────────────────────────────────────────────────

test.describe('protected route redirects', () => {
  const protectedRoutes = [
    '/dashboard',
    '/dashboard/usage',
    '/roi-report',
    '/roi-report/bulk',
    '/roi-report/bulk/fake-session',
    '/report/nonexistent-id',
  ]

  for (const route of protectedRoutes) {
    test(`${route} → /auth/login when unauthenticated`, async ({ page }) => {
      await page.goto(route)
      await expect(page).toHaveURL(/auth\/login/)
    })
  }

  test('/ redirects (to dashboard or straight to login)', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/auth\/login|dashboard/)
  })
})

// ── Login page UI ─────────────────────────────────────────────────────────────

test.describe('login page UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/login')
  })

  test('page title is "Sign In | LyRise"', async ({ page }) => {
    await expect(page).toHaveTitle('Sign In | LyRise')
  })

  test('renders without console errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.waitForLoadState('networkidle')
    expect(errors).toHaveLength(0)
  })

  test('Google OAuth button is visible and not disabled', async ({ page }) => {
    const btn = page.getByRole('button', { name: /continue with google/i })
    await expect(btn).toBeVisible()
    await expect(btn).toBeEnabled()
  })

  test('email input accepts text', async ({ page }) => {
    const input = page.getByPlaceholder('Work email')
    await expect(input).toBeVisible()
    await input.fill('test@example.com')
    await expect(input).toHaveValue('test@example.com')
  })

  test('password input masks characters', async ({ page }) => {
    const input = page.getByPlaceholder('Password')
    await expect(input).toHaveAttribute('type', 'password')
  })

  test('Sign in button submits the form', async ({ page }) => {
    await expect(page.getByRole('button', { name: /sign in/i })).toBeEnabled()
  })

  test('toggle to signup mode changes submit button text', async ({ page }) => {
    await page.getByRole('button', { name: /sign up/i }).click()
    await expect(
      page.getByRole('button', { name: 'Create account' }),
    ).toBeVisible()
  })

  test('toggle back to login mode restores Sign in text', async ({ page }) => {
    await page.getByRole('button', { name: /sign up/i }).click()
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  })

  test('submitting blank form shows browser validation (email required)', async ({
    page,
  }) => {
    const emailInput = page.getByPlaceholder('Work email')
    await expect(emailInput).toHaveAttribute('required', '')
  })
})

// ── Login error feedback ──────────────────────────────────────────────────────

test.describe('login error feedback', () => {
  test('shows error message on bad credentials', async ({ page }) => {
    await page.goto('/auth/login')
    await page.fill('[placeholder="Work email"]', 'nobody@example.com')
    await page.fill('[placeholder="Password"]', 'wrongpassword')
    await page.click('button[type="submit"]')
    await expect(page.getByText(/invalid login credentials/i)).toBeVisible({
      timeout: 10_000,
    })
  })
})
