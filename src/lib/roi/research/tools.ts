// ─────────────────────────────────────────────────────────────────────────────
// tools — what the research agent can do.
//
// None of this is new work. Fetching a page, searching, reading links off a
// page: all of it existed already, as fixed steps that ran in the same order for
// every company whether or not anything needed them. This file turns them
// outward, so the agent picks the one it wants.
//
// ── The rule this file exists for ────────────────────────────────────────────
//
// A FAILURE ALWAYS GOES UP TO WHOEVER CAN DO SOMETHING ABOUT IT.
//
// It used to disappear twice. `getArtifact` answered `null` whether the site
// timed out, refused us, or had no such page — so the caller could not tell a
// slow firm from a missing one. Then a thin result became a blank section, so
// the prospect could not tell "you have no public jobs" from "we never reached
// your site". `stalawfirm.com` was written down as "genuinely unreachable" for a
// whole card because of those two. It answers fine, in 20 seconds.
//
// So every tool here returns one of two things, never null and never a throw:
//
//     { ok: true,  ... }
//     { ok: false, why: 'timeout' | ..., detail: 'a sentence' }
//
// The agent reads "did not answer within 15s" and can try `www.` instead, or
// stop and say so. That sentence then travels into `gaps`, which is what the
// person actually sees. Tool tells agent. Agent tells person.
//
// ── What does not change ─────────────────────────────────────────────────────
//
// Every page we really open is written into `opened`. A finding pointing
// anywhere else is thrown away before a person sees it. Giving the agent tools
// does not make inventing less likely — it makes it MORE likely, because after
// three calls it holds half a picture and half feels like enough. The check
// underneath the model is what holds the line.
//
// Nothing is refused by host. Any page the agent asks for, it gets. Sites that
// republish other people's job listings — Indeed, GulfTalent, Glassdoor — are
// still LABELLED as second-hand, because they are often wrong about which
// company a posting belongs to, and the agent has to check the name on the page
// before believing it. A label the agent can reason about, not a wall it cannot
// see past.
// ─────────────────────────────────────────────────────────────────────────────

import { tool } from 'ai'
import { z } from 'zod'

import { type Log, startLog } from './log'
import {
  MAX_WAIT_MS,
  readPage as fetchPage,
  rescueBudget,
  textOf,
} from './pages'
import { careersLinks, jobLinks, pickTheirPages, webSearch } from './search'
import { type Attempt, type Finding, type Link, QUOTE_MAX, link } from './types'

/* Everything one run shares. `opened` is the grounding: only what is in here
   can be cited. `tried` is the trace, and it is filled in even on a run that
   found nothing — especially then. */
export type Run = {
  domain: string
  opened: Set<Link>
  tried: Attempt[]
  findings: Finding[]
  /* Where everything that happens gets written down. An agent that picks its
     own next move is a black box otherwise. */
  log: Log
  /* Called the moment a finding is accepted, so the side panel fills while the
     agent is still working. Waiting for the run to end would turn a panel that
     fills up into a spinner. */
  onFinding?: (finding: Finding) => void
}

export function startRun(
  domain: string,
  onFinding?: (finding: Finding) => void,
): Run {
  return {
    domain,
    opened: new Set(),
    tried: [],
    findings: [],
    onFinding,
    log: startLog(domain),
  }
}

/* Records one call and logs it, in that order, in one place. Every tool goes
   through here so the trace and the log can never disagree about what
   happened. */
export function record(run: Run, attempt: Attempt): void {
  run.tried.push(attempt)
  run.log.call(attempt)
}

/* How much page text one call hands back. A careers page runs to tens of
   thousands of characters and most of it is a navigation menu. */
const MAX_TEXT = 8_000

/* Reads a page, records what happened, and remembers the address if it worked.
   Shared by the tools that fetch, so the trace and the citable-links list can
   never drift apart. */
async function open(
  run: Run,
  url: string,
  tried: string,
  waitMs?: number,
): Promise<
  | { ok: true; url: string; text: string; html: string }
  | { ok: false; why: string; detail: string }
> {
  const checked = link(url)
  if (!checked) {
    record(run, { tried, got: 'nothing', ms: 0, why: 'not a web address' })
    return {
      ok: false,
      why: 'bad-url',
      detail: `"${url}" is not a web address`,
    }
  }

  const startedAt = Date.now()
  const page = await fetchPage(checked, waitMs)
  const ms = Date.now() - startedAt

  /* `'why' in page` rather than `!page.ok`. With strict checks off, negating a
     boolean tag does not narrow a union here; checking for the field does. */
  if ('why' in page) {
    record(run, {
      tried,
      got: page.why === 'timeout' ? 'timeout' : 'nothing',
      ms,
      why: page.detail,
    })
    return { ok: false, why: page.why, detail: page.detail }
  }

  const text = textOf(page.content)
  if (text.length < 400) {
    record(run, {
      tried,
      got: 'nothing',
      ms,
      why: `only ${text.length} characters of text — a menu or a shell`,
    })
    return {
      ok: false,
      why: 'empty',
      detail: `${page.url} loaded but held only ${text.length} characters of text. That is a menu or an empty shell, not content.`,
    }
  }

  const opened = link(page.url)
  if (opened) run.opened.add(opened)
  record(run, { tried, got: 'page', ms })
  return { ok: true, url: page.url, text, html: page.content }
}

