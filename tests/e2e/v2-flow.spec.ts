/**
 * The /v2 POC (LYR-182, screens: LYR-183, questions: LYR-184, side panel:
 * LYR-185, real research: LYR-199, reveal: LYR-188). Runs signed out.
 *
 * Six promises:
 *   1. You can reach the page without signing in.
 *   2. Answers survive all four steps and survive going back.
 *   3. Submitting the company form does not wait for the research to finish.
 *   4. Every answer, across more than one pain point, reaches the reveal as
 *      real figures.
 *   5. The money figure can be traced back to the calculator's own sums.
 *   6. The side panel shows findings with working links, and shows nothing at
 *      all when the research found nothing.
 *
 * The reveal shows one sentence and two figures. It does NOT repeat the pain
 * point text, the team, or the raw answers back. So "did this reach the end" is
 * checked through the numbers, not through the words.
 *
 * The whole flow can also be walked with no typing at all, which is how the
 * demo is given.
 *
 * We fake the research endpoint in every test here, on purpose. The real one
 * crawls a real company with real API keys and a real model call. CI has none
 * of those, so left real it would spend its whole 30-second budget failing,
 * once per test, over the network. What these tests own is how the panel
 * behaves given a stream of findings. What is IN that stream is the research
 * system's own tests and `npm run eval:research`.
 */
import { test, expect, type Page } from '@playwright/test'

/* The four numbers the calculator needs, typed as plain digits, because plain
   digits are what our reader actually accepts.
   The pay and "still needs a person" boxes suggest "$70k a year" and "about a
   third", but our reader rejects anything with a word on the end, so those
   formats leave the field empty and the money figure held back. That is a known
   gap, tracked under TODO(agent), and deliberately not tested here.
   The example texts belong to harbourfield.com, so both callers research that
   company. */
async function answerTheNumbers(page: Page) {
  await page.getByPlaceholder('4', { exact: true }).fill('4')
  await page.getByPlaceholder('12', { exact: true }).fill('12')
  await page.getByPlaceholder('$70k a year', { exact: true }).fill('70000')
  await page.getByPlaceholder('about a third', { exact: true }).fill('30')
}

/* One finding from the bought data set, and one job posting. That pairing is
   what the age rule turns on: the bought one is shown with a date next to it,
   and the posting — read live during this run — is not. */
const FINDINGS = [
  {
    headline: 'You are about 38 people',
    kind: 'size',
    sourceUrl: 'https://example.com/about',
    sourceType: 'enrichment',
    retrievedAt: '2026-03-01T00:00:00.000Z',
  },
  {
    headline:
      'You are hiring a paralegal whose first listed duty is chasing outstanding client documents',
    kind: 'hiring',
    sourceUrl: 'https://example.com/careers/paralegal',
  },
]

/* Fakes the research response. The delay is what makes the "still looking" state
   visible: a response that arrives instantly never shows the state the panel
   spends most of a real run in.
   Playwright sends the whole body at once, so the findings arrive together
   here. That they really do arrive one at a time is covered by the analyst's
   own test. */
async function stubResearch(page: Page, findings = FINDINGS, delayMs = 1200) {
  await page.route('**/api/v2/research*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs))
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body:
        findings
          .map(
            (finding) =>
              `data: ${JSON.stringify({ type: 'finding', finding })}\n\n`,
          )
          .join('') + `data: ${JSON.stringify({ type: 'done' })}\n\n`,
    })
  })
}

