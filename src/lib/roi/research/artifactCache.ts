// ─────────────────────────────────────────────────────────────────────────────
// research/artifactCache — the only place in the research system that goes out
// to the network for web pages (LYR-187 R1 / LYR-194).
//
// Scouts ask this file for a page; they never fetch one themselves. The
// careers page is wanted by the job-postings scout, the services scout and the
// tech scout. Without something in the middle that would be three separate
// downloads of identical bytes. It also means running a second report for the
// same company costs almost nothing.
//
// Two layers, on purpose:
//   memory   — lasts one server run. Stops several scouts asking for the same
//              URL at the same moment from each fetching it.
//   Supabase — lasts between server runs. Vercel throws the server away
//              between requests, so the memory layer alone would buy nothing on
//              a repeat visit. This is the layer that makes the second run
//              cheap.
//
// The Supabase layer is allowed to fail. If the database is unreachable or not
// set up, we fall back to memory only rather than failing the run. That is also
// how a plain `node --test` run behaves, since it has no database settings.
//
// How we fetch: a plain request first, Firecrawl only as a fallback. Small law
// and accountancy firms — our target customers — mostly run simple sites, and a
// plain request gets their careers page in full. Firecrawl earns its cost on
// the minority that block ordinary requests or build the page with JavaScript:
// altamimi.com, a UAE firm, refuses a plain fetch outright. Keeping Firecrawl
// as the second choice rather than the default is what keeps us well inside its
// free 1,000 credits a month.
//
// This file NEVER throws, and never treats an empty page as success. A caller
// gets either a page or null, and null means one thing only: we could not read
// this page. Downstream that is a gap in our looking, never a finding about the
// company.
// ─────────────────────────────────────────────────────────────────────────────

import { providerKey } from './env'
import type { Artifact } from './types'

export const ARTIFACT_TTL_MS = 7 * 24 * 60 * 60 * 1000

const FETCH_TIMEOUT_MS = 15_000

/* Sent with the plain request. Node's default identifier is refused by a fair
   number of professional-services sites sitting behind a firewall. This is an
   ordinary browser identifier, not an attempt to get around bot detection.
   Sites that still refuse fall through to Firecrawl, or to nothing. */
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

type MemoryEntry = { artifact: Artifact; expiresAt: number }

const memory = new Map<string, MemoryEntry>()

/* Joins up requests for the same URL happening at the same moment. Two scouts
   asking for /careers at once share a single fetch, rather than both racing to
   fill the same slot. */
const inflight = new Map<string, Promise<Artifact | null>>()

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
export function clearArtifactCache(): void {
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
async function readPersisted(key: string): Promise<Artifact | null> {
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

async function writePersisted(key: string, artifact: Artifact): Promise<void> {
  if (!supabaseConfigured()) return
  try {
    const { getSupabaseAdmin } = await import('../../supabaseAdmin')
    await getSupabaseAdmin()
      .from('research_artifacts')
      .upsert(
        {
          url_key: key,
          content: artifact.content,
          fetched_at: artifact.fetchedAt,
          expires_at: new Date(
            new Date(artifact.fetchedAt).getTime() + ARTIFACT_TTL_MS,
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
  | { content: string; blocked: false }
  | { content: null; blocked: boolean }

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

async function plainFetch(url: string): Promise<PlainFetch> {
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,*/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!response.ok) {
      return { content: null, blocked: isBlockingStatus(response.status) }
    }
    const body = await response.text()
    if (body && body.trim() !== '') return { content: body, blocked: false }
    /* A success response with nothing in it is the mark of a page that builds
       itself with JavaScript — exactly what a real browser fixes. */
    return { content: null, blocked: true }
  } catch {
    /* Timeout or transport error — the page may be fine and we were not. */
    return { content: null, blocked: true }
  }
}

// -- The Firecrawl budget ----------------------------------------------------
// We are on the free plan: 1,000 credits a month and 10 page reads a minute.
// Both are shared by every report the app runs, so this file spends them rather
// than any single scout — and it spends them carefully.
//
// The rate limit here is there to stop us hitting theirs, not to react after we
// do. Staying under 10 a minute means we mostly never get refused in the first
// place. That matters, because finding the limit by being refused costs a round
// trip and a worse result every time. Being refused is never an exception here:
// we return nothing, the page is unavailable, and the scout records a gap.

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
export function firecrawlBudget(): {
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

export function resetFirecrawlBudget(): void {
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
  if (!firecrawlBudget().available) return null

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
         country. If R8 shows blocked sites losing their country because of
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

/* The one function scouts call to get a web page.
   Returns null when it fails. It never throws, and never reports an empty page
   as a success. */
export async function getArtifact(url: string): Promise<Artifact | null> {
  const key = normalizeUrl(url)
  if (!key) return null

  const cached = memory.get(key)
  if (cached) {
    if (cached.expiresAt > Date.now()) return cached.artifact
    memory.delete(key)
  }

  const pending = inflight.get(key)
  if (pending) return pending

  const work = (async (): Promise<Artifact | null> => {
    const persisted = await readPersisted(key)
    if (persisted) {
      memory.set(key, {
        artifact: persisted,
        expiresAt: new Date(persisted.fetchedAt).getTime() + ARTIFACT_TTL_MS,
      })
      return persisted
    }

    const plain = await plainFetch(key)
    const content =
      plain.content ?? (plain.blocked ? await firecrawlFetch(key) : null)
    if (!content) return null

    const artifact: Artifact = {
      content,
      fetchedAt: new Date().toISOString(),
    }
    memory.set(key, { artifact, expiresAt: Date.now() + ARTIFACT_TTL_MS })
    await writePersisted(key, artifact)
    return artifact
  })().finally(() => {
    inflight.delete(key)
  })

  inflight.set(key, work)
  return work
}
