# Observability setup

The code is wired. These are the steps that live in the PostHog and Sentry
dashboards and can't be done from the repo. ~15 minutes, once.

## Who does what

|                       | **PostHog** — open this first              | **Sentry** — click through to this           |
| --------------------- | ------------------------------------------ | -------------------------------------------- |
| Errors                | client, server, edge — the list you triage | same errors, source-mapped frames + grouping |
| Session replay        | yes                                        | off (pinned to 0)                            |
| Tracing / performance | no                                         | yes, 10% of requests                         |
| Product analytics     | yes                                        | no                                           |
| Linear tickets        | **owns them**                              | **must be turned off**                       |
| Feedback widget       | no                                         | yes, with screenshots                        |

At 2am: open PostHog → Error tracking. Every issue links to the session replay
of the user who hit it and to the Sentry issue for the full stack trace.

---

## 1. Environment variables

Get these from PostHog → Settings → Project, and paste into `.env.local` **and**
Vercel (all environments):

| Var                                 | Where it comes from                                                         |
| ----------------------------------- | --------------------------------------------------------------------------- |
| `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` | Project settings → Project API key (`phc_…`)                                |
| `NEXT_PUBLIC_POSTHOG_HOST`          | `https://eu.i.posthog.com` — this project is EU, not US                     |
| `POSTHOG_PROJECT_ID`                | Project settings → Project ID (a number)                                    |
| `POSTHOG_API_KEY`                   | Settings → Personal API keys → new key, scope **write** on _error tracking_ |
| `POSTHOG_WEBHOOK_SECRET`            | Invent one: `openssl rand -hex 32`. Guards `/api/linear/triage` only        |
| `NEXT_PUBLIC_SENTRY_ORG`            | Your Sentry org slug — only used for deep links                             |

`POSTHOG_API_KEY` and `POSTHOG_PROJECT_ID` are build-time only (source-map
upload). Local builds skip the upload when they're absent, which is intended.

**Region matters, and getting it wrong fails silently.** This project lives on
**EU** — `ROI`, id `199195`, at `eu.posthog.com`. A key or host from the US
region authenticates against nothing here: ingestion accepts the events and
drops them, and the API returns 401, so the only symptom is a dashboard that
stays empty. `POSTHOG_API_KEY` in particular must be a personal key created
while signed in to the EU region; a US personal key will 401 on every
source-map upload. If events stop appearing, check the region before anything
else.

Nothing breaks if you set none of these — PostHog stays completely inert. That
is also how CI stays out of the production project.

## 2. PostHog → enable error tracking

Settings → Error tracking → **Enable exception autocapture**.

The client SDK also sets `capture_exceptions: true` itself, and server/edge
errors arrive via `onRequestError` in `instrumentation.ts`, so this toggle is
belt-and-braces — but leave it on.

## 3. PostHog → Linear alert (this is the 2am pager)

Error tracking → Configuration → **Alerting** → New notification, using
PostHog's built-in **Linear** destination template:

- Trigger: **issue created or reopened** (not "every occurrence" — that would
  open a ticket per error event rather than per distinct bug)
- Destination: **Linear**, pointed at the team that owns Triage

No code in this repo is involved — PostHog talks to Linear directly.

## 4. PostHog → connect Linear

Error tracking → Integrations → Linear → **Connect workspace**.

Needed by step 3, and it also powers the manual "Create issue" button on an
error's detail page.

## 5. Sentry → turn OFF Linear issue creation

Sentry → Settings → Integrations → Linear → **disable any alert rule that
auto-creates issues.**

Skip this and every error opens two Linear tickets, one from each tool.

## 6. Sentry → confirm the console rule is gone

The Sentry configs no longer register `captureConsoleIntegration`. If you had
Sentry-side alert rules keyed to those console-derived issues, they'll go quiet
— that's the intent. This repo has ~80 `console.error` calls, most in
best-effort catch blocks that have already handled the failure, and each one was
becoming an issue and then a ticket.

---

## Dashboards worth building

PostHog → Dashboards → New. The events are already flowing; these are just saved
insights. (I can script these via the API instead — say the word and I'll use
`POSTHOG_API_KEY`.)

**"Is the pipeline healthy"**

- Funnel: `roi_generation_started` → `roi_generation_completed`. The gap is runs
  that died without reaching the error handler — lambda timeouts, or the client
  disconnecting mid-stream.
- Trend: `roi_generation_failed` broken down by `error_message`.
- Trend: p50/p95 of `duration_ms` on `roi_generation_completed`. The endpoint's
  ceiling is `maxDuration: 300`, so a p95 climbing toward 300000ms is the early
  warning for timeouts.

**"What is this costing"**

- Trend: sum of `cost_usd` on `roi_llm_usage`, broken down by `models`.
- Trend: average `cost_usd` per report, and `total_tokens` by `mode`
  (`generate` vs `chat`) — chat edits should be far cheaper than generations.

**"Does the product work"**

- Funnel: `roi_generation_completed` → `validation_completed` →
  `chat_link_opened` → `chat_message_sent`. This is the prospect journey.
- Trend: `sentry_feedback_form_opened` → `sentry_feedback_form_submitted`, to
  see how much feedback is being abandoned.

## Verifying it works (and why you can't automate it)

**PostHog drops browser traffic it thinks is a bot, and every headless browser
qualifies.** Playwright — headless _or_ headed, with a spoofed user agent,
`navigator.webdriver` hidden, and plugins faked — is still refused: PostHog logs
`Refusing to render ... the viewer is a likely bot` and silently discards
`capture()`. The SDK still loads, still fetches its extensions, and still POSTs
to `/flags/`, so it looks healthy while sending no events. Don't spend an hour
on this like I did; verify the browser half by hand.

Server-side has no such filter and _is_ covered by automated tests.

To check the browser half:

1. `npm run dev` with the PostHog vars set in `.env.local`.
2. Open `http://localhost:3000/auth/login` in your normal browser, click around,
   navigate to another page.
3. PostHog → **Activity** (live events). A `$pageview` should land within
   seconds, followed by `$autocapture` for the clicks.
4. PostHog → **Session replay**. The recording appears a minute or two later.
   Confirm form inputs render as asterisks and page text is readable.

If Activity stays empty, check the browser console for `PostHog` errors and that
`NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` is actually present in the built page —
`NEXT_PUBLIC_*` vars are inlined at build time, so a dev server started before
you set them won't have it.

## Sampling and cost

Session replay currently records **every** session, which is right for alpha and
will get expensive with volume. To dial it back, add
`session_recording: { sampling: … }` in `src/lib/posthog-browser.ts`, or set a
sampling percentage in PostHog → Settings → Session replay (no deploy needed —
prefer this).

## Privacy

Replays mask **everything typed** (`maskAllInputs: true`) — login credentials
and the ROI intake form. Rendered report text stays visible on purpose: a replay
that can't show the numbers can't answer "the numbers looked wrong".

To hide something specific, add a class in the markup:

- `ph-mask` — element's text is replaced with asterisks
- `ph-no-capture` — element isn't recorded at all
