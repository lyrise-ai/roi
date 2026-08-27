// ─────────────────────────────────────────────────────────────────────────────
// pages — the only place the research system goes out to the network.
//
// Tools ask this file for a page; they never fetch one themselves. The careers
// page gets wanted more than once in a run, and without something in the middle
// that would be several downloads of the same bytes. It also means running a
// second report for the same company costs almost nothing.
//
// Two layers, on purpose:
//   memory   — lasts one server run. Stops two calls for the same URL at the
//              same moment from each fetching it.
//   Supabase — lasts between server runs. Vercel throws the server away between
//              requests, so memory alone would buy nothing on a repeat visit.
//
// The Supabase layer is allowed to fail. If the database is unreachable or not
// set up we fall back to memory only, rather than failing the run. That is also
// how a plain `node --test` run behaves, since it has no database settings.
//
// How we fetch: a plain request first, Firecrawl only as a rescue. Small law and
// accountancy firms — our customers — mostly run simple sites, and a plain
// request gets their careers page in full. Firecrawl earns its cost on the few
// that refuse ordinary requests or build the page with JavaScript. Keeping it
// second rather than default is what keeps us inside the free 1,000 credits a
// month.
//
// ── It never returns null ────────────────────────────────────────────────────
//
// This used to hand back `null` whether the site timed out, refused us, or had
// no such page. That one word threw away the difference between "this company
// has nothing" and "we never got to look" — and that difference is the whole
// point of the research system. `stalawfirm.com` was written down as "genuinely
// unreachable" for a whole card because of it. The site answers fine. It just
// takes 20 seconds, and we wait 15.
//
// So a failure now says which failure it was, in words the agent can act on and
// a person can read. It still never throws.
// ─────────────────────────────────────────────────────────────────────────────

import { providerKey } from './env'

/* A page we downloaded, and when. `fetchedAt` is when the bytes were really
   pulled, not when someone asked — a page served from the cache reports when it
   was first downloaded. */
export type Page = { content: string; fetchedAt: string }

/* Why we could not read a page. A short closed list on purpose: the agent
   reasons about `why`, and `detail` ends up in front of a prospect by way of
   `gaps`, so both have to mean something to a model AND to a person. */
export type ReadFailure = {
  ok: false
  why: 'timeout' | 'refused' | 'not-found' | 'needs-browser' | 'rescue-spent'
  detail: string
}

/* Written out flat rather than as `({ok: true} & Page) | ReadFailure`. This repo
   compiles with TypeScript's strict checks off, and an intersection inside a
   union stops `if (!page.ok)` narrowing — the caller then cannot see `why` at
   all. Flat, it works. */
export type ReadOk = {
  ok: true
  url: string
  content: string
  fetchedAt: string
}

export type ReadResult = ReadOk | ReadFailure

export const PAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000

/* How long we wait for an ordinary page. Fifteen seconds is generous for a
   normal site and short enough that a dead one does not hold up an interview. */
export const FETCH_TIMEOUT_MS = 15_000

/* How long a caller may ask us to wait when the ordinary limit was not enough.

   Some real firms are simply slow. `stalawfirm.com`'s apex redirect alone takes
   20 seconds and its careers page another 18, so at 15 we never see either and
   score the firm as having nothing — which is a fact about their web host, not
   about their company.

   Capped because someone is waiting. The agent gets 20 turns, so an uncapped
   wait is an uncapped run. */
export const MAX_WAIT_MS = 45_000

/* Sent with the plain request. Node's default identifier is refused by a fair
   number of professional-services sites sitting behind a firewall. This is an
   ordinary browser identifier, not an attempt to get around bot detection.
   Sites that still refuse fall through to Firecrawl, or to nothing. */
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

type MemoryEntry = { page: Page; expiresAt: number }

const memory = new Map<string, MemoryEntry>()

/* Joins up requests for the same URL happening at the same moment, so two calls
   for /careers share one fetch instead of racing to fill the same slot. */
const inflight = new Map<string, Promise<ReadResult>>()

/* Works out the key we file a page under. Two spellings of the same page must
   not become two fetches and two rows, so we strip out capitalisation in the
   domain, anything after a #, a trailing slash, and the tracking parameters
   that come attached to links from analytics tools. Returns null for anything
   that is not an http or https URL. */
