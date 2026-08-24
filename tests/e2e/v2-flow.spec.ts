/**
 * /v2 POC route (LYR-182, screens: LYR-183, interview: LYR-184, scan panel:
 * LYR-185, reveal: LYR-188) — runs in the `anon` project.
 *
 * Six guarantees: the route is reachable without auth, flow state survives
 * all four steps (landing → company → interview → reveal) and going back,
 * submitting the company form does not wait on the canned scan, a fully
 * answered pain point reaches the reveal as real figures, the return figure
 * can be traced back to the calculator's own arithmetic, and the scan panel
 * resolves sourced facts with working sources while rendering nothing at all
 * when there was no scan.
 *
 * The reveal shows an observation sentence and two figures — it does NOT
 * echo the pain point text, the team, or the raw answers, so what "reached
 * the end" is asserted through the numbers rather than through the words.
 *
 * The whole flow is also walkable with no keyboard at all, which is how the
 * demo is given.
 */
import { test, expect, type Page } from '@playwright/test'

/* The four numbers the calculator needs, typed as bare digits because that is
   what the parser actually accepts. The pay and "still needs a person" fields
   suggest "$70k a year" and "about a third", but parseNumeric rejects a
   trailing word, so those formats leave the field missing and the return
   figure withheld — a separate known bug, deliberately not exercised here.
   Placeholders are harbourfield.com's, so both callers scan that company. */
