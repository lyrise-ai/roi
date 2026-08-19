// ─────────────────────────────────────────────────────────────────────────────
// research/env — the single place the research system reads provider keys.
//
// Every key is optional by design. A tier whose key is absent reports
// `outcome: 'miss'` in `sourcesAttempted` and hands off to the next tier, so
// the system runs, and is testable, with nothing configured. This is what
// keeps CI and a fresh clone working, and it is why adding a key later is
// config rather than code.
//
// Read .env.example for what each key buys and what still works without it.
// ─────────────────────────────────────────────────────────────────────────────

/* Apollo and Explorium are absent on purpose — we hold neither, so S1 cascades
   PDL → site. Adding one later means adding its key here and its adapter in
   scouts/s1.ts; nothing downstream of the scout changes.

   Tavily and Brave are read through the same accessor even though the older ROI
   pipeline reads them directly, so S2's discovery tier gets the same "blank is
   a supported state" behaviour as every other provider here. */
export type ProviderKey =
  | 'FIRECRAWL_API_KEY'
  | 'PDL_API_KEY'
  | 'TAVILY_API_KEY'
  | 'BRAVE_API_KEY'

/* Null, never '' — so `if (!key)` and `if (key === undefined)` behave the same
   way at every call site and a blank line in .env.local reads as "absent"
   rather than as a key that will 401. */
export function providerKey(name: ProviderKey): string | null {
  const value = process.env[name]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

export function hasProviderKey(name: ProviderKey): boolean {
  return providerKey(name) !== null
}