export function normalizeUrl(raw: string): string | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

  url.hostname = url.hostname.toLowerCase()
  url.hash = ''
  for (const param of [...url.searchParams.keys()]) {
    if (param.toLowerCase().startsWith('utm_') || param === 'fbclid') {
      url.searchParams.delete(param)
    }
  }
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1)
  }
  return url.toString()
}

/* Empties the memory layer. For tests, and for `npm run dev`, where an old page
   would otherwise survive a hot reload. Does not touch Supabase. */
export function clearPageCache(): void {
  memory.clear()
  inflight.clear()
}

function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
}

/* Both Supabase helpers swallow every error. This layer only makes things
   faster. A miss caused by a database problem means a slower run, not a failed
   one, and must never show up as a scout error. */
async function readPersisted(key: string): Promise<Page | null> {
  if (!supabaseConfigured()) return null
  try {
    const { getSupabaseAdmin } = await import('../../supabaseAdmin')
    const { data, error } = await getSupabaseAdmin()
      .from('research_artifacts')
      .select('content, fetched_at, expires_at')
      .eq('url_key', key)
      .maybeSingle()
    if (error || !data) return null
    if (new Date(data.expires_at).getTime() <= Date.now()) return null
    if (typeof data.content !== 'string' || data.content === '') return null
    /* Postgres writes a timestamp ending in "+00:00" where JavaScript writes
       "Z". Both are correct and mean the same moment, but this value ends up
       displayed as when we fetched the page. So a page served from the cache
       and one fetched fresh must not look different downstream. */
    return {
      content: data.content,
      fetchedAt: new Date(data.fetched_at).toISOString(),
    }
  } catch {
    return null
  }
}

async function writePersisted(key: string, page: Page): Promise<void> {
  if (!supabaseConfigured()) return
  try {
    const { getSupabaseAdmin } = await import('../../supabaseAdmin')
    await getSupabaseAdmin()
      .from('research_artifacts')
      .upsert(
        {
          url_key: key,
          content: page.content,
          fetched_at: page.fetchedAt,
          expires_at: new Date(
            new Date(page.fetchedAt).getTime() + PAGE_TTL_MS,
          ).toISOString(),
        },
        { onConflict: 'url_key' },
      )
  } catch {
    /* best-effort */
  }
}

/* The plain request, and the step that decides whether paying for Firecrawl is
   worth it at all. "We were refused" and "there is no such page" look identical
   if all you return is null, and mixing them up costs us both ways. Sending a
   clean 404 on to Firecrawl spends a credit, and the waiting time, to be told
   again that the page does not exist. S2 tries five possible careers paths per
   company and most of them genuinely do not exist, so this is the difference
   between one credit and five. */
type PlainFetch =
  | { content: string; blocked: false; why: null }
  | { content: null; blocked: boolean; why: ReadFailure['why'] }

/* Tells a refusal apart from an answer. Login walls, bot blocks, rate limits
   and server faults all mean the page probably exists and a real browser might
   well get it. A 404 or 410 is an answer, and Firecrawl cannot do better than
   that. */
function isBlockingStatus(status: number): boolean {
  return (
    status === 401 ||
    status === 402 ||
    status === 403 ||
    status === 405 ||
    status === 406 ||
    status === 408 ||
    status === 429 ||
    status >= 500
  )
}

async function plainFetch(url: string, waitMs: number): Promise<PlainFetch> {
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,*/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(waitMs),
    })
    if (!response.ok) {
      const blocked = isBlockingStatus(response.status)
      return {
        content: null,
        blocked,
        why: blocked ? 'refused' : 'not-found',
      }
    }
    const body = await response.text()
    if (body && body.trim() !== '')
      return { content: body, blocked: false, why: null }
    /* A success response with nothing in it is the mark of a page that builds
       itself with JavaScript — exactly what a real browser fixes. */
    return { content: null, blocked: true, why: 'needs-browser' }
  } catch (error) {
    /* `AbortSignal.timeout` throws with this name, and it is worth telling
       apart from a site that does not exist. A firm we could reach in 20
       seconds is a firm we could research if we waited; a name that does not
       resolve is not. */
    const timedOut = (error as { name?: string })?.name === 'TimeoutError'
    return {
      content: null,
      blocked: true,
      why: timedOut ? 'timeout' : 'refused',
    }
  }
}

