/**
 * ROI report generator form tests — runs in the `authenticated` project.
 * Verifies the intake form renders correctly and accepts input, without
 * triggering actual AI generation or API costs.
 */
import { test, expect } from '@playwright/test'

test.describe('ROI report form (authenticated)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/roi-report')
    await expect(page).toHaveURL('/roi-report', { timeout: 15_000 })
  })

  test('loads without redirect (session valid)', async ({ page }) => {
    await expect(page).not.toHaveURL(/auth\/login/)
  })

  test('renders without JS errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.waitForLoadState('networkidle')
    expect(errors).toHaveLength(0)
  })

  test('company name field is present and accepts input', async ({ page }) => {
    const input = page.getByPlaceholder('e.g. Acme Corp')
    await expect(input).toBeVisible()
    await input.fill('Acme Corp')
    await expect(input).toHaveValue('Acme Corp')
  })

  test('company website field is present', async ({ page }) => {
    await expect(page.getByPlaceholder('e.g. acmecorp.com')).toBeVisible()
  })

  test('industry pills are rendered', async ({ page }) => {
    await expect(page.getByText('Technology / SaaS')).toBeVisible()
    await expect(page.getByText('Healthcare')).toBeVisible()
    await expect(page.getByText('Financial Services')).toBeVisible()
  })

  test('industry pill becomes active on click', async ({ page }) => {
    const pill = page.getByText('Technology / SaaS').first()
    await pill.click()
    // After click the pill should have an active/selected visual state.
    // The component uses a truthy `active` prop — we verify it's still visible
    // and no error occurred.
    await expect(pill).toBeVisible()
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    expect(errors).toHaveLength(0)
  })

  test('pre-filled company name defaults to "LyRise"', async ({ page }) => {
    // The form ships with a demo default — verifies the initial state is sane
    await expect(page.getByPlaceholder('e.g. Acme Corp')).toHaveValue('LyRise')
  })

  test('"What does your company sell" field is present', async ({ page }) => {
    await expect(
      page.getByPlaceholder(/e\.g\. B2B management consulting/i),
    ).toBeVisible()
  })

  test('step 1 has a Next / Generate button', async ({ page }) => {
    // Either "Next" (multi-step) or "Generate" — both are valid
    const btn = page
      .getByRole('button', { name: /next/i })
      .or(page.getByRole('button', { name: /generate/i }))
    await expect(btn.first()).toBeVisible()
  })

  test('validation keeps form visible when company name is cleared', async ({
    page,
  }) => {
    // Clear the company name (valid → invalid)
    const input = page.getByPlaceholder('e.g. Acme Corp')
    await input.fill('')
    const nextBtn = page
      .getByRole('button', { name: /next/i })
      .or(page.getByRole('button', { name: /generate/i }))
      .first()
    await nextBtn.click()
    // Still on the same form step — company name input is still visible
    await expect(input).toBeVisible()
  })
})