test.describe('/v2', () => {
  test.beforeEach(async ({ page }) => {
    await stubResearch(page)
  })

  test('@smoke walks all four steps and carries state', async ({ page }) => {
    await page.goto('/v2')
    // The first screen sits outside the flow: one button, no step counter, no
    // splash.
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Tell us how your teams actually work.',
    )
    await expect(page.getByText(/Step \d of 4/)).toHaveCount(0)

    await page.getByRole('button', { name: 'Start with my company' }).click()
    await expect(page.getByText('Step 2 of 4')).toBeVisible()

    await page.getByLabel('Company name').fill('Harbourfield Legal')
    await page.getByLabel('Website').fill('harbourfield.com')
    await page.getByRole('button', { name: 'Next', exact: true }).click()

    // We start the research and move on immediately. The questions are on screen
    // at once, well before the first finding arrives.
    await expect(page.getByText('Step 3 of 4')).toBeVisible({ timeout: 1000 })

    // Going back keeps what was typed rather than clearing the step.
    // We match button names exactly throughout, because the Sentry widget's
    // "Share feedback" label contains the word "back" in a production build,
    // and Next's dev-tools button contains the word "Next".
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(page.getByLabel('Website')).toHaveValue('harbourfield.com')
    await page.getByRole('button', { name: 'Next', exact: true }).click()

    // The first pain point. The open question comes first, above the number
    // questions.
    const open = page.getByRole('textbox', { name: /Where do your teams lose/ })
    await open.fill('Re-keying intake forms')
    await page
      .getByRole('textbox', { name: /Which team or department/ })
      .fill('Paralegals')

    // "Exact" is already chosen on every number question, and our suggestion
    // sits below the big box rather than inside it.
    await expect(
      page.getByRole('radio', { name: 'Exact' }).first(),
    ).toHaveAttribute('aria-checked', 'true')
    await expect(open).not.toHaveValue(/Contract review/)

    // Fully answered, so this pain point reaches the reveal as real figures
    // rather than as "not enough here yet".
    await answerTheNumbers(page)

    // One pain point is fewer than we would like, and we say so — but we never
    // block anyone from leaving.
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

    // Going back to the first pain point still shows what was typed there.
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(open).toHaveValue('Re-keying intake forms')
    await page.getByRole('button', { name: 'I have another one' }).click()
    // A third pain point left blank falls back to the guess we showed for it. A
    // fourth has no guess behind it, so it is dropped.
    await page.getByRole('button', { name: 'I have another one' }).click()

    await page.getByRole('button', { name: 'That’s all for now' }).click()

    await expect(page.getByText('Step 4 of 4')).toBeVisible()
    await expect(page.getByText('Harbourfield Legal')).toBeVisible()

    // The "I heard you" moment: their own numbers said back as a sentence,
    // before any figure. Built in plain code from the answers above — 4 people x
    // 12 hours x 50 working weeks.
    await expect(
      page.getByText(
        'Four people spending twelve hours a week each adds up to about 2,400 hours a year.',
      ),
    ).toBeVisible()

    // The typed answers survive the whole flow and come out as figures. We look
    // inside each figure's own block, because the same digits also appear in the
    // sentence above.
    const spent = page.getByText('Hours currently spent').locator('..')
    await expect(spent).toContainText('2,400')
    await expect(spent).toContainText('hrs / year')

    // The full path: the money figure only exists once both pay and "still needs
    // a person" were readable.
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
    // Typed the way a person types it, not the way a domain is written.
    await page.getByLabel('Website').fill('https://www.drjobpro.com/')
    await page.getByRole('button', { name: 'Next', exact: true }).click()

    const panel = page.getByRole('complementary')
    await expect(panel).toContainText('What we could verify about Dr. Job Pro')

    // Mid-run: the panel is quietly looking and the questions are already
    // usable. The first finding is still about 1.2 seconds away.
    await expect(panel).toContainText('Reading what’s public about you')
    const open = page.getByRole('textbox', { name: /Where do your teams lose/ })
    await open.fill('Screening CVs by hand')
    await expect(open).toHaveValue('Screening CVs by hand')

    // Finished: the analyst's own sentence, printed exactly as written.
    await expect(panel).toContainText(
      'first listed duty is chasing outstanding client documents',
    )
    // Every line has a source you can click.
    await expect(
      panel.getByRole('link', { name: 'example.com/careers/paralegal' }),
    ).toHaveAttribute('href', 'https://example.com/careers/paralegal')
    // The bought data is refreshed monthly, so that row says how old it is.
    await expect(panel).toContainText(
      'You are about 38 people (as of 1 Mar 2026)',
    )
    // A finding read live during this run needs no such note.
    await expect(panel).not.toContainText(/paralegal.*\(as of/)

    // Nothing guessed: no workflow, no department, no "operating model".
    await expect(panel).not.toContainText(
      /workflow|department|operating model/i,
    )
    // And the "still looking" line disappears once the run is done.
    await expect(panel).not.toContainText('Reading what’s public about you')
  })

  test('walks the whole flow without typing anything', async ({ page }) => {
    // How the demo is actually given: Next, Next, Next. An empty company field
    // falls back to the demo company rather than blocking the button.
    await page.goto('/v2')
    await page.getByRole('button', { name: 'Start with my company' }).click()
    await page.getByRole('button', { name: 'Next', exact: true }).click()

    await expect(page.getByText('Step 3 of 4')).toBeVisible()
    // Nothing was typed, so there is nothing to research and no panel. The
    // fallback company fills in the canned guesses only, never the panel.
    await expect(page.getByRole('complementary')).toHaveCount(0)

    // Straight to the reveal on the next click. Nothing was typed, so every pain
    // point is the guess we showed and every number is our estimate — each one
    // labelled as ours.
    await page.getByRole('button', { name: 'That’s all for now' }).click()

    await expect(page.getByText('Step 4 of 4')).toBeVisible()
    // Nothing was typed, so every number is the estimate we already showed for
    // Dr. Job Pro: 7 people x 18 hours x 50 weeks, with a quarter of it still
    // needing a person. The demo has to show figures. What it must never do is
    // pass them off as the prospect's own.
    await expect(
      page.getByText(/Seven people spending eighteen hours a week each/),
    ).toBeVisible()
    const spent = page
      .locator('div')
      .filter({ hasText: /^Hours currently spent/ })
      .last()
    await expect(spent).toContainText('6,300')
    await expect(page.getByText('2,646')).toBeVisible()
    await expect(page.getByText('$71,203')).toBeVisible()
    // And it says so in words, once, not only through the dots.
    await expect(
      page.getByText(/You left the numbers to me, so these are my guesses/),
    ).toBeVisible()
    // Both figures are marked as ours. The money figure always is. Hours spent
    // is too, here, because the numbers behind it were our estimates rather than
    // typed answers. That second mark is the whole point of this fallback.
    await expect(
      page.getByRole('button', { name: /includes assumptions/ }),
    ).toHaveCount(2)
  })

  test('reveals nothing to feature without crashing', async ({ page }) => {
    // No research, so no guess to fall back on for a pain point nobody named.
    // The reveal is handed an empty list. It used to crash on that (found in the
    // PR #56 review).
    await page.goto('/v2?scan=none')
    await page.getByRole('button', { name: 'Start with my company' }).click()
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await page.getByRole('button', { name: 'That’s all for now' }).click()

    await expect(page.getByText('Step 4 of 4')).toBeVisible()
    await expect(
      page.getByText("We don't have numbers for this one yet."),
    ).toBeVisible()
    await expect(
      page.getByText(/Not enough here yet to put a number on it/),
    ).toBeVisible()
    await expect(page.getByText('Hours currently spent')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Start over' })).toBeVisible()
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

    // Nothing is open until someone asks for it.
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // Only the money figure is marked. Hours spent carries no guess beyond what
    // was typed, so it gets no dot and no pop-up.
    const mark = page.getByRole('button', { name: /includes assumptions/ })
    await expect(mark).toHaveCount(1)
    await mark.click()

    const dialog = page.getByRole('dialog', {
      name: 'How this number was calculated',
    })
    await expect(dialog).toBeVisible()

    // Every line is text the calculator itself produced, not sums redone in the
    // component. So the pop-up can never disagree with the figure.
    await expect(dialog).toContainText(
      '2,400 × 70% × 0.7 × 0.8 = 941 hours/year returned',
    )
    await expect(dialog).toContainText(
      '($70,000 ÷ (50 × 40)) × 1.3 = $45.50/hour',
    )
    await expect(dialog).toContainText('941 × $45.50 = $42,816')
    await expect(dialog).toContainText('$42,816 × 1.3 = $55,661')
    // It ends on the same figure printed on the screen behind it.
    await expect(dialog).toContainText('$42,816 + $55,661 = $98,477')

    // The first figure's own formula is left out. It belongs to the unmarked
    // number, not to the guesses behind this one.
    await expect(dialog).not.toContainText('hours/year spent today')

    // It closes with the close button...
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // ...and with Escape, which the reveal adds on top of the shared dialog.
    await mark.click()
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('renders no scan panel at all when nothing was found', async ({
    page,
  }) => {
    // A real company we genuinely found nothing on: the run finishes and returns
    // no findings. The ?scan=none switch also turns off the canned guesses,
    // which is what the second half of this test is about.
    await stubResearch(page, [], 0)
    await page.goto('/v2?scan=none')
    await page.getByRole('button', { name: 'Start with my company' }).click()
    await page
      .getByLabel('Company name')
      .fill('Somewhere We Know Nothing About')
    await page.getByLabel('Website').fill('nothingknown.example')
    await page.getByRole('button', { name: 'Next', exact: true }).click()

    // Not an empty panel — no panel at all. An empty one looks broken.
    await expect(page.getByRole('complementary')).toHaveCount(0)
    await expect(page.getByText('What we could verify')).toHaveCount(0)
    // And the questions are unaffected.
    await expect(
      page.getByRole('textbox', { name: /Where do your teams lose/ }),
    ).toBeVisible()

    // We found nothing, so we guess nothing — no "from your website" box...
    await expect(page.getByText('A guess from your website')).toHaveCount(0)
    // ...and the estimate says why it has none, rather than inventing a number
    // the prospect would have to argue with.
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
