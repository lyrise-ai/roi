// ─────────────────────────────────────────────────────────────────────────────
// fetchPage — downloads a page and gives back clean text, using Jina Reader.
// Free, needs no API key, works on any public page.
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchPage(url: string): Promise<string> {
  // Add https:// on the front if we were given a bare domain
  const target = url.startsWith('http') ? url : `https://${url}`
  const jinaUrl = `https://r.jina.ai/${target}`

  try {
    const res = await fetch(jinaUrl, {
      headers: { Accept: 'text/plain' },
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      return `[fetchPage: HTTP ${res.status} for ${target}]`
    }

    const text = await res.text()
    // Cut it to about 8,000 characters so we do not overload the model
    return text.slice(0, 8000)
  } catch (err) {
    return `[fetchPage: failed to fetch ${target} — ${(err as Error).message}]`
  }
}
