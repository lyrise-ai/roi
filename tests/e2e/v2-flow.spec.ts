/**
 * /v2 POC route (LYR-182, screens: LYR-183, interview: LYR-184, scan panel:
 * LYR-185) — runs in the `anon` project.
 *
 * Five guarantees: the route is reachable without auth, flow state survives
 * all four steps (landing → company → interview → reveal) and going back,
 * submitting the company form does not wait on the canned scan, every
 * interview answer — across more than one pain point — reaches the end, and
 * the scan panel resolves sourced facts for a known company while rendering
 * nothing at all for an unknown one.
 */
import { test, expect } from '@playwright/test'

test.describe('/v2', () => {
  test('@smoke walks all four steps and carries state', async ({ page }) => {
    await page.goto('/v2')
    // Landing is out of the flow: one CTA, no step counter, no splash.
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Tell us how your teams actually work.',
    )
    await expect(page.getByText(/Step \d of 4/)).toHaveCount(0)

    await page.getByRole('button', { name: 'Start with my company' }).click()
    await expect(page.getByText('Step 2 of 4')).toBeVisible()

    await page.getByLabel('Company name').fill('Harbourfield Legal')
    await page.getByLabel('Website').fill('harbourfield.com')
    await page.getByRole('button', { name: 'Next', exact: true }).click()

    // The canned scan takes ~1.5s per fact; the interview must already be here.
    await expect(page.getByText('Step 3 of 4')).toBeVisible({ timeout: 1000 })

    // Back preserves what was typed rather than resetting the step.
    // `exact` throughout — the Sentry widget's "Share feedback" label contains
    // "back" (production build only), and Next's dev-tools button is named
    // "Open Next.js Dev Tools", which substring-matches "Next".
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(page.getByLabel('Website')).toHaveValue('harbourfield.com')
    await page.getByRole('button', { name: 'Next', exact: true }).click()

    // First pain point. The open question is the hero: it is the first field
    // on the screen, above the segmented number questions.
    const open = page.getByRole('textbox', { name: /Where do your teams lose/ })
    await open.fill('Re-keying intake forms')
    await page
      .getByRole('textbox', { name: /Which team or department/ })
      .fill('Paralegals')

    // Exact is pre-selected on every number question, and the AI suggestion
    // sits below the hero rather than inside it.
    await expect(
      page.getByRole('radio', { name: 'Exact' }).first(),
    ).toHaveAttribute('aria-checked', 'true')
    await expect(open).not.toHaveValue(/Contract review/)

    await page.getByPlaceholder('4', { exact: true }).fill('6')

    // One pain point is not enough to finish; the analyst says so.
    await expect(page.getByText(/I need at least two/)).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'That’s all for now' }),
    ).toHaveCount(0)

    await page.getByRole('button', { name: 'I have another one' }).click()
    await expect(
      page.getByRole('heading', { name: /What’s the second one/ }),
    ).toBeVisible()
    await page
      .getByRole('textbox', { name: /What’s the second one/ })
      .fill('Rebuilding the Friday report')

    // Going back to the first pain point shows what was typed there.
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(open).toHaveValue('Re-keying intake forms')
    // Two are named, so finishing stays on offer even from the first one.
    await expect(
      page.getByRole('button', { name: 'That’s all for now' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'I have another one' }).click()
    // A third turn opened and left blank is not a pain point.
    await page.getByRole('button', { name: 'I have another one' }).click()

    await page.getByRole('button', { name: 'That’s all for now' }).click()

    await expect(page.getByText('Step 4 of 4')).toBeVisible()
    await expect(page.getByText('Harbourfield Legal')).toBeVisible()
    // Both pain points, and the numbers typed against the first one, survive.
    await expect(page.getByText(/Re-keying intake forms/)).toContainText(
      'Paralegals',
    )
    await expect(page.getByText(/Re-keying intake forms/)).toContainText('6')
    await expect(page.getByText(/Rebuilding the Friday report/)).toBeVisible()
    await expect(page.getByRole('listitem')).toHaveCount(2)
  })

  test('fills the scan panel while the interview is being answered', async ({
    page,
  }) => {
    await page.goto('/v2')
    await page.getByRole('button', { name: 'Start with my company' }).click()
    await page.getByLabel('Company name').fill('Dr. Job Pro')
    // Typed the way a person would, not the way the lookup key reads.
    await page.getByLabel('Website').fill('https://www.drjobpro.com/')
    await page.getByRole('button', { name: 'Next', exact: true }).click()

    const panel = page.getByRole('complementary')
    await expect(panel).toContainText('What we could verify about Dr. Job Pro')

    // In-flight: the panel is quietly looking and the interview is already
    // usable — the first fact is still ~1.5s away.
    await expect(panel).toContainText('Reading your site…')
    const open = page.getByRole('textbox', { name: /Where do your teams lose/ })
    await open.fill('Screening CVs by hand')
    await expect(open).toHaveValue('Screening CVs by hand')

    // Resolved: facts arrive one at a time, each with its source beside it.
    await expect(panel).toContainText('About 2,800 open vacancies')
    await expect(panel).toContainText('drjobpro.com/jobs')
    await expect(panel).toContainText('Roughly 60–80 staff')

    // Nothing inferred: no workflow, no department, no operating model.
    await expect(panel).not.toContainText(
      /workflow|department|operating model/i,
    )
  })

  test('renders no scan panel at all for an unknown company', async ({
    page,
  }) => {
    await page.goto('/v2')
    await page.getByRole('button', { name: 'Start with my company' }).click()
    await page
      .getByLabel('Company name')
      .fill('Somewhere We Know Nothing About')
    await page.getByLabel('Website').fill('nothing-canned-here.example')
    await page.getByRole('button', { name: 'Next', exact: true }).click()

    // Not an empty panel — no panel. An empty one reads as broken.
    await expect(page.getByRole('complementary')).toHaveCount(0)
    await expect(page.getByText('What we could verify')).toHaveCount(0)
    // And the interview is unaffected.
    await expect(
      page.getByRole('textbox', { name: /Where do your teams lose/ }),
    ).toBeVisible()
  })

  test('pushes back once a fourth pain point is being named', async ({
    page,
  }) => {
    await page.goto('/v2')
    await page.getByRole('button', { name: 'Start with my company' }).click()
    await page.getByLabel('Company name').fill('Harbourfield Legal')
    await page.getByRole('button', { name: 'Next', exact: true }).click()

    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: 'I have another one' }).click()
    }
    await expect(
      page.getByRole('heading', { name: 'Another one, then.' }),
    ).toBeVisible()
    await expect(
      page.getByText(/rather model three well than six loosely/),
    ).toBeVisible()
  })
})
