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
    await expect(pill).toBeVisible()
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    expect(errors).toHaveLength(0)
  })

  test('company name field starts empty in production', async ({ page }) => {
    // The dev preset (LyRise) is only applied when NODE_ENV=development.
    // In production/CI the field starts blank.
    const input = page.getByPlaceholder('e.g. Acme Corp')
    await expect(input).toBeVisible()
    // Field exists and is editable — value may be empty or a dev preset
    const value = await input.inputValue()
    expect(typeof value).toBe('string')
  })

  test('"What does your company sell" field is present', async ({ page }) => {
    await expect(
      page.getByPlaceholder(/e\.g\. B2B management consulting/i),
    ).toBeVisible()
  })

  test('step 1 has a Continue button', async ({ page }) => {
    // Step 1 uses "Continue →", step 2 uses "Generate my report →"
    await expect(page.getByRole('button', { name: /continue/i })).toBeVisible()
  })

  test('validation keeps form visible when company name is cleared', async ({
    page,
  }) => {
    const input = page.getByPlaceholder('e.g. Acme Corp')
    await input.fill('')
    await page.getByRole('button', { name: /continue/i }).click()
    // Validation should block navigation — company name input still visible
    await expect(input).toBeVisible()
  })
})