// -- The Firecrawl budget ----------------------------------------------------
// We are on the free plan: 1,000 credits a month and 10 page reads a minute.
// Both are shared by every report the app runs, so this file spends them rather
// than any single tool — and it spends them carefully.
//
// The rate limit here is there to stop us hitting theirs, not to react after we
// do. Staying under 10 a minute means we mostly never get refused in the first
// place. That matters, because finding the limit by being refused costs a round
// trip and a worse result every time. Being refused is never an exception here:
// we return nothing, the page is unavailable, and the caller records a gap.

const FIRECRAWL_MAX_PER_MINUTE = 10
const FIRECRAWL_WINDOW_MS = 60_000

/* Running out of credits is a billing state, not a passing glitch. Retrying
   every request for the rest of the month would waste time on a guaranteed
   refusal. Waiting an hour before trying again means a running server picks up
   a top-up or the monthly reset on its own, without us tracking either. */
const FIRECRAWL_QUOTA_COOLDOWN_MS = 60 * 60 * 1000

/* Timestamps of recent calls, pruned to the rolling window. */
let firecrawlCalls: number[] = []
let firecrawlDisabledUntil = 0
let firecrawlDisabledReason: string | null = null

/* For the coverage test and for the logs. It matters a great deal whether a
   thin result came from a company with nothing to find, or from us running out
   of credits halfway through. Telling those apart is the whole point of R5 on
   the parent card: what we managed to look at is always declared, never
   hidden. */
export function rescueBudget(): {
  available: boolean
  reason: string | null
  callsInWindow: number
} {
  pruneFirecrawlCalls()
  const disabled = firecrawlDisabledUntil > Date.now()
  return {
    available: !disabled && firecrawlCalls.length < FIRECRAWL_MAX_PER_MINUTE,
    reason: disabled
      ? firecrawlDisabledReason
      : firecrawlCalls.length >= FIRECRAWL_MAX_PER_MINUTE
        ? 'rate limit: 10/min reached'
        : null,
    callsInWindow: firecrawlCalls.length,
  }
}

export function resetRescueBudget(): void {
  firecrawlCalls = []
  firecrawlDisabledUntil = 0
  firecrawlDisabledReason = null
}

function pruneFirecrawlCalls(): void {
  const cutoff = Date.now() - FIRECRAWL_WINDOW_MS
  firecrawlCalls = firecrawlCalls.filter((at) => at > cutoff)
}

function disableFirecrawl(ms: number, reason: string): void {
  firecrawlDisabledUntil = Date.now() + ms
  firecrawlDisabledReason = reason
}

/* The Firecrawl step. Having no API key set is a normal, supported state: we
   return nothing and the page is simply unavailable, which is the honest
   answer. Being out of budget is the same — we decline to call rather than
   spending a request to be told no. */
async function firecrawlFetch(url: string): Promise<string | null> {
  const key = providerKey('FIRECRAWL_API_KEY')
  if (!key) return null
  if (!rescueBudget().available) return null

  firecrawlCalls.push(Date.now())

  try {
    const response = await fetch('https://api.firecrawl.dev/v2/scrape', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      /* We ask for markdown, not raw HTML. Firecrawl charges one credit either
         way — checked against their own credit-usage endpoint — and raw HTML
         genuinely tells us more, in particular the machine-readable address
         block S1 reads the country out of.
         Markdown still wins on size: 25KB against 546KB for the same page. And
         everything that uses this content either strips the tags anyway or
         feeds it to a model that charges by the word.
         ponytail: so pages fetched this way have no machine-readable data, and
         a blocked site on a .com has to fall back to reading its footer for the
         country. If a run shows sites losing their country because of
         this, ask for both and prefer the raw HTML. */
      body: JSON.stringify({ url, formats: ['markdown'] }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS * 2),
    })

    if (response.status === 402) {
      disableFirecrawl(FIRECRAWL_QUOTA_COOLDOWN_MS, 'out of credits (402)')
      return null
    }

    if (response.status === 429) {
      /* If Firecrawl tells us how long to wait, we listen. It also refuses when
         too many browsers are open at once, which clears faster than the
         per-minute limit. We never sit and wait inside a request — a scout
         waiting 30 seconds to fill one row is worse than the row being missing
         — so this just parks Firecrawl and lets the run carry on. */
      const retryAfter = Number(response.headers?.get?.('retry-after'))
      const cooldown =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter, 120) * 1000
          : FIRECRAWL_WINDOW_MS
      disableFirecrawl(cooldown, 'rate limited (429)')
      return null
    }

    if (!response.ok) return null

    const json = await response.json()
    const markdown = json?.data?.markdown
    return typeof markdown === 'string' && markdown.trim() !== ''
      ? markdown
      : null
  } catch {
    return null
  }
}

