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

export type ProviderKey =
  | 'FIRECRAWL_API_KEY'
  | 'PDL_API_KEY'
  | 'APOLLO_API_KEY'
  | 'EXPLORIUM_API_KEY'

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
