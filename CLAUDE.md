# CLAUDE.md

Notes for Claude, and any other AI agent working in this repo.
Read this before changing anything, so your work matches how the code is already
written.

## What this is

The LyRise ROI app. It researches a company, works out what automating their
manual work would be worth, and produces a business case: a web report, a PDF, and
a shareable link with a chat panel for editing the numbers. It is a **Next.js 15
app on the Pages Router**, not the App Router.

The numbers in these reports are shown to prospects' finance directors. Treat
everything on the generation path as money.

## Two versions live here, and they do not mix

This is the most important thing on this page. Read it before you change
anything, and before you "tidy up" anything that looks duplicated.

**Version 1 is production. It is finished. Do not touch it.**

```
pages/api/roi-agent.js      builds and chat-edits the report
src/lib/roi/agent.ts        the report agent, with its own research tools
src/lib/roi/pipeline/       the calculation and rendering
src/components/ROIGenerator/
```

**Version 2 is where all new work goes. It is being built alongside.**

```
pages/v2/                   the interview
pages/api/v2/               its server side
src/lib/roi/research/       one agent with tools
src/lib/roi/v2/
```

So yes, there really are two agents that research a company, and they follow
different rules. `src/lib/roi/research/agent.ts` is grounded, logged, and says
why a fetch failed. `src/lib/roi/agent.ts` has none of that. **This is on
purpose.** V1 works and is in front of customers; the cost of changing it is a
broken report for a real prospect, and the benefit is tidiness. That is a bad
trade.

Do not unify them. Do not port the new rules backwards. Do not refactor V1
because V2 taught you a better way. When V2 is ready it replaces V1 whole, and
V1 gets deleted in one go.

The only V1 changes allowed are ones a customer is waiting on.

## Stack notes

Read `package.json` for versions. Three things it will not tell you:

- TypeScript runs with its strict checks OFF. Types here are loose. Do not write
  code that assumes strict mode.
- Supabase handles sign-in. **There is no NextAuth in this repo.**
- We call Resend over plain HTTP. There is deliberately no SDK installed.

## The ROI pipeline (`src/lib/roi/`)

The part of the app that changes most. `pages/api/roi-agent.js` does both
building a report **and** editing it through chat, over one long-lived
connection, with a 5-minute limit.

There is a scoring harness under `evals/roi/` (see `evals/roi/README.md`). Run it
after changing a prompt or any scoring logic.

**`src/lib/roi/research/` is one agent with tools**, not a fixed run of steps.
`agent.ts` holds the loop and the instructions; `tools.ts` is what it can do.
Two rules there that are not negotiable:

- **A finding must point at a page we really opened.** `noteFinding` refuses any
  other link and says so, and `Link` in `types.ts` is a type only `link()` can
  make, so a made-up URL will not compile. This is why the old agent's invented
  workflows cannot come back.
- **A failure always says why.** `readPage` never returns `null` — a timeout, a
  404 and a refusal are different answers, and the agent acts on the difference.
  It then reaches the person through `gaps`. "We could not reach your site" and
  "you have no public jobs" must never look the same.
- **`log.ts` is the only file in there allowed to touch `console`.** Everything
  else goes through the logger it exports, which is why `.eslintrc.js` can turn
  `no-console` off for that one file. Widen that override and the rule is gone.
  A failed fetch is logged at **warn**, never error: here a missing page is the
  ordinary result of looking, and error level is for a real fault. Three events
  go to PostHog — see `RESEARCH_*` in `src/lib/analytics.ts`. Added up,
  `research_call_failed` measures retrieval against every real prospect, which
  is what the deleted 25-domain coverage harness used to sample.

One rule that belongs to this directory:

- **Four fields on `ReportState` hold the truth**: `company`, `globals`,
  `workflows` and `copy`. Everything else — `calcOutput`, `assembled`,
  `renderedHtml`, `renderedFullHtml` — is worked out FROM those four and must be
  recalculated, never stored as the truth. Most "my edit didn't change the
  number" bugs come from breaking this.

The header comments in this directory explain WHY, not just what. Read the one
above any code you are about to change.

## Conventions

- **Path aliases** (`next.config.js` / `tsconfig.json`): `@components` →
  `src/components`, `@hooks` → `src/hooks`, and `@`/`@/` for the project root
  (used throughout the ROI pipeline). Prefer these over long relative paths.
  There is no `@assets` or `@services` alias. Aliases are declared **twice** in
  `next.config.js` — once for webpack, once for turbopack (`npm run dev` uses
  turbopack, `npm run build` uses webpack). Add new aliases to both.
- **Formatting** is whatever Prettier does, enforced by the pre-commit hook. Run
  `npm run prettier` if you are unsure.
- A **Husky pre-commit hook** runs `lint-staged`: `eslint --fix` then Prettier on
  staged JS/TS, Prettier on staged JSON/CSS/MD. Don't bypass it. The hook exports
  `ESLINT_USE_FLAT_CONFIG=false` because this repo still uses `.eslintrc.js`.
