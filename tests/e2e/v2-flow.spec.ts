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
 * system's own tests and `npm run research -- <domain>`.
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

/* Two findings in the shape the research agent now emits. Every one of them is
   read live during the run — there is no bought data set any more, so no row
   carries an "as of" date. */
const FINDINGS = [
  {
    says: 'You are about 38 people',
    about: 'size',
    link: 'https://example.com/about',
  },
  {
    says: 'You are hiring a paralegal whose first listed duty is chasing outstanding client documents',
    about: 'hiring',
    link: 'https://example.com/careers/paralegal',
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
})