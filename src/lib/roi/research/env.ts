// ─────────────────────────────────────────────────────────────────────────────
// research/env — the one place the research system reads API keys from.
//
// Every key is optional on purpose. A step with no key records a miss and hands
// over to the next step, so the whole system runs, and can be tested, with
// nothing set up at all. That is what keeps CI and a fresh checkout working,
// and it is why adding a key later is a settings change, not a code change.
//
// See .env.example for what each key buys, and what still works without it.
// ─────────────────────────────────────────────────────────────────────────────

/* Apollo and Explorium are missing on purpose: we have accounts with neither,
   so S1 tries PDL and then the company's own site. Adding one later means
   adding its key here and its adapter in scouts/s1.ts. Nothing after the scout
   changes.

   The two search keys are read through here by `tools/webSearch`, which since
   LYR-221 is the only place either is read. The research path and the older ROI
   agent now share one search chain instead of keeping a copy each, so both get
   the same "no key is fine" behaviour. */
export type ProviderKey =
  | 'FIRECRAWL_API_KEY'
  | 'PDL_API_KEY'
  | 'TAVILY_API_KEY'
  | 'BRAVE_API_KEY'

/* Returns nothing rather than an empty string, so every caller can check it the
   same way, and a blank line in .env.local reads as "no key" instead of as a
   key that will be rejected. */
export function providerKey(name: ProviderKey): string | null {
  const value = process.env[name]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

export function hasProviderKey(name: ProviderKey): boolean {
  return providerKey(name) !== null
}
