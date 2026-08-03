# CLAUDE.md

Guidance for Claude (and other AI coding agents) working in this repository.
Read this before making changes so your work matches how this codebase is already built.

## What this is

The LyRise ROI app: an AI pipeline that researches a prospect company, models the
financial impact of automating their manual workflows, and produces a branded ROI
business case — web report, PDF, and a shareable link with a chat panel for editing
the model. A **Next.js 15 app using the Pages Router** (not the App Router).

Numbers in these reports go in front of prospects' CFOs. Treat the generation path
as a money path.

## Tech stack

- **Next.js 15** (Pages Router) + **React 18**
- Language: **mixed JavaScript and TypeScript** (`.js`, `.jsx`, `.ts`, `.tsx`).
  TypeScript is configured with `strict: false` — typing is loose; don't introduce
  strict-mode assumptions.
- Styling: **Tailwind CSS v3** throughout.
- Animation: Framer Motion.
- Backend services: **Supabase** (Postgres/auth/storage — also the auth provider;
  there is no NextAuth here), **OpenAI** via the Vercel `ai` SDK, **Resend**
  (transactional email, called over REST — no SDK dependency), **Tavily/Brave**
  (web search for ROI research), **Puppeteer + @sparticuz/chromium** (PDF
  rendering), **Sentry** (errors), **Linear** (triage), **PostHog/Amplitude**
  (analytics).
- Node **>= 24** required (see `engines` in `package.json`).

## Project layout

```text
pages/                 Routes (Pages Router). Each file = a URL.
pages/api/             Backend API endpoints (serverless functions).
src/components/        UI components: ROIGenerator/ (the report app),
                       AlphaDashboardPanel.jsx, shared/ (small reusable bits).
src/layout/            Shared page shell (MainHeader/).
src/lib/               Core non-UI logic. Supabase clients live here.
src/lib/roi/           The ROI report pipeline (active area of work).
src/hooks/             Reusable React hooks.
src/context/           React context providers (AuthSessionContext).
src/utilities/         Small helpers (fonts, date formatting).
src/data/              Static copy (site-content.json).
src/assets/, public/   Images, fonts, SVGs, video.
supabase/migrations/   Database schema.
tests/e2e/             Playwright suite.
evals/roi/             Evaluation harness for ROI report quality.
```

### The ROI pipeline (`src/lib/roi/`)

The most actively developed area. Roughly:
`agent.ts` orchestrates → `tools/` (web search, page fetch) gather research →
`prompts/` drive the LLM → `pipeline/` normalizes, calculates, and assembles the
report → `services/` handle PDF rendering, email delivery, and usage tracking.
Entry points are the API routes `pages/api/roi-agent.js` (generation **and** chat
editing, SSE, `maxDuration: 300`), `roi-pdf.js`, and `roi-share-email.js`. There is
a gold-set eval harness under `evals/roi/` (see `evals/roi/README.md`) — run it
after changing prompts or scoring logic.

Two rules specific to this directory:

- **The LLM never does arithmetic.** Research, workflow modeling, and narrative
  copy are LLM work; every number comes from `pipeline/roiCalculator.ts` and
  `pipeline/assembleReport.ts`, which are pure and deterministic. Keep that line.
- **`ReportState` has single sources of truth** (`company`, `globals`,
  `workflows`, `copy`) and derived fields (`calcOutput`, `assembled`,
  `renderedHtml`, `renderedFullHtml`) that must be recomputed, never cached as
  authoritative. Most "my edit didn't change the number" bugs are a violation of
  this.

The header comments in this directory explain _why_, not just what. Read them
before changing the code they sit above.

## Conventions

- **Path aliases** (`next.config.js` / `tsconfig.json`): `@components` →
  `src/components`, `@hooks` → `src/hooks`, and `@`/`@/` for the project root
  (used throughout the ROI pipeline). Prefer these over long relative paths.
  There is no `@assets` or `@services` alias. Aliases are declared **twice** in
  `next.config.js` — once for webpack, once for turbopack (`npm run dev` uses
  turbopack, `npm run build` uses webpack). Add new aliases to both.
