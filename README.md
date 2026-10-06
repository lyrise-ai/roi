# LyRise ROI

Generates AI-adoption ROI business cases for prospect companies. A user
describes their company and manual workflows; the app researches the company on
the open web, models the financial impact with an LLM, computes the numbers in
deterministic TypeScript, and produces a branded report — viewable in the
browser, exportable as PDF, and shareable by link with a chat panel so the
recipient can interrogate and edit the model.

Next.js 15 (Pages Router) · React 18 · Supabase · OpenAI via the Vercel `ai` SDK
· Tailwind · deployed on Vercel.

---

## Setup

Requires **Node >= 24**.

```bash
npm ci
# put .env.keys in the repo root (see below)
npm run dev                  # http://localhost:3000
```

The secrets are already in the repo, encrypted, in `.env`. `npm run dev` and
`npm run build` unlock them through [dotenvx](https://dotenvx.com). To do that
they need the key, which lives in a file called `.env.keys`. Git ignores that
file, so it never reaches the repo. Ask the team for it, over a secure channel
and never in chat.

`.env.example` lists every variable and says what it is for. Read it; you do not
need to copy it.

### Minimum env to boot

Only four values are needed to start the app and log in:

| Var                             | Why                                               |
| ------------------------------- | ------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | auth + database                                   |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | auth + database                                   |
| `SUPABASE_SERVICE_ROLE_KEY`     | server routes (**full DB access — never expose**) |
| `NEXT_PUBLIC_BASE_URL`          | `http://localhost:3000` in dev                    |

Add `OPENAI_API_KEY` and `TAVILY_API_KEY` to actually generate a report.
Everything else in `.env.example` is optional and marked as such — unset
integrations degrade quietly rather than crashing.

Set `NEXT_PUBLIC_ROI_MIN_LOADER_MS` low and `ROI_DEBUG=true` while working on
the generation flow.

### Database

Supabase Postgres. Schema lives in `supabase/migrations/`. A new migration
applies itself when its pull request merges to `main`
(`.github/workflows/migrations.yml`), and the pull request shows what it will
run. Never apply one by hand. There is one shared project — local, CI, and
production all point at it. There is no staging database, so be deliberate with
destructive queries.

You'll need a Supabase user to log in with; ask the team, or sign up through
`/auth/login` against the shared project.

---

## Commands

```bash
npm run dev            # dev server (turbopack) on :3000
npm run build          # production build (note: ignores lint errors)
npm start              # serve a build

npm run lint           # ESLint — clean; keep it that way
npm run lint:fix       # auto-fix what's mechanically fixable
npm run prettier       # format everything
npm run deadcode       # knip — unused files/exports/deps

npm test               # unit tests (node --test, src/**/__tests__/*.test.mjs)
npm run test:e2e       # full Playwright suite (starts its own server on :3777)
npm run test:e2e:smoke # @smoke subset, ~1 min

npm run eval:roi       # ROI report quality eval harness (evals/roi/README.md)
npm run research -- <domain>  # run the V2 research agent on one company;
                       # costs real API spend
```

**Before you push:** `npm run lint && npm test`. CI runs both plus the full
Playwright suite; the pre-commit hook runs ESLint and Prettier over staged files
only, so it won't catch a break somewhere you didn't touch.

---

## Layout

Two versions of the app live side by side. V1 is in production and frozen; V2
is where new work goes, and replaces V1 whole when it is ready. `CLAUDE.md`
explains the rules.

```text
pages/                    routes (Pages Router)
pages/v2/                 V2: the interview
pages/api/v2/             V2: its server side
src/lib/roi/research/     V2: the research agent and its tools
src/lib/roi/v2/           V2: everything else
pages/api/roi-agent.js    V1: the main endpoint — generation + chat editing, SSE
src/lib/roi/              V1: the ROI pipeline
  agent.ts                orchestrator: one agent, tools mutate ReportState
  tools/                  web search (Tavily→Brave), page fetch
  prompts/                LLM prompts
  pipeline/               normalize → roiCalculator → assembleReport → renderTemplate
  services/               PDF (Puppeteer), email (Resend), usage/cost tracking
  bulk/                   CSV batch generation
src/components/ROIGenerator/   report UI, validation wizard, bulk upload
src/lib/                  supabase clients, auth helpers, shared utilities
supabase/migrations/      database schema
evals/roi/                gold-set eval harness for report quality
tests/e2e/                Playwright
```

Path aliases: `@components`, `@hooks`, `@` (repo root). Declared **twice** in
`next.config.js` — once for webpack, once for turbopack. Add new ones to both.

---

## Conventions

- Prettier-enforced: no semicolons, single quotes, trailing commas, 2-space
  indent. A Husky pre-commit hook applies it; don't bypass.
- Mixed JS/TS with `strict: false`. Match the file you're editing.
- Never push to `main` — PR and review, always.
- Never commit secrets or real client data.

See `CLAUDE.md` for the full conventions and working norms.