/* The one function tools call to get a web page.

   Never throws, never treats an empty page as a success, and never answers
   `null`. A failure says which failure it was, because the caller can act on
   that: a timeout is a real site worth one more try at a different address, and
   a 404 is not. */
export async function readPage(
  url: string,
  /* How long to wait. Callers leave this alone until a page times out; then
     asking again with more is the one recovery worth having, because a slow
     site is a real site. Clamped, so no caller can ask for forever. */
  waitMs: number = FETCH_TIMEOUT_MS,
): Promise<ReadResult> {
  const wait = Math.min(Math.max(waitMs, 1_000), MAX_WAIT_MS)
  const key = normalizeUrl(url)
  if (!key) {
    return {
      ok: false,
      why: 'not-found',
      detail: `"${url}" is not a web address we can fetch`,
    }
  }

  /* The wait is deliberately not part of the key. A page fetched after 30
     seconds is the same page as one fetched after 2, so a slow first read still
     makes every later read of it free. Nothing is cached on failure, so asking
     again with a longer wait really does refetch. */
  const cached = memory.get(key)
  if (cached) {
    if (cached.expiresAt > Date.now())
      return { ok: true, url: key, ...cached.page }
    memory.delete(key)
  }

  const pending = inflight.get(key)
  if (pending) return pending

  const work = (async (): Promise<ReadResult> => {
    const persisted = await readPersisted(key)
    if (persisted) {
      memory.set(key, {
        page: persisted,
        expiresAt: new Date(persisted.fetchedAt).getTime() + PAGE_TTL_MS,
      })
      return { ok: true, url: key, ...persisted }
    }

    const plain = await plainFetch(key, wait)
    if (plain.content === null && !plain.blocked) {
      /* A clean 404. Firecrawl cannot do better than "no such page", so we do
         not spend a credit finding that out twice. */
      return {
        ok: false,
        why: plain.why,
        detail: `${key} answered, and there is no page there`,
      }
    }

    let content = plain.content
    if (content === null) {
      const budget = rescueBudget()
      if (!budget.available) {
        return {
          ok: false,
          why: 'rescue-spent',
          detail: `${key} needs a full browser and our rescue budget is spent (${budget.reason ?? 'limit reached'}). That is our limit, not something about this company.`,
        }
      }
      content = await firecrawlFetch(key)
    }

    if (!content) {
      return {
        ok: false,
        why: plain.why ?? 'refused',
        detail: detailFor(plain.why, key, wait),
      }
    }

    const page: Page = { content, fetchedAt: new Date().toISOString() }
    memory.set(key, { page, expiresAt: Date.now() + PAGE_TTL_MS })
    await writePersisted(key, page)
    return { ok: true, url: key, ...page }
  })().finally(() => {
    inflight.delete(key)
  })

  inflight.set(key, work)
  return work
}

/* One sentence per failure, written for a person. These travel into `gaps` and
   are read by a prospect, so "timed out" is not good enough on its own — it has
   to say what that means about their company, which is usually nothing. */
function detailFor(
  why: ReadFailure['why'] | null,
  url: string,
  wait: number,
): string {
  const seconds = Math.round(wait / 1000)
  switch (why) {
    case 'timeout':
      return wait >= MAX_WAIT_MS
        ? `${url} did not answer within ${seconds}s, which is the longest we will wait. The site is real but too slow to research — this says nothing about the company.`
        : `${url} did not answer within ${seconds}s. The site is real but slower than we waited. Asking again with waitSeconds up to ${Math.round(MAX_WAIT_MS / 1000)} may get it.`
    case 'needs-browser':
      return `${url} loaded but builds itself with JavaScript, and a full browser could not be used either.`
    case 'not-found':
      return `${url} answered, and there is no page there.`
    default:
      return `${url} refused us, and a full browser could not get it either.`
  }
}

/* Turns downloaded markup into readable text. The model reads words; paying to
   send it tags is paying for nothing. Handles both what we hold: markup from a
   plain fetch, and markdown from the rescue fetcher (which passes through
   unharmed, since it has no tags to strip). */
export function textOf(html: string): string {
  if (typeof html !== 'string') return ''
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' ')
    .trim()
}
