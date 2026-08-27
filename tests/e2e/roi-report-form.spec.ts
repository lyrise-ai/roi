/**
 * Tests for the report form itself. Runs signed in.
 *
 * It checks how the first step behaves — what you can type, what it refuses,
 * picking an industry — without ever starting a real generation or costing
 * anything. The full generate, check, view chain is covered separately by
 * golden-path.spec.ts, which only runs locally because it needs the fake-data
 * path.
 */
import { test, expect } from '@playwright/test'

test.describe('ROI report form (authenticated)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/roi-report')
    await expect(page).toHaveURL('/roi-report', { timeout: 15_000 })

    // Alpha accounts get an opening screen first, which clears itself after 8
    // seconds. We dismiss it straight away, so checks with a 5-second timeout
    // are not racing it. Tests that only type or click happened to outlast it,
    // because those wait much longer — which is why this failed intermittently
    // rather than everywhere.
    const skipSplash = page.getByRole('button', { name: 'Skip →' })
    if (await skipSplash.isVisible().catch(() => false)) {
      await skipSplash.click()
    }
  })

  test('loads without redirect and without JS errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await expect(page).not.toHaveURL(/auth\/login/)
    await page.waitForLoadState('networkidle')
    expect(errors).toHaveLength(0)
  })

  test('company name starts blank in production', async ({ page }) => {
    // The pre-filled test data only appears in development mode. CI always runs
    // the production build, so this is the one place we can check the real,
    // deployed behaviour: a visitor must never see our own test data already
    // filled into their form.
    test.skip(!process.env.CI, 'preset only reliably absent in a prod build')
    await expect(page.getByPlaceholder('e.g. Acme Corp')).toHaveValue('')
  })

  test('required step-1 fields accept input and advance to step 2', async ({
    page,
  }) => {
    await page.getByPlaceholder('e.g. Acme Corp').fill('Acme Corp')
    await page.getByPlaceholder('e.g. acmecorp.com').fill('acmecorp.com')
    await page
      .getByPlaceholder(/e\.g\. B2B management consulting/i)
      .fill('B2B widget manufacturing')
    await expect(page.getByPlaceholder('e.g. Acme Corp')).toHaveValue(
      'Acme Corp',
    )

    await page.getByRole('button', { name: /continue/i }).click()
    await expect(page.getByText('Step 2 of 2')).toBeVisible()
  })

  test('validation blocks advancing when company name is empty', async ({
    page,
  }) => {
    const input = page.getByPlaceholder('e.g. Acme Corp')
    await input.fill('')
    await page.getByRole('button', { name: /continue/i }).click()
    // Still on step 1 — Continue was actually blocked, not just "the input is
    // still on screen"
    // (visible would be true on step 2 as well if a different field reused
    // the same placeholder, so assert the step indicator directly).
    await expect(page.getByText('Step 1 of 2')).toBeVisible()
    await expect(input).toBeVisible()
  })

  test('industry pill selection toggles active state and can be cleared', async ({
    page,
  }) => {
    // Don't assume a starting state: the IS_DEV preset pre-selects this
    // exact pill locally (DEV_STEP1_PRESET.industry), so it's already
    // active in dev but blank in the CI production build. Assert the
    // click actually flips it, and flips it back — real behavior, not an
    // environment-dependent starting point.
    const pill = page.getByRole('button', {
      name: 'Technology / SaaS',
      exact: true,
    })
    const isActive = async () =>
      ((await pill.getAttribute('class')) ?? '').includes('bg-gray-900')

    const before = await isActive()
    await pill.click()
    await expect(async () => {
      expect(await isActive()).toBe(!before)
    }).toPass({ timeout: 5_000 })

    // Clicking an already-active pill deselects it (PillGroup's onChange
    // toggles rather than just re-selecting).
    await pill.click()
    await expect(async () => {
      expect(await isActive()).toBe(before)
    }).toPass({ timeout: 5_000 })
  })
})
