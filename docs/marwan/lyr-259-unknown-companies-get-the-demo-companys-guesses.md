# LYR-259: Unknown companies must not get demo guesses

## Purpose

The V2 interview has a small set of demo companies in `pages/v2/index.jsx`.
Before this change, `demoFor()` returned the Dr. Job Pro entry whenever a
website was not found in that set. That made an unknown prospect look like Dr.
Job Pro and put Dr. Job Pro's canned pain-point guesses and number estimates
into the prospect's report.

This change makes the demo data a deliberate development fixture:

- A domain that is not in `DEMOS` has no demo data.
- An unknown company keeps the generic interview wording.
- Unknown companies receive no canned pain guesses.
- Unknown companies keep the existing `QUANT` values such as
  “Nothing to base one on”.
- Demo data is available only when the app runs in development mode.
- A production or preview deployment never exposes a demo, including for
  `drjobpro.com`.
- `?scan=none` continues to enter the no-demo state.
- The interview explains that blank answers are intended to receive an AI
  guess in a future update. Until that work ships in LYR-272, an unknown
  company's blank answer is shown as missing.

The change does not alter the research scan. The scan still uses the entered
website and still reports live findings or gaps independently of demo data.

## Changed files

### `pages/v2/index.jsx`

The V2 page contains the demo map, demo lookup, interview copy, and the
fallback behavior used when the interview finishes.

Changes in this file:

1. `demoFor()` now returns a demo only when `NODE_ENV` is `development`.
2. The old default-to-Dr.-Job-Pro behavior has been removed. The normalized
   domain is looked up directly, so unknown and empty domains return
   `undefined`.
3. Comments above `DEMOS`, `demoFor()`, and `painFor()` now describe the
   development-only and no-fallback behavior.
4. The company-screen comment no longer claims that an empty company silently
   becomes the demo company.
5. For a non-demo company, the interview's stop message explains that AI
   guesses will arrive in an update and that the current blank state is
   missing. The existing development-demo behavior remains available when a
   known demo domain is entered.

### `docs/marwan/lyr-259-unknown-companies-get-the-demo-companys-guesses.md`

This document records the behavior, implementation surface, and manual
verification steps for LYR-259.

## Manual testing

### 1. Unknown company in development

1. Start the app in development:

   ```bash
   npm run dev
   ```

2. Open `http://localhost:3000/v2`.
3. Choose **Start with my company**.
4. Enter:

   - Company name: `Acme Legal`
   - Website: `acme-legal.com`

5. Continue to the interview.
6. Check the following:

   - The question text uses the generic examples, not Dr. Job Pro wording.
   - There is no **A guess from your website** suggestion box.
   - Each quantitative question shows **Nothing to base one on**.
   - No Dr. Job Pro-specific text, numbers, or explanations appear.
   - The research scan, if it returns findings or gaps, is based on
     `acme-legal.com`, not on a demo entry.
7. Leave the pain-point answers blank and choose **That's all for now**.
8. Confirm that the reveal does not use Dr. Job Pro's canned guesses. The
   unknown company's blank pain points are discarded rather than filled with a
   demo pain point, and the quantitative fields remain incomplete/missing
   until the user supplies real answers.

### 2. Development demo still works

1. Restart or keep the development server running.
2. Open `/v2` and enter:

   - Company name: `Dr. Job Pro`
   - Website: `drjobpro.com`

3. Continue to the interview.
4. Confirm that the Dr. Job Pro suggestion boxes and benchmark estimates are
   visible.
5. Leave a supported pain point blank and finish the interview.
6. Confirm that the development demo still uses its displayed demo guess and
   that the reveal remains usable.

Also try the other entries in `DEMOS` if needed. They should work only in
development and only when their own domain is entered.

### 3. The explicit no-scan state

1. Open:

   `http://localhost:3000/v2?scan=none`

2. Enter any company, including `drjobpro.com`.
3. Confirm that no demo suggestion or demo estimate is shown.
4. Confirm that the generic quantitative estimates remain
   **Nothing to base one on**.
5. Confirm that the interview can still be completed without the finish
   button being blocked.

### 4. Production or preview behavior

Build and run the production server:

```bash
npm run build
npm start
```

Then open `/v2` and enter `drjobpro.com`. Confirm that:

- Dr. Job Pro's canned suggestions are not displayed.
- Dr. Job Pro's benchmark estimates are not displayed.
- The generic no-evidence estimates are displayed instead.
- An unknown domain behaves the same way.

This check is important because the demo map is intentionally present in the
source for local development, but `demoFor()` must never return it from a
production or preview build.

## Automated checks

From the repository root, run:

```bash
npm run lint
npm test
```

The issue's required gate is a clean lint run. The test command verifies that
the existing V2 calculation and report behavior remains green.
