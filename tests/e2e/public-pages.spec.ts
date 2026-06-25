/**
 * Public page tests — pages accessible without authentication.
 * Verifies the feedback and survey flows that customers interact with
 * after receiving a report.
 */
import { test, expect } from '@playwright/test'

// ── /roi-feedback ─────────────────────────────────────────────────────────────

test.describe('/roi-feedback', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/roi-feedback')
  })

  test('renders without JS errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.waitForLoadState('networkidle')
    expect(errors).toHaveLength(0)
  })

  test('shows Clarity rating question', async ({ page }) => {
    await expect(page.getByText('Clarity')).toBeVisible()
  })

  test('shows Relevance rating question', async ({ page }) => {
    await expect(page.getByText('Relevance')).toBeVisible()
  })

  test('rating buttons are clickable', async ({ page }) => {
    // Each question has options 1–5; clicking one should not throw
    const ratingButtons = page
      .getByRole('button')
      .filter({ hasText: /^[1-5]$/ })
    const count = await ratingButtons.count()
    expect(count).toBeGreaterThan(0)
    await ratingButtons.first().click()
  })

  test('submit button exists', async ({ page }) => {
    await expect(page.getByRole('button', { name: /submit/i })).toBeVisible()
  })
})

// ── /alpha-survey ─────────────────────────────────────────────────────────────

test.describe('/alpha-survey', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/alpha-survey')
  })

  test('renders without JS errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.waitForLoadState('networkidle')
    expect(errors).toHaveLength(0)
  })

  test('shows PMF question', async ({ page }) => {
    await expect(page.getByText(/how would you feel/i)).toBeVisible()
  })

  test('answer options are visible and clickable', async ({ page }) => {
    const disappointed = page.getByText(/very disappointed/i)
    await expect(disappointed).toBeVisible()
    await disappointed.click()
  })
})
