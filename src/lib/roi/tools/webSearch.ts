// ─────────────────────────────────────────────────────────────────────────────
// webSearch — the one place the whole app talks to a search engine.
//
// Two things here are deliberate, and neither was true before LYR-221.
//
// -- It falls back on the RESULT, not on the key -----------------------------
//
// The old version was:
//
//     if (process.env.TAVILY_API_KEY) return tavilySearch(query, maxResults)
//     if (process.env.BRAVE_API_KEY)  return braveSearch(query, maxResults)
//
// That picks an engine by which key exists, while looking like a fallback
// chain. `tavilySearch` swallowed its own errors and returned an empty list, so
// a Tavily rejection, rate limit or timeout came back as "no results" and Brave
// was never tried — even with the Brave key sitting right there. The fallback
// existed on paper and could never fire.
//
// Now we try each engine in order until one returns something, and an engine
// that fails is the signal to try the next.
//
// -- There is one chain, not two ---------------------------------------------
//
// `research/search.ts` used to keep its own private copy of the Tavily and
// Brave code, with a different timeout and a different fallback rule. Two
// copies of one thing drift apart, and these had: the research copy failed over
// correctly and this one did not. This file now owns the engines; research
// takes the result and narrows it to what it needs.
//
// Jina (`s.jina.ai`) used to be a third engine here, described as "free, no key
// needed". It has since moved behind a key and now rejects every request — 25
// domains tested, 25 rejections. It is removed rather than left sitting there
// looking like a safety net that does nothing. If we want a free last-resort
// engine again, add it to ENGINES; nothing else has to change.
//
// A caller that gets no results gets an empty list, never a made-up one. The
// old Jina error handler returned an invented "Search unavailable" row, which
// `agent.ts` then filed as a benchmarked fact with an empty URL — an unsourced
// claim walking straight into the report. That is the exact failure the
// research subsystem exists to prevent.
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

/* The research scouts have 20 seconds in total and cannot afford two 15-second
   attempts. The older ROI agent has no such limit. So each caller passes what
   it can afford, rather than everyone sharing one compromise. */
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
      /* We throw here rather than returning an empty list. A failure has to
         arrive as a failure, or the next engine is never tried. Returning empty
         is exactly the bug described at the top of this file. */
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
  /* Having no key is a miss, not an error. Every research step follows the same
     rule, and it is what lets CI and a fresh checkout run with nothing set
     up. */
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
      /* Even a clean "no results" is worth asking the next engine about. They
         disagree often enough on smaller firms that the second one earns its
         keep. */
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
