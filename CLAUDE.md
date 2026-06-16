# CLAUDE.md

Guidance for Claude (and other AI coding agents) working in this repository.
Read this before making changes so your work matches how this codebase is already built.

## What this is

The LyRise marketing website and ROI tooling. A **Next.js 13 app using the Pages
Router** (not the App Router). It serves the public marketing site plus an
AI-powered "ROI report" pipeline that researches a company and generates a PDF
business case.

## Tech stack

- **Next.js 13.5** (Pages Router) + **React 18**
- Language: **mixed JavaScript and TypeScript** (`.js`, `.jsx`, `.ts`, `.tsx`).
  TypeScript is configured with `strict: false` — typing is loose; don't introduce
  strict-mode assumptions.
- Styling: **MUI (`@mui/material`) + Emotion** is the primary system, with
  **Tailwind CSS** and **Material Tailwind** also present. Match whatever the file
  you're editing already uses; don't mix styling systems within one component.
- Animation: Framer Motion, Rive, Swiper, Lenis (smooth scroll).
- Backend services: **Supabase** (Postgres/auth/storage), **Firebase** (remote
  config), **NextAuth** (Google/LinkedIn login), **OpenAI** via the Vercel `ai`
  SDK, **Resend** (transactional email), **Tavily/Brave** (web search for ROI
  research), **Puppeteer + @sparticuz/chromium** (PDF rendering).
- Node **>= 24** required (see `engines` in `package.json`).

## Project layout

```
pages/                 Routes (Pages Router). Each file = a URL.
pages/api/             Backend API endpoints (serverless functions).
src/components/        UI components, grouped by page/feature
                       (e.g. MainLandingPage/, NewLanding/, Employer/, ROIGenerator/).
src/layout/, src/components/Layout/   Shared header/footer/page shells.
src/lib/               Core non-UI logic. Supabase clients live here.
src/lib/roi/           The ROI report pipeline (active area of work).
src/services/          Outbound API calls to the LyRise backend (axios).
src/constants/         Page copy and static content data.
src/hooks/             Reusable React hooks.
src/context/           React context providers (Firebase, PageBuilder).
src/utilities/         Small helpers (amplitude, emotion cache, etc.).
src/assets/, public/   Images, fonts, SVGs, video.
evals/roi/             Evaluation harness for ROI report quality.
```

### The ROI pipeline (`src/lib/roi/`)

The most actively developed feature. Roughly:
`agent.ts` orchestrates → `tools/` (web search, page fetch) gather research →
`prompts/` drive the LLM → `pipeline/` normalizes, calculates, and assembles the
report → `services/` handle PDF rendering, email delivery, and usage tracking.
Entry points are the API routes `pages/api/roi-agent.js`, `roi-pdf.js`,
`roi-email.js`. There is a gold-set eval harness under `evals/roi/`
(see `evals/roi/README.md`) — run it after changing prompts or scoring logic.

## Conventions

- **Path aliases** (configured in `next.config.js` / `tsconfig.json`):
  `@components`, `@hooks`, `@assets`, `@services`, and `@/` for the project root
  (used by the ROI pipeline). Prefer these over long relative paths.
- **Formatting (Prettier, enforced):** no semicolons, single quotes, trailing
  commas, 2-space indent, LF line endings. Run `npm run prettier` if unsure.
- A **Husky pre-commit hook** runs `lint-staged` (ESLint + Prettier) on staged
  files. Don't bypass it.
- Page content/copy generally lives in `src/constants/` rather than inline in
  components — check there before hardcoding text.
- Many components branch on `process.env.NEXT_PUBLIC_ENV` to switch between
  staging and production behavior (e.g. links, redirects). Preserve this when
  editing.

## Commands

```bash
npm run dev          # Local dev server (http://localhost:3000)
npm run build        # Production build
npm run lint         # ESLint (note: lint errors are ignored during `build`)
npm run prettier     # Format the whole repo
npm test             # Run unit tests (node --test on src/**/__tests__/*.test.mjs)
npm run eval:roi     # Run the ROI report eval harness
```

## Environment variables

Secrets live in `.env.local` (gitignored) — never commit them. `NEXT_PUBLIC_*`
vars are exposed to the browser; everything else is server-only. Key groups:

- **Supabase:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` (server only — full DB access, handle with care).
- **Auth (NextAuth):** `GOOGLE_CLIENT_ID/SECRET`, `LINKEDIN_CLIENT_ID/SECRET`,
  `NEXTAUTH_SECRET`, `NEXTAUTH_URL`.
- **ROI / AI:** `OPENAI_API_KEY`, `TAVILY_API_KEY`, `BRAVE_API_KEY`.
- **Email (Resend):** `RESEND_API_KEY`, `EMAIL_FROM`, `DEV_ALERT_EMAILS`,
  `ROI_USAGE_ALERT_*`.
- **Analytics / misc:** `NEXT_PUBLIC_ENV`, `NEXT_PUBLIC_BACKEND_API`,
  `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_GTM_ID`, `NEXT_PUBLIC_AMPLITUDE`,
  `NEXT_PUBLIC_BASE_URL`.

## Working norms

- **Stay within the scope of the request.** This is a production marketing site —
  don't refactor unrelated code, rename things, or change styling systems unless
  asked.
- **Match the surrounding file's style** (JS vs TS, MUI vs Tailwind, naming).
- **Never commit secrets** or real client data (the ROI evals are redaction-only —
  see `evals/roi/README.md`).
- After meaningful changes, run `npm run lint` and `npm test` and report results
  honestly, including failures.
- Make focused commits and open a pull request for review — do not push directly
  to `main`.
