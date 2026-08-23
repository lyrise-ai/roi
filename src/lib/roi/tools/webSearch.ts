// ─────────────────────────────────────────────────────────────────────────────
// webSearch — the single web-search provider layer for the whole app.
//
// Two things about this file are deliberate and were not true before LYR-221.
//
// ── It fails over on the RESULT, not on the key ──────────────────────────────
//
// The previous version read:
//
//     if (process.env.TAVILY_API_KEY) return tavilySearch(query, maxResults)
//     if (process.env.BRAVE_API_KEY)  return braveSearch(query, maxResults)
//
// which is key-presence ROUTING wearing a cascade's clothes. `tavilySearch`
// swallows its own errors and returns an empty result set, so a Tavily 401,
// 429 or timeout returned "no results" and Brave was never tried — even with
// the Brave key sitting right there in the environment. The fallback existed
// on paper and could not fire. Engines are now tried in order until one
// returns something, and an engine that throws is the next engine's cue.
//
// ── There is one cascade, not two ────────────────────────────────────────────
//
// `research/search.ts` used to carry its own private copy of the Tavily and
// Brave adapters with a different timeout and a different failover rule. Two
// implementations of one thing drift, and they had: the research copy fell
// over correctly and this one didn't. This module owns the providers; research
// adapts the result down to its own narrower shape.
//
// Jina (`s.jina.ai`) was a third tier here, documented as "free, no key
// needed". It has since moved behind an API key and returns 401 to every
// request — measured across 25 domains, 25 401s. It is removed rather than
// left in place looking like a safety net that is really a no-op. If a free
// last-resort tier is wanted again, add it here as an ENGINES entry; nothing
// else has to change.
//
// A caller that gets no results gets an empty list, never a synthetic one. The
// old Jina catch block returned a fabricated "Search unavailable" row, which
// `agent.ts` then wrote into the evidence store as a `benchmarked` fact with
// an empty URL — an unsourced claim entering the report path, which is the
// exact failure the research subsystem exists to prevent.
// ─────────────────────────────────────────────────────────────────────────────

import { roiLog } from '@/src/lib/roi/debug'
import { type ProviderKey, providerKey } from '@/src/lib/roi/research/env'

export interface SearchResult {
  title: string
  url: string
  content: string
}

export interface SearchResponse {
  answer: string | null
  results: SearchResult[]
}

const EMPTY: SearchResponse = { answer: null, results: [] }

/* The research scouts run inside a 20s budget and cannot afford two 15s
   engine attempts; the older ROI agent has no such ceiling. Callers pass what
   they can afford rather than sharing one compromise value. */
export const DEFAULT_TIMEOUT_MS = 15_000

type Engine = {
  name: string
  requiresKey: ProviderKey
  run: (
    query: string,
    maxResults: number,
    key: string,
    timeoutMs: number,
  ) => Promise<SearchResponse>
}

// ── Tavily ────────────────────────────────────────────────────────────────────

const tavily: Engine = {
  name: 'tavily',
  requiresKey: 'TAVILY_API_KEY',
  run: async (query, maxResults, key, timeoutMs) => {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        query,
        search_depth: 'basic',
        max_results: maxResults,
        include_answer: true,
        include_raw_content: false,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) {
      /* Thrown, not returned as empty: an upstream failure must reach the
         cascade as a failure so the next engine is tried. Returning EMPTY here
         is precisely the bug described in the header. */
      throw new Error(`tavily HTTP ${res.status}`)
    }
    const data = await res.json()
    return {
      answer: data.answer ?? null,
      results: (data.results ?? [])
        .slice(0, maxResults)
        .map((r: { title?: string; url?: string; content?: string }) => ({
          title: r.title ?? '',
          url: r.url ?? '',
          content: (r.content ?? '').slice(0, 600),
        })),
    }
  },
}

// ── Brave Search ──────────────────────────────────────────────────────────────

const brave: Engine = {
  name: 'brave',
  requiresKey: 'BRAVE_API_KEY',
  run: async (query, maxResults, key, timeoutMs) => {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(
      query,
    )}&count=${maxResults}`
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': key,
      },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) throw new Error(`brave HTTP ${res.status}`)
    const data = await res.json()
    const items: Array<{
      title?: string
      url?: string
      description?: string
      extra_snippets?: string[]
    }> = data.web?.results ?? []
    return {
      answer: (data.infobox?.description as string | undefined) ?? null,
      results: items.slice(0, maxResults).map((r) => ({
        title: r.title ?? '',
        url: r.url ?? '',
        content: (r.description ?? r.extra_snippets?.[0] ?? '').slice(0, 600),
      })),
    }
  },
}

/* Order is quality-first, and adding a tier means adding an entry here. */
const ENGINES: Engine[] = [tavily, brave]

// ── Main export ───────────────────────────────────────────────────────────────

export async function webSearch(
  query: string,
  maxResults = 3,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<SearchResponse> {
  /* No key is a miss, not an error — the same rule every research tier
     follows, and what keeps CI and a fresh clone working unconfigured. */
  const available = ENGINES.map((engine) => ({
    engine,
    key: providerKey(engine.requiresKey),
  })).filter((entry) => entry.key !== null)

  for (const { engine, key } of available) {
    try {
      const response = await engine.run(query, maxResults, key, timeoutMs)
      if (response.results.length > 0) {
        roiLog(
          'tool:web_search',
          `${engine.name} query="${query.slice(0, 120)}" → ${
            response.results.length
          } results answer=${response.answer ? 'yes' : 'no'} firstUrl=${
            response.results[0]?.url ?? 'none'
          }`,
        )
        return response
      }
      /* A clean empty result is still a reason to ask the next engine: the
         engines disagree often enough on long-tail firms that the second one
         earns its place. */
      roiLog(
        'tool:web_search',
        `${engine.name} returned 0 results for query="${query.slice(0, 120)}" — trying next engine`,
      )
    } catch (err) {
      console.warn(
        `[ROI:webSearch:${engine.name}] ${(err as Error)?.message ?? err} for query="${query.slice(0, 120)}"`,
      )
    }
  }

  roiLog(
    'tool:web_search',
    `no engine produced results for query="${query.slice(0, 120)}"`,
  )
  return EMPTY
}