- CI (`.github/workflows/e2e.yml`) runs two jobs: `checks` — lint plus unit
  tests, about a minute — and the browser tests. **Lint is completely clean: no
  errors and no warnings, and the build compiles with none either.** Both used to
  be a backlog of around 260 items until LYR-181. Keep them at zero. If a rule
  complains about correct code, switch that rule off in `.eslintrc.js` with a
  comment saying why — never silence it file by file. A formatting mistake is an
  error too, and fails CI.
- **Design system:** every value lives as a CSS variable in
  `styles/tokens/*.css`. `tailwind.config.js` only gives those variables Tailwind
  names; it never repeats a value. Use the named utilities — `bg-surface-card`,
  `text-ink-muted`, `rounded-card`, `shadow-glass` — rather than writing values
  by hand, and change a value in the CSS, not in the config. One typeface only:
  Figtree. The full brand system is in the `lyrise-design` skill under
  `.claude/skills/`.
- **Watching production: PostHog is the front door, Sentry is the detail.**
  PostHog owns product analytics, session recordings, the error list we work
  through, and the Linear tickets — created by PostHog's own Linear alert
  setting, configured in its dashboard, with no code in this repo.
  Sentry owns readable stack traces and performance traces, and you reach it
  FROM PostHog. Three rules that are easy to break by accident:
  - **Never turn console capture back on in a Sentry config.** It turns every
    `console.error` in the repo — most of them deliberate, inside catch blocks
    that already handled the problem — into an issue, and therefore a ticket.
  - **Only PostHog creates Linear issues.** Sentry's own Linear integration is
    switched off in its dashboard. Turning it back on doubles every ticket.
  - **Sentry session recording stays at zero.** PostHog records sessions. Paying
    two companies to record the same thing is exactly what this split avoids.
- **Adding tracking:** the ROI pipeline's own event names live in `EVENTS`
  (`src/lib/analytics.ts`). Never type an event name in at the call site. Events
  that come from `pages/api/analytics/*` and `share-event.js` are named by those
  routes' own allowed-types lists instead — do not repeat them in `EVENTS`.
  Everything else — page views, clicks, errors — is recorded automatically by the
  browser library and needs no name.
  Send events through `captureServer()` in `src/lib/posthog-server.ts`, and you
  **must** call `flushPostHog()` before the handler returns, or Vercel freezes
  the server with the event still sitting in a buffer.
  It all does nothing without the PostHog token, which is how CI stays out of the
  real project; `src/lib/__tests__/posthog-server.test.mjs` locks that in.
  Dashboard setup, and why the browser half cannot be tested automatically, are
  in `docs/observability-setup.md`.
- Components check `process.env.NEXT_PUBLIC_ENV` — `production`, `ci`, or unset
  — to change behaviour such as links, redirects and whether alerts are sent.
  Keep that when editing them.
- Nothing on the report-generation path may **ever throw**. Give back a partial
  result instead. `pipeline/validationBaseline.ts` shows the pattern.

## Commands

`package.json` has the full list. The non-obvious ones:

```bash
npm run dev:test       # Dev server on :3777 — the port the Playwright config expects
npm run build          # Lint errors are IGNORED during build; `npm run lint` is the gate
npm run test:e2e:smoke # @smoke subset (~1 min) vs. the full suite
npm run eval:roi       # ROI report eval harness
npm run research -- <domain>  # Run the research agent on one company and
                       # print what it found — costs real API spend
npm run deadcode       # knip; clean today, keep it that way
```

`knip.json` lists `src/lib/roi/research/**` and `src/lib/roi/v2/*` as **entry
points**. Not because nothing imports them — but because the tests and
`evals/research/look.mjs` reach them by bundling at run time, which no tool can
see. `types.typecheck.ts` is nobody's import at all: it exists only to be
compiled. Remove those two lines and knip calls the research code dead. knip
refuses unknown settings, so this note cannot live inside the config file.

## Environment variables

`.env.example` is the full list, and marks which are required. Secrets go in
`.env.local`, which git ignores — never commit them. Anything starting with
`NEXT_PUBLIC_` is visible in the browser; everything else is server-only.

Two things the list will not tell you:

- `SUPABASE_SERVICE_ROLE_KEY` is server-only, gives full access to the database,
  and ignores every access rule. Handle it carefully.
- There is **one shared Supabase project** for local, CI and production. There is
  no staging database, so be careful with anything that deletes.

## Working norms

- **Do what was asked, and no more.** This is a live app. Do not tidy unrelated
  code, rename things, or change how styling works unless you were asked to.
- **Match the file you are in** — JavaScript or TypeScript, and its naming.
- **Never commit secrets** or real client data. The ROI evals hold redacted data
  only; see `evals/roi/README.md`.
- After any real change, run `npm run lint` and `npm test`, and report what
  happened honestly, failures included.
- Keep commits focused and open a pull request. Never push straight to `main`.
  Branch names follow Linear's own, like `yousef/lyr-146-short-slug`.

## Writing style

Write in plain, simple English — in code comments, commit messages, PR
descriptions and replies. Short sentences. Common words. Explain a term the first
time you use it, and point at the real thing in the repo it refers to. Depth is
good; difficulty is not.