/* Two adverts for the same job closer together than this are two open seats at
   once, not one seat being refilled. `bakertilly.com` posted the same role twice
   on the same day, which would have read as people leaving. */
const MIN_GAP_DAYS = 14

export function createTools(run: Run) {
  return {
    readPage: tool({
      description:
        'Read one web page and return its text. Use it for a careers page, an about page, a services page, or a single job advert. Pages are shared and remembered, so reading one you or another call already fetched costs nothing. When it fails you are told why: not-found means there is no page there and guessing nearby is wasted; a timeout means the site is real, just slow, and you can ask again with a longer waitSeconds.',
      inputSchema: z.object({
        url: z.string().describe('Full address including https://'),
        why: z
          .string()
          .describe(
            'A short phrase saying what you expect to find. It goes in the trace so a person can see what we looked for.',
          ),
        waitSeconds: z
          .number()
          .optional()
          .describe(
            `How long to wait, up to ${Math.round(MAX_WAIT_MS / 1000)}. Leave it out normally. Use it ONLY after that same address has already timed out — some real firms take 20 seconds to answer, and giving up on them tells us something about their web host, not their company. Do not raise it after a not-found: there is nothing there to wait for, and someone is waiting on you.`,
          ),
      }),
      execute: async ({ url, why, waitSeconds }) => {
        const waitMs = waitSeconds ? waitSeconds * 1000 : undefined
        const label = waitSeconds
          ? `read ${url} — ${why} (waiting ${waitSeconds}s)`
          : `read ${url} — ${why}`
        const got = await open(run, url, label, waitMs)
        if (!got.ok) return got
        return {
          ok: true as const,
          url: got.url,
          text: got.text.slice(0, MAX_TEXT),
          cutShort: got.text.length > MAX_TEXT,
        }
      },
    }),

    searchWeb: tool({
      description:
        "Search the web for pages about THIS company. Results we cannot tie to them at all are removed, so an empty answer means the query found nothing usable rather than that nothing exists. A result marked secondHand is a site that republishes other people's listings — read it if you must, but check the company name ON the page before believing the job is theirs, because these are often wrong about that. Rephrasing is often worth it: the company's real name in quotes beats its domain.",
      inputSchema: z.object({
        query: z.string().describe('The query, as you would type it'),
        alsoTheirs: z
          .array(z.string())
          .optional()
          .describe(
            "Other domains this company says are its own, if you found any. Without these, a firm that redirects to a different domain has its own pages thrown away as a stranger's.",
          ),
      }),
      execute: async ({ query, alsoTheirs }) => {
        const startedAt = Date.now()
        let hits: Awaited<ReturnType<typeof webSearch>> = []
        try {
          hits = await webSearch(query)
        } catch (error) {
          record(run, {
            tried: `search "${query}"`,
            got: 'nothing',
            ms: Date.now() - startedAt,
            why: 'the search provider failed',
          })
          return {
            ok: false as const,
            why: 'search-failed',
            detail: `the search provider failed: ${String(error)}`,
          }
        }

        const theirs = pickTheirPages(hits, run.domain, 6, alsoTheirs ?? [])
        record(run, {
          tried: `search "${query}"`,
          got: theirs.length > 0 ? 'page' : 'nothing',
          ms: Date.now() - startedAt,
          ...(theirs.length === 0
            ? { why: `${hits.length} results, none of them theirs` }
            : {}),
        })

        if (theirs.length === 0) {
          return {
            ok: false as const,
            why: 'nothing-theirs',
            detail: `${hits.length} results came back and none could be tied to ${run.domain}. Try their full name in quotes, or pass their other domains as alsoTheirs.`,
          }
        }
        return { ok: true as const, results: theirs }
      },
    }),

    findLinks: tool({
      description:
        "Pull links off a page. 'careers' finds pages about working there — it reads the link TEXT as well as the address, so it catches addresses no pattern would guess, like /career/ or /en/careers.html. 'jobs' finds single adverts linked from a vacancy list. Same company's domain only.",
      inputSchema: z.object({
        url: z.string().describe('The page to read links from'),
        kind: z
          .enum(['careers', 'jobs'])
          .describe(
            "'careers' for pages about working there, 'jobs' for single adverts",
          ),
      }),
      execute: async ({ url, kind }) => {
        const got = await open(run, url, `list ${kind} links on ${url}`)
        if (!got.ok) return got

        const found =
          kind === 'careers'
            ? careersLinks(got.html, got.url, 40)
            : jobLinks(got.html, got.url, 12).map((u) => ({ url: u, text: '' }))

        if (found.length === 0) {
          return {
            ok: false as const,
            why: 'none-there',
            detail: `${got.url} is readable and links to nothing that looks like ${kind}. That is a real answer about this company, not a failure to look.`,
          }
        }
        return { ok: true as const, links: found }
      },
    }),

    /* Writing something down is a TOOL CALL, not part of the final answer.

       Two reasons, both load-bearing.

       It makes findings arrive one at a time. The side panel fills while the
       agent is still reading, instead of staying empty until the whole run ends.

       And it is where the grounding is enforced. A finding pointing at a page we
       never opened is refused HERE, with a sentence saying so — which the agent
       can act on by going and opening it. Checking at the end would just drop it
       silently, and the agent would never learn. */
    noteFinding: tool({
      description:
        'Write down one thing we can tell this company about itself. Call it as soon as you know something, not at the end — each one appears on their screen straight away. The link must be a page you actually read in this run: anything else is refused, and you will be told so. One plain sentence a person would say out loud, not a label.',
      inputSchema: z.object({
        says: z
          .string()
          .describe(
            'The sentence. "You are hiring a paralegal whose first listed duty is chasing outstanding client documents" — never "job_posting: paralegal".',
          ),
        about: z
          .string()
          .describe('hiring, systems, location, size, services, or turnover'),
        url: z
          .string()
          .describe('A page you read in this run. Copied exactly.'),
        quote: z
          .string()
          .nullable()
          .describe(
            'Their exact words from that page, if it had any worth quoting. Otherwise null.',
          ),
      }),
      execute: async ({ says, about, url, quote }) => {
        const checked = link(url)
        if (!checked || !run.opened.has(checked)) {
          run.log.refused(url)
          return {
            ok: false as const,
            why: 'not-opened',
            detail: `We never opened ${url} in this run, so nothing may point at it. Read the page first, then write this down. If you cannot open it, do not say this at all — put it in gaps instead.`,
          }
        }

        const finding: Finding = {
          says: says.trim(),
          about: about.trim() || 'finding',
          link: checked,
          ...(quote && quote.trim() !== ''
            ? { quote: quote.trim().slice(0, QUOTE_MAX) }
            : {}),
        }

        /* Same sentence about the same page twice is one finding. */
        const already = run.findings.some(
          (f) => f.link === finding.link && f.says === finding.says,
        )
        if (already) return { ok: true as const, noted: false }

        run.findings.push(finding)
        run.log.noted(finding.says)
        try {
          run.onFinding?.(finding)
        } catch {
          /* The caller's own callback failing is the caller's problem, not a
             reason to lose the finding. */
        }
        return { ok: true as const, noted: true }
      },
    }),

    /* You group, we count.

       Deciding two adverts are the same job is judgement — "Senior Paralegal
       (Dubai)" and "Paralegal - 2 positions" are one role, and you can see that
       far better than the word-stripping rule this replaced. The counting is
       not judgement, and it must be exact and the same every run, because
       "twice in five months" goes in front of a finance director. */
    countRepeats: tool({
      description:
        'Given jobs you have grouped by role, work out which ones they have advertised more than once. Group them yourself first: strip seniority, location and reference numbers, so "Senior Paralegal (Dubai)" and "Paralegal - 2 positions" are one role. Only pass dates the advert really carried. A role advertised twice inside a year is the strongest thing we can say about people leaving, so it is worth grouping carefully.',
      inputSchema: z.object({
        roles: z.array(
          z.object({
            role: z
              .string()
              .describe('The role, with seniority and location removed'),
            dates: z
              .array(z.string())
              .describe('When each advert was posted, as YYYY-MM-DD'),
          }),
        ),
      }),
      execute: async ({ roles }) => {
        const repeats: { role: string; count: number; months: number }[] = []
        const ignored: string[] = []

        for (const entry of roles) {
          const times = (entry.dates ?? [])
            .map((d) => Date.parse(d))
            .filter((t) => Number.isFinite(t))
            .sort((a, b) => a - b)

          /* One advert is not a repeat, and a role with no dates on its
             adverts cannot be placed in a twelve-month window at all. */
          if (times.length >= 2) {
            const spanMs = times[times.length - 1] - times[0]
            const days = spanMs / 86_400_000
            const months = Math.round(days / 30)

            /* Two adverts three years apart is a firm that grew. Two on the
               same day is a firm filling two seats. Neither is people
               leaving. */
            if (months <= 12 && days >= MIN_GAP_DAYS) {
              repeats.push({ role: entry.role, count: times.length, months })
            } else {
              ignored.push(
                `${entry.role}: ${Math.round(days)} days apart — ${days < MIN_GAP_DAYS ? 'two seats at once, not a refill' : 'more than a year apart'}`,
              )
            }
          }
        }

        repeats.sort((a, b) => b.count - a.count || a.months - b.months)
        return { ok: true as const, repeats, ignored }
      },
    }),
  }
}

/* What the rescue fetcher has left, for the agent's opening message. A run that
   starts with no budget should search rather than try to force pages open. */
export function rescueLeft(): string {
  const budget = rescueBudget()
  return budget.available
    ? 'available'
    : `spent (${budget.reason ?? 'limit reached'})`
}
