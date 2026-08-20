// ─────────────────────────────────────────────────────────────────────────────
// research/artifactCache — the only thing in the research system that touches
// the network for page content (LYR-187 R1 / LYR-194).
//
// Scouts request artifacts, they do not fetch. The careers page is wanted by
// the job-postings scout, the services scout and the tech scout; without a
// shared cache that is three round trips for identical bytes. It also means a
// second Profit Map for the same company is nearly free.
//
// Two layers, deliberately:
//   memory   — one lambda invocation. Collapses the fan-out inside a single
//              run, where several scouts ask for the same URL at once.
//   Supabase — across invocations. Vercel lambdas are ephemeral, so the memory
//              layer alone would buy nothing on a repeat visit; this is the
//              layer that actually makes the second run cheap.
// Supabase is best-effort. If it is unreachable or unconfigured the cache
// degrades to memory-only rather than failing the run, which is also how a
// bare `node --test` process (no Supabase env) behaves.
//
// Fetch strategy — plain fetch first, Firecrawl only as a fallback. Small law
// and accountancy firms, which is the ICP, mostly run static sites: a plain
// request returns their careers page in full. Firecrawl earns its call on the
// minority that block a normal request or render with JS — altamimi.com, a UAE
// firm, 403s a plain fetch. Using it as tier 2 rather than the default is what
// keeps the free 1k credits/month far ahead of POC volume.
//
// NEVER throws, and never returns '' as success. A caller gets an Artifact or
// null, and null unambiguously means "we could not read this page" — which
// downstream is an ERROR (a gap), never a NONE (a finding).
// ─────────────────────────────────────────────────────────────────────────────

import { providerKey } from './env'
import type { Artifact } from './types'

export const ARTIFACT_TTL_MS = 7 * 24 * 60 * 60 * 1000

const FETCH_TIMEOUT_MS = 15_000

/* Sent on the plain-fetch tier. A default Node user-agent is refused by a
   noticeable share of professional-services sites sitting behind WAFs; this is
   an ordinary browser string, not an attempt to defeat bot detection. Sites
   that still refuse fall through to Firecrawl or to null. */
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

type MemoryEntry = { artifact: Artifact; expiresAt: number }

const memory = new Map<string, MemoryEntry>()

/* Collapses concurrent requests for the same URL within one invocation. Two
   scouts asking for /careers at the same moment share one fetch instead of
   racing to fill the same cache slot. */
const inflight = new Map<string, Promise<Artifact | null>>()

/* Cache key. Two spellings of the same page must not become two fetches and
   two rows, so host case, the fragment, a trailing slash and the tracking
   params that get pasted in from analytics links are all normalised away.
   Returns null for anything that isn't an http(s) URL. */
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

/* Clears the in-process layer. For tests and for `npm run dev`, where a stale
   page otherwise survives a hot reload. Does not touch Supabase. */
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

/* Both Supabase helpers swallow everything. The persistent layer is an
   optimisation; a cache miss caused by a database problem is a slower run, not
   a failed one, and must never surface as a scout ERROR. */
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
    /* Postgres renders a timestamptz as "+00:00" where toISOString() renders
       "Z". Both are valid ISO 8601 and the same instant, but this value becomes
       Provenance.retrievedAt and gets displayed, so a cache hit and a fresh
       fetch must not look different to anything downstream. */
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

/* Tier 1, and the tier that decides whether tier 2 is even worth paying for.
   "We were refused" and "there is no such page" look identical if you only
   return null, and conflating them is expensive in both directions: escalating
   a clean 404 to Firecrawl spends a credit to be told again that the page
   doesn't exist, and it spends the wall time too. S2 probes five candidate
   careers paths per company, most of which legitimately 404, so this is the
   difference between one credit and five. */
type PlainFetch =
  | { content: string; blocked: false }
  | { content: null; blocked: boolean }

/* A refusal, not an answer: auth walls, bot blocks, rate limits and server
   faults are all states where the page probably exists and a headless browser
   may well get it. 404 and 410 are answers, and Firecrawl cannot improve on
   them. */
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
    /* 200 with nothing in it is the signature of a JS-rendered shell, which is
       precisely what a headless browser fixes. */
    return { content: null, blocked: true }
  } catch {
    /* Timeout or transport error — the page may be fine and we were not. */
    return { content: null, blocked: true }
  }
}

// ── Firecrawl budget ─────────────────────────────────────────────────────────
// We are on the free tier: 1,000 credits a month and 10 scrapes a minute. Both
// are shared across every Profit Map the app runs, so the cache spends them
// rather than any one scout — and it spends them defensively.
//
// The throttle is preventative, not reactive. Staying under 10/min means we
// mostly never see a 429 in the first place, which matters because the
// alternative — discovering the limit by being refused — costs a round trip
// and a degraded row every time. A blocked scrape is never an exception: it
// returns null, the artifact is unavailable, and downstream records a gap.

const FIRECRAWL_MAX_PER_MINUTE = 10
const FIRECRAWL_WINDOW_MS = 60_000

/* Out of credits is a billing state, not a transient one — retrying every
   request for the rest of the month would burn latency for a guaranteed 402.
   An hour's cooldown means a warm lambda notices a top-up or the monthly reset
   without us tracking either. */
const FIRECRAWL_QUOTA_COOLDOWN_MS = 60 * 60 * 1000

/* Timestamps of recent calls, pruned to the rolling window. */
let firecrawlCalls: number[] = []
let firecrawlDisabledUntil = 0
let firecrawlDisabledReason: string | null = null

/* For the coverage test and for logging: it matters whether a thin result came
   from a company with nothing to find or from us running out of credits
   halfway through the run. Distinguishing those is the whole point of R5 of
   the parent card — coverage is declared, never hidden. */
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

/* Tier 2. No key configured is a normal, supported state — it returns null and
   the artifact is simply unavailable, which is the honest answer. So is being
   out of budget: we decline to call rather than spending a request to be told
   no. */
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
      /* Markdown, not rawHtml. Firecrawl bills one credit either way — verified
         against /v2/team/credit-usage — and rawHtml carries strictly more
         signal, notably the schema.org markup S1 reads for `addressCountry`.
         Markdown still wins on size: 25KB against 546KB for the same page, and
         every consumer of this content either strips tags or feeds it to an
         extraction model that charges by the token.
         ponytail: the Firecrawl path therefore has no structured-data signal,
         so a blocked site on a generic TLD falls back to footer prose for its
         country. Switch to ['markdown','rawHtml'] and prefer rawHtml if R8
         shows blocked sites losing country resolution because of it. */
      body: JSON.stringify({ url, formats: ['markdown'] }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS * 2),
    })

    if (response.status === 402) {
      disableFirecrawl(FIRECRAWL_QUOTA_COOLDOWN_MS, 'out of credits (402)')
      return null
    }

    if (response.status === 429) {
      /* Honour Retry-After when Firecrawl sends one; it also returns 429 for
         concurrent-browser limits, which clear faster than the per-minute
         quota. We never sleep and retry inside the request — a scout waiting
         30s to fill one row is worse than the row being absent — so this only
         parks the tier and lets the run continue. */
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

/* The scouts' single entry point for page content.
   Returns null on failure — never throws, never reports '' as a success. */
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
