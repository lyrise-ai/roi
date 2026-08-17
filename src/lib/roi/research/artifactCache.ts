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
    return { content: data.content, fetchedAt: data.fetched_at }
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

/* Tier 1. Returns null on a non-2xx, a timeout, a network error, or an empty
   body — all of which mean "try Firecrawl", not "the page is empty". */
async function plainFetch(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,*/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!response.ok) return null
    const body = await response.text()
    return body && body.trim() !== '' ? body : null
  } catch {
    return null
  }
}

/* Tier 2. No key configured is a normal, supported state — it returns null and
   the artifact is simply unavailable, which is the honest answer. */
async function firecrawlFetch(url: string): Promise<string | null> {
  const key = providerKey('FIRECRAWL_API_KEY')
  if (!key) return null
  try {
    const response = await fetch('https://api.firecrawl.dev/v2/scrape', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ url, formats: ['markdown'] }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS * 2),
    })
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

    const content = (await plainFetch(key)) ?? (await firecrawlFetch(key))
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
