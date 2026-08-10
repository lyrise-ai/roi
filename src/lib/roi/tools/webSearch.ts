// ─────────────────────────────────────────────────────────────────────────────
// webSearch — searches the web for company intelligence
//
// Priority (use whichever API key is set):
//   1. Tavily    (TAVILY_API_KEY)    — best quality, 1 000 free/month
//   2. Brave     (BRAVE_API_KEY)     — excellent quality, 2 000 free/month
//   3. Jina      (no key needed)     — free, last resort
// ─────────────────────────────────────────────────────────────────────────────

import { roiLog } from '@/src/lib/roi/debug'

export interface SearchResult {
  title: string
  url: string
  content: string
}

export interface SearchResponse {
  answer: string | null
  results: SearchResult[]
}

// ── Tavily ────────────────────────────────────────────────────────────────────

async function tavilySearch(
  query: string,
  maxResults: number,
): Promise<SearchResponse> {
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        search_depth: 'basic',
        max_results: Math.min(maxResults, 5),
        include_answer: true,
        include_raw_content: false,
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      // Sanity log: surface non-2xx responses (rate-limit, auth, etc.) so we can
      // tell empty-result runs apart from upstream API failures.
      let bodyPreview = ''
      try {
        bodyPreview = (await res.text()).slice(0, 300)
      } catch {
        // ignore
      }
      console.warn(
        `[ROI:webSearch:tavily] HTTP ${res.status} for query="${query.slice(
          0,
          120,
        )}" body=${bodyPreview}`,
      )
      return { answer: null, results: [] }
    }
    const data = await res.json()
    // Sanity log: dump Tavily's raw response shape so we can distinguish
    // "Tavily returned []" from "downstream filtering dropped results".
    // Via roiLog so it honours ROI_DEBUG instead of shouting in production.
    roiLog(
      'tool:web_search',
      `tavily query="${query.slice(0, 120)}" → raw_results=${
        (data.results ?? []).length
      } answer=${data.answer ? 'yes' : 'no'} firstUrl=${
        data.results?.[0]?.url ?? 'none'
      }`,
    )
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
  } catch (err) {
    console.warn(
      `[ROI:webSearch:tavily] exception for query="${query.slice(0, 120)}": ${
        (err as Error)?.message ?? err
      }`,
    )
    return { answer: null, results: [] }
  }
}

// ── Brave Search ──────────────────────────────────────────────────────────────

async function braveSearch(
  query: string,
  maxResults: number,
): Promise<SearchResponse> {
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(
      query,
    )}&count=${Math.min(maxResults, 5)}`
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': process.env.BRAVE_API_KEY!,
      },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return { answer: null, results: [] }
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
  } catch {
    return { answer: null, results: [] }
  }
}

// ── Jina Search (free, no key) ────────────────────────────────────────────────

async function jinaSearch(
  query: string,
  maxResults: number,
): Promise<SearchResponse> {
  try {
    const res = await fetch(`https://s.jina.ai/${encodeURIComponent(query)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) return { answer: null, results: [] }
    const data = await res.json()
    const items: Array<{
      title?: string
      url?: string
      description?: string
      content?: string
    }> = data.data ?? []
    return {
      answer: null,
      results: items.slice(0, maxResults).map((r) => ({
        title: r.title ?? '',
        url: r.url ?? '',
        content: (r.description ?? r.content ?? '').slice(0, 600),
      })),
    }
  } catch {
    // Return a graceful no-results so the agent can still run on questionnaire data alone
    return {
      answer: null,
      results: [
        {
          title: 'Search unavailable',
          url: '',
          content:
            'Web search is currently unavailable. Proceed with questionnaire data and industry benchmarks.',
        },
      ],
    }
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function webSearch(
  query: string,
  maxResults = 3,
): Promise<SearchResponse> {
  if (process.env.TAVILY_API_KEY) return tavilySearch(query, maxResults)
  if (process.env.BRAVE_API_KEY) return braveSearch(query, maxResults)
  return jinaSearch(query, maxResults)
}
