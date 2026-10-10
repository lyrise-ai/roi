---
name: profit-map-v2
description: >-
  How Profit Map V2 (/v2) is put together: the interview, research, the
  calculator chain, saved reports, sharing and claiming. Use when working on
  anything under pages/v2, pages/api/v2, src/v2/report or src/v2/research.
  CLAUDE.md has the repo-wide rules (V1/V2 split, migrations, logging); this
  covers what it doesn't.
---

# Profit Map V2

## The journey

1. `/v2` (`pages/v2/index.jsx`): landing → company → interview → reveal. All
   answers live in the page's `flow` object in the browser.
2. Submitting the company opens `GET /api/v2/research?domain=` as a stream
   (`useScan`). The research agent (`src/v2/research/agent.ts`) sends
   `finding`, `step`, `gaps`, `done`. The domain is cleaned by
   `cleanDomain` in `src/v2/report/domain.ts`, the one copy, used by the
   browser and the server.
3. Reveal: `answerBridge.ts` turns typed answers into numbers,
   `miniCalculator.ts` works out every figure (`selectFeatured`,
   `calculateReport`, `SETTINGS`), `format.ts` is the only place a number
   becomes text. No AI on this screen.
4. The reveal saves once: `POST /api/v2/save` → one row in `v2_reports`.

## Saved reports (`src/v2/report/savedReport.ts`)

- `v2_reports`: `id` (UUID, the link), `owner_id` (null until sign-in),
  `claim_token`, and the inputs as jsonb: `company`, `pains`, `research`,
  `words`, `settings`. RLS on; one policy: a signed-in user reads rows where
  `owner_id` is theirs. Browser keys have no write rights.
- `saveReport` inserts, never upserts: a known id can't overwrite a report.
- `loadReport(id)` → `ok | missing | not-found | unreadable`. It returns saved
  inputs only. Figures come from `buildReport` (LYR-243) once it exists; never
  fill in a stand-in number.
- Reads by link and all writes use `getSupabaseAdmin`; reads as the user use
  `createRouteClient`. Nothing else.

## Sharing and claiming

- `/v2/report/<id>` opens for anyone with the link. No account, no chat.
  Each failure gets its own message (`src/v2/components/PublicReportError.jsx`).
- Sign-in comes after the reveal. Save hands back a `claim_token` that only
  the saving browser keeps (`localStorage` key `v2_claim_<id>`). After sign-in
  the report page posts it to `POST /api/v2/claim`, which only fills an empty
  `owner_id`. A forwarded link has no token, so it can't take the report.
- `/v2/dashboard` lists the signed-in user's reports through RLS.

## Known gaps

- `pages/api/v2/email.js` still takes the report from the browser and keeps
  it in server memory. LYR-248 moves it onto `loadReport`.
- The report id is still made in the browser; LYR-250 moves it to the server.