async function answerTheNumbers(page: Page) {
  await page.getByPlaceholder('4', { exact: true }).fill('4')
  await page.getByPlaceholder('12', { exact: true }).fill('12')
  await page.getByPlaceholder('$70k a year', { exact: true }).fill('70000')
  await page.getByPlaceholder('about a third', { exact: true }).fill('30')
}

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

    // Answered in full, so this pain point reaches the reveal as real figures
    // rather than the "not enough here yet" path.
    await answerTheNumbers(page)

    // One pain point is fewer than the analyst wants, and it says so — but
    // leaving is never blocked on it.
    await expect(page.getByText(/Two makes the report hold up/)).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'That’s all for now' }),
    ).toBeVisible()

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
    await page.getByRole('button', { name: 'I have another one' }).click()
    // A third turn left blank falls back to the guess we showed for it; a
    // fourth has no guess behind it, so it drops.
    await page.getByRole('button', { name: 'I have another one' }).click()

    await page.getByRole('button', { name: 'That’s all for now' }).click()

    await expect(page.getByText('Step 4 of 4')).toBeVisible()
    await expect(page.getByText('Harbourfield Legal')).toBeVisible()

    // The "we heard you" moment: the user's own numbers read back as a
    // sentence, before any figure. Composed deterministically from the
    // answers above — 4 people × 12 hours × 50 working weeks.
    await expect(
      page.getByText(
        'Four people spending twelve hours a week each adds up to about 2,400 hours a year.',
      ),
    ).toBeVisible()

    // The typed answers survive the whole flow as figures. Scoped to each
    // figure's own block, because the same digits also appear in the
    // observation sentence above.
    const spent = page.getByText('Hours currently spent').locator('..')
    await expect(spent).toContainText('2,400')
    await expect(spent).toContainText('hrs / year')

    // The complete path: the return figure only exists once pay and
    // "still needs a person" both parsed.
    const returned = page
      .getByText(/Hours returned, and what that’s worth/)
      .locator('..')
    await expect(returned).toContainText('941')
    await expect(returned).toContainText('$98,477')
    await expect(
      page.getByText(/don’t have enough here yet to put a return number/),
    ).toHaveCount(0)
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

    // Resolved: facts arrive one at a time, each with a source you can open.
    await expect(panel).toContainText('10M+ users since 2015')
    await expect(
      panel.getByRole('link', { name: 'drjobpro.com/about-us' }).first(),
    ).toHaveAttribute('href', 'https://www.drjobpro.com/about-us')
    await expect(panel).toContainText('Abu Dhabi, Giza, and Vellore')

    // Nothing inferred: no workflow, no department, no operating model.
    await expect(panel).not.toContainText(
      /workflow|department|operating model/i,
    )

    // The guess is this company's, and it cites this company's scan.
    await expect(page.getByText(/Reading applications against/)).toBeVisible()
    await expect(page.getByText(/8,000 live vacancies/)).toBeVisible()
    // Nothing from the law firm's fact set leaks in.
    await expect(page.getByText(/paralegals/i)).toHaveCount(0)
  })

  test('walks the whole flow without typing anything', async ({ page }) => {
    // How the demo is actually given: Next, Next, Next. An empty company field
    // falls back to the demo company rather than blocking the button.
    await page.goto('/v2')
    await page.getByRole('button', { name: 'Start with my company' }).click()
    await page.getByRole('button', { name: 'Next', exact: true }).click()

    await expect(page.getByText('Step 3 of 4')).toBeVisible()
    // The fallback names itself, so the panel isn't addressed to "you".
    await expect(page.getByRole('complementary')).toContainText(
      'What we could verify about Dr. Job Pro',
    )

    // Straight to the reveal on the next click. Nothing was typed, so every
    // pain point is the guess we showed and every number is the estimate —
    // each one labelled as ours.
    await page.getByRole('button', { name: 'That’s all for now' }).click()

    await expect(page.getByText('Step 4 of 4')).toBeVisible()
    // Nothing was typed, so there is no number to stand on: the reveal says
    // so in both places rather than inventing one or printing a bare dash.
    await expect(
      page.getByText("We don't have numbers for this one yet."),
    ).toBeVisible()
    await expect(
      page.getByText(/Not enough here yet to put a number on it/),
    ).toBeVisible()
    // No figures, and nothing to trace — so no mark to open.
    await expect(page.getByText('Hours currently spent')).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: /includes assumptions/ }),
    ).toHaveCount(0)
  })

  test('traces the return figure back to the calculator’s own arithmetic', async ({
    page,
  }) => {
    await page.goto('/v2')
    await page.getByRole('button', { name: 'Start with my company' }).click()
    await page.getByLabel('Company name').fill('Harbourfield Legal')
    await page.getByLabel('Website').fill('harbourfield.com')
    await page.getByRole('button', { name: 'Next', exact: true }).click()

    await page
      .getByRole('textbox', { name: /Where do your teams lose/ })
      .fill('Re-keying intake forms')
    await answerTheNumbers(page)
    await page.getByRole('button', { name: 'That’s all for now' }).click()

    await expect(page.getByText('Step 4 of 4')).toBeVisible()

    // Nothing is open until it is asked for.
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // Only the dollar figure is marked. The hours-spent figure carries no
    // assumption beyond what was typed, so it gets no mark and no popover.
    const mark = page.getByRole('button', { name: /includes assumptions/ })
    await expect(mark).toHaveCount(1)
    await mark.click()

    const dialog = page.getByRole('dialog', {
      name: 'How this number was calculated',
    })
    await expect(dialog).toBeVisible()

    // Every line is a string the calculator emitted, not arithmetic rebuilt
    // in the component — so the popover cannot drift from the figure.
    await expect(dialog).toContainText(
      '2,400 × 70% × 0.7 × 0.8 = 941 hours/year returned',
    )
    await expect(dialog).toContainText(
      '($70,000 ÷ (50 × 40)) × 1.3 = $45.50/hour',
    )
    await expect(dialog).toContainText('941 × $45.50 = $42,816')
    await expect(dialog).toContainText('$42,816 × 1.3 = $55,661')
    // Lands on the figure printed on the screen behind it.
    await expect(dialog).toContainText('$42,816 + $55,661 = $98,477')

    // The lead figure's own formula stays out: it belongs to the unmarked
    // number, not to the assumptions behind this one.
    await expect(dialog).not.toContainText('hours/year spent today')

    // Dismissable by the close button…
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // …and by Escape, which the reveal adds on top of the Dialog primitive.
    await mark.click()
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('renders no scan panel at all when nothing was found', async ({
    page,
  }) => {
    // `?scan=none` is the door to the no-scan state: with the fallback in
    // place, an unrecognised domain no longer reaches it.
    await page.goto('/v2?scan=none')
    await page.getByRole('button', { name: 'Start with my company' }).click()
    await page
      .getByLabel('Company name')
      .fill('Somewhere We Know Nothing About')
    await page.getByRole('button', { name: 'Next', exact: true }).click()

    // Not an empty panel — no panel. An empty one reads as broken.
    await expect(page.getByRole('complementary')).toHaveCount(0)
    await expect(page.getByText('What we could verify')).toHaveCount(0)
    // And the interview is unaffected.
    await expect(
      page.getByRole('textbox', { name: /Where do your teams lose/ }),
    ).toBeVisible()

    // Scanned nothing, so it guesses nothing — no "from your website" block…
    await expect(page.getByText('A guess from your website')).toHaveCount(0)
    // …and the estimate says why it hasn't got one rather than inventing a
    // number the prospect would have to argue with.
    await page.getByRole('radio', { name: 'Let AI estimate' }).first().click()
    await expect(page.getByText('Nothing to base one on').first()).toBeVisible()
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
