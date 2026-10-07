---
name: profit-map-v2
description: >-
  Architecture, state lifecycle, calculation engine, grounded research agent, persistence,
  RLS data model, and frontend contracts for Profit Map V2 in LyRise ROI. Use whenever
  implementing, debugging, refactoring, or testing V2 interview steps, report models,
  domain validation, post-reveal auth claiming, or the V2 dashboard.
---

# Profit Map V2 — Architecture, Engine & Workflow Guide

Profit Map V2 is the conversational, grounded, interactive business-case generator in LyRise ROI (`/v2`). It asks prospects how their teams actually work, conducts live grounded research on their company in parallel, models financial and operational gain, and delivers an exact-math business case that can be saved, shared, and presented to enterprise finance directors.

---

## 1. The Core Rule: Strict V1 / V2 Isolation

**V1 is legacy production. It is finished. V2 is built completely alongside it.**

```
V1 (DO NOT TOUCH OR IMPORT FROM):
├── pages/api/roi-agent.js
├── src/lib/roi/agent.ts
├── src/lib/roi/pipeline/
├── src/lib/roi/reportGrants.ts
└── tables: public.reports, public.state_data, public.users (prompt_count/role)

V2 (ALL NEW WORK GOES HERE):
├── pages/v2/                     # /v2 interview, /v2/dashboard, /v2/report/[id]
├── pages/api/v2/                 # Server endpoints: research, save, claim, reports, email
├── src/lib/roi/research/         # Grounded search agent with verified links & tool logging
└── src/lib/roi/v2/               # Pure calculation, savedReport persistence, domain validation
```

### Invariants

1. **Zero Cross-Imports**: Never import from V1 pipeline or legacy report tables in any V2 code.
2. **Throwaway Isolation**: If `pages/v2/` and `src/lib/roi/v2/` are deleted, the live V1 app must behave identically.
3. **Never unify them**: Do not port rules backwards to V1 or attempt to unify the two systems until V2 fully supersedes V1.

---

## 2. Directory Layout & Subsystems

| Path                           | Purpose           | Key Files & Responsibilities                                                                                                                                               |
| :----------------------------- | :---------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`pages/v2/index.jsx`**       | Interview Flow    | 4-step wizard (`landing` → `company` → `interview` → `reveal`). In-memory session state, parallel SSE research panel, post-reveal claiming.                                |
| **`pages/v2/dashboard.jsx`**   | User Dashboard    | Server-rendered dashboard listing reports owned by the authenticated user. Protected by PostgreSQL RLS (`auth.uid() = owner_id`).                                          |
| **`pages/v2/report/[id].jsx`** | Exact Link Viewer | SSR public report page. Opened by exact UUID link via admin client (link is the key). Auto-claims if viewer is authenticated.                                              |
| **`pages/api/v2/`**            | Server API        | `research.js` (SSE stream), `save.js` (persists report row), `claim.js` (assigns `owner_id`), `reports.js` (lists user reports), `email.js` (Resend delivery).             |
| **`src/lib/roi/v2/`**          | V2 Domain Logic   | `savedReport.ts` (data layer), `domain.ts` (hostname validation), `miniCalculator.ts` (math engine), `format.ts` (currency & hours), `answerBridge.ts` (extracts numbers). |
| **`src/lib/roi/research/`**    | Grounded Agent    | `agent.ts` (loop & system prompt), `tools.ts` (Tavily & scraping), `log.ts` (only file allowed to log via `console`), `types.ts`.                                          |

---

## 3. Data Model, RLS & Persistence (`public.v2_reports`)

### Schema (`supabase/migrations/20261006000020_create_v2_reports.sql`)

```sql
create table if not exists public.v2_reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  company jsonb not null default '{}'::jsonb,
  pains jsonb not null default '[]'::jsonb,
  research jsonb not null default '{}'::jsonb,
  words jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS Policy: Authenticated users can only read their own reports
create policy "Users can read own v2 reports"
  on public.v2_reports for select to authenticated
  using (auth.uid() = owner_id);
```

### Key Principles