- **Formatting (Prettier, enforced):** no semicolons, single quotes, trailing
  commas, 2-space indent, LF line endings. Run `npm run prettier` if unsure.
- A **Husky pre-commit hook** runs `lint-staged`: `eslint --fix` then Prettier on
  staged JS/TS, Prettier on staged JSON/CSS/MD. Don't bypass it. The hook exports
  `ESLINT_USE_FLAT_CONFIG=false` because this repo still uses `.eslintrc.js`.
- CI (`.github/workflows/e2e.yml`) has two jobs: `checks` (`npm run lint` +
  `npm test`, ~1 min) and `e2e` (Playwright). ESLint reports 0 errors and ~250
  warnings — only errors gate. Don't add new errors; don't feel obliged to fix
  the warning backlog in an unrelated PR.
- Static copy lives in `src/data/site-content.json` rather than inline in
  components — check there before hardcoding text.
- Components branch on `process.env.NEXT_PUBLIC_ENV` (`production` / `ci` /
  unset) to switch behavior such as links, redirects, and alert suppression.
  Preserve this when editing.
- Anything on the report-generation path must **never throw** — degrade to a
  partial result instead. See `pipeline/validationBaseline.ts` for the pattern.

## Commands

```bash
npm run dev            # Local dev server (http://localhost:3000, turbopack)
npm run dev:test       # Dev server on :3777, matching the Playwright config
npm run build          # Production build (lint errors are ignored during build)
npm run lint           # ESLint (only errors gate; warnings are a known backlog)
npm run lint:fix       # auto-fix what's mechanically fixable
npm run prettier       # Format the whole repo
npm run deadcode       # knip — unused files, exports, dependencies
npm test               # Unit tests (node --test on src/**/__tests__/*.test.mjs)
npm run test:e2e       # Full Playwright suite
npm run test:e2e:smoke # @smoke subset (~1 min)
npm run eval:roi       # ROI report eval harness
```

## Environment variables

Secrets live in `.env.local` (gitignored) — never commit them. `NEXT_PUBLIC_*`
vars are exposed to the browser; everything else is server-only. `.env.example`
is the canonical list and marks what's required vs. optional. Key groups:

- **Supabase (required):** `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only —
  full DB access, bypasses RLS, handle with care).
- **ROI / AI:** `OPENAI_API_KEY`, `TAVILY_API_KEY`, `BRAVE_API_KEY` (fallback).
- **Email (Resend):** `RESEND_API_KEY`, `EMAIL_FROM`, `DEV_ALERT_EMAILS`,
  `ROI_USAGE_ALERT_*`, `ROI_REPORT_ACCESS_ALERT_EMAILS`.
- **Linear:** `LINEAR_API_KEY`, `LINEAR_TEAM_ID`, `LINEAR_TRIAGE_STATE_ID`,
  `LINEAR_FEEDBACK_LABEL_ID` (API), `LINEAR_NEW_ISSUE_URL` (browser links).
- **Analytics / env:** `NEXT_PUBLIC_ENV`, `NEXT_PUBLIC_BASE_URL`,
  `NEXT_PUBLIC_POSTHOG_*`, `NEXT_PUBLIC_AMPLITUDE`, `NEXT_PUBLIC_SENTRY_*`.

Supabase is a **single shared project** across local, CI, and production. There
is no staging database — be deliberate with destructive queries.

## Working norms

- **Stay within the scope of the request.** This is a production app — don't
  refactor unrelated code, rename things, or change styling systems unless asked.
- **Match the surrounding file's style** (JS vs TS, naming).
- **Never commit secrets** or real client data (the ROI evals are redaction-only —
  see `evals/roi/README.md`).
- After meaningful changes, run `npm run lint` and `npm test` and report results
  honestly, including failures.
- Make focused commits and open a pull request for review — do not push directly
  to `main`. Branch naming follows Linear's generated names
  (`yousef/lyr-146-short-slug`).
