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

## Stack notes

Read `package.json` for versions. What it won't tell you:

- TypeScript runs with `strict: false` — typing is loose; don't introduce
  strict-mode assumptions.
- Supabase is the auth provider. **There is no NextAuth here.**
- Resend is called over REST — there is deliberately no SDK dependency.

## The ROI pipeline (`src/lib/roi/`)

The most actively developed area. `pages/api/roi-agent.js` handles generation
**and** chat editing over SSE with `maxDuration: 300`. A gold-set eval harness
lives under `evals/roi/` (see `evals/roi/README.md`) — run it after changing
prompts or scoring logic.

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
- **Formatting** is Prettier's, enforced by the pre-commit hook. Run
  `npm run prettier` if unsure.
- A **Husky pre-commit hook** runs `lint-staged`: `eslint --fix` then Prettier on
  staged JS/TS, Prettier on staged JSON/CSS/MD. Don't bypass it. The hook exports
  `ESLINT_USE_FLAT_CONFIG=false` because this repo still uses `.eslintrc.js`.
- CI (`.github/workflows/e2e.yml`) has two jobs: `checks` (`npm run lint` +
  `npm test`, ~1 min) and `e2e` (Playwright). **ESLint is clean — 0 errors, 0
  warnings — and `next build` compiles with no warnings.** Both were a ~260-item
  backlog until LYR-181; leave them at zero. A rule that fires on correct code
  gets turned off in `.eslintrc.js` with a comment saying why, never suppressed
  file-by-file. Prettier violations are errors, so they fail CI.
- **Design system:** tokens are CSS custom properties in `styles/tokens/*.css`;
  `tailwind.config.js` maps them to utilities by `var()` reference and never
  restates a value. Use the semantic utilities (`bg-surface-card`, `text-ink-muted`,
  `rounded-card`, `shadow-glass`) over arbitrary values, and change a token in CSS
  rather than in the config. One typeface — Figtree, via `--font-sans`. See the
  `lyrise-design` skill in `.claude/skills/` for the full brand system.
- **Observability: PostHog is the front door, Sentry is the deep dive.**
  PostHog owns product analytics, session replay, the error list you triage, and
  the Linear tickets (via PostHog's built-in Linear alert destination — no code
  in this repo, configured in the PostHog dashboard).
  Sentry owns source-mapped stack traces and tracing, and is linked _from_
  PostHog. Three rules that are easy to break by accident:
  - **Never re-add `captureConsoleIntegration` to a Sentry config.** It promotes
    every `console.error` — most of which are deliberate, already-handled catch
    blocks — into an issue, and therefore a Linear ticket.
  - **Only PostHog creates Linear issues.** Sentry's native Linear integration
    is switched off in its dashboard. Turning it back on doubles every ticket.
  - **Sentry replay stays at 0.** PostHog records sessions; paying two vendors
    for one recording is the thing this split exists to avoid.
- **Adding telemetry:** event names live only in `EVENTS`
  (`src/lib/analytics.ts`) — never a string literal at the call site. Server
  captures go through `src/lib/posthog-server.ts` and **must** be followed by
  `flushPostHog()` before the handler returns, or Vercel freezes the lambda with
  the event still buffered. Browser captures go through `track()`. Both no-op
  without `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` — that's how CI stays out of the
  production project, and `src/lib/__tests__/posthog-server.test.mjs` locks it
  in. Dashboard-side setup is in `docs/observability-setup.md`.
- Components branch on `process.env.NEXT_PUBLIC_ENV` (`production` / `ci` /
  unset) to switch behavior such as links, redirects, and alert suppression.
  Preserve this when editing.
- Anything on the report-generation path must **never throw** — degrade to a
  partial result instead. See `pipeline/validationBaseline.ts` for the pattern.

## Commands

`package.json` has the full list. The non-obvious ones:

```bash
npm run dev:test       # Dev server on :3777 — the port the Playwright config expects
npm run build          # Lint errors are IGNORED during build; `npm run lint` is the gate
npm run test:e2e:smoke # @smoke subset (~1 min) vs. the full suite
npm run eval:roi       # ROI report eval harness
```

## Environment variables

`.env.example` is the canonical list and marks required vs. optional. Secrets live
in `.env.local` (gitignored) — never commit them. `NEXT_PUBLIC_*` is exposed to the
browser; everything else is server-only.

Two things the list won't tell you:

- `SUPABASE_SERVICE_ROLE_KEY` is server-only, grants full DB access, and bypasses
  RLS. Handle with care.
- Supabase is a **single shared project** across local, CI, and production. There
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