1. **Anonymous First**: A report can have no owner. `owner_id` is `null` until sign-in.
2. **The Link is the Key**: Report IDs are always random RFC4122 v4 UUIDs (`crypto.randomUUID()`). The link works anonymously without auth.
3. **Exact ID Link Reads**: `loadReport(id)` reads by exact UUID via admin client, bypassing RLS because possession of the UUID link grants view rights.
4. **Post-Reveal Claiming**: Sign-in on `/v2` fills `owner_id = user.id`. The report UUID and link remain completely unchanged.
5. **No Legacy User Tables**: V2 links directly to Supabase Auth `auth.users(id)` and `auth.uid()`. Never reference legacy `public.users` table.
6. **Admin Client Comment Rule**: Every use of `getSupabaseAdmin()` MUST have an explanatory comment detailing why admin privileges are required (e.g. anonymous report writing or link-based lookup).

---

## 4. The 4-Step Interview Flow (`pages/v2/index.jsx`)

1. **`landing`**: Minimal, high-conversion entry with clear expectations (`~3 minutes`, `Free, no sales call`).
2. **`company`**:
   - Captures company name and website.
   - **Frontend Domain Validation**: Validated via `cleanDomain(value.website)`. Invalid formats (e.g. `as das as`) display an immediate inline error and prevent submission.
   - Submitting sets `scanFor` and transitions immediately to the interview without waiting for research.
3. **`interview`**:
   - `flow.turn` cycles through pain points (minimum 2 named pains required to reveal).
   - Side-by-side with `ScanPanel` streaming live research via SSE `/api/v2/research?domain=...`.
   - Never asks for forbidden jargon: no "percent", "automatable", "headcount", "volume", "FTE", or "blended rate".
4. **`reveal`**:
   - Computes financial gain & hours returned using `calculateMiniProfitMap()`.
   - Persists anonymous report row to `/api/v2/save` immediately.
   - Renders post-reveal claiming and email dispatch cards.

---

## 5. Responsive Claiming: Option C (Desktop) vs Option A (Mobile)

Post-reveal sign-in uses an adaptive layout optimized for viewport capabilities:

### Desktop Viewport (`> 640px`): Option C (Floating Dock + Modal)

- Rendered via `.v2-claim-dock` anchored to viewport bottom center with glassmorphism styling (`backdrop-filter: blur(16px)`).
- **Guest**: Displays `🔒 Report generated as guest` + `[ Save to My Account ]`. Clicking opens `@components/ui/Dialog` containing Google OAuth and Magic Link inputs.
- **Signed In**: Displays `✓ Saved to your account (email)` + `[ My Reports → ]` linking to `/v2/dashboard`.

### Mobile Viewport (`<= 640px`): Option A (Inline Card)

- Rendered via `.v2-claim-inline-card` positioned inline directly above the email delivery section.
- `.v2-claim-dock` is hidden via CSS media query to prevent virtual keyboard obstruction.
- Full-width mobile buttons for one-tap Google OAuth and email input.

---

## 6. Grounded Research Agent (`src/lib/roi/research/`)

The V2 research agent investigates the prospect company during the interview:

1. **Link Verification Invariant**: Every finding emitted by `noteFinding` MUST point to a URL actually fetched and parsed during that run (`types.ts` `Link` brand). Non-verified URLs are rejected.
2. **Failure Transparency**: If a page cannot be retrieved, `readPage` logs the explicit reason (timeout, 404, bot block). Failures appear as `gaps` in the scan panel.
3. **Console Logging Invariant**: Only `src/lib/roi/research/log.ts` may touch `console`. All other research files must use `createLogger()`.

---

## 7. Developer Rules & Verification Checklist

- **Strict Linting**: `npm run lint` must finish with **0 errors and 0 warnings**.
- **Unit Tests**: Run tests with `node --test src/lib/roi/v2/__tests__/*.test.mjs`.
- **Database Migrations**:
  - Defined in `supabase/migrations/YYYYMMDDNNNNNN_name.sql`.
  - **NEVER execute migrations manually in Supabase Dashboard SQL Editor** (it bypasses `supabase_migrations.schema_migrations` and breaks CI).
  - Migrations are applied automatically by GitHub Actions upon merging into `main`.
- **CSS & Design Tokens**:
  - Always use tokens from `styles/tokens/*.css` or Tailwind aliases.
  - Never hardcode raw pixels; use relative units (`clamp()`, `rem`, `ch`).
