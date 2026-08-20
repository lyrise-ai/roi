// ─────────────────────────────────────────────────────────────────────────────
// research/factStore — where scout results land and what downstream consumers
// query (LYR-187 R1 / LYR-194).
//
// Queryable, not a blob. The observation generator's job is to JOIN something
// the user typed in the interview to something research found externally —
// "you promise 48-hour turnaround, and your last three postings were all for
// document review". That requires interrogating specific facts after the fact.
// A pre-baked research summary makes the join impossible and is exactly what
// produced generic output last time.
//
// Results stream. Each scout writes the moment it resolves, so `get` and
// `coverage` must both work while other scouts are still running — the scan
// panel starts rendering off S1 at ~500ms while S2 is still crawling.
//
// One store per run, in memory. A run is a single request; there is no reason
// to persist it, and the artifact cache already carries the part that is worth
// keeping between runs. If a later card needs a resumable run, that is when a
// table earns its place.
// ─────────────────────────────────────────────────────────────────────────────

import type { ScoutId, ScoutResult, ScoutStatus } from './types'

export type FactStore = {
  put(scout: ScoutId, result: ScoutResult<unknown>): Promise<void>
  get(scout: ScoutId): Promise<ScoutResult<unknown> | null>
  all(): Promise<Partial<Record<ScoutId, ScoutResult<unknown>>>>
  coverage(): Promise<Partial<Record<ScoutId, ScoutStatus>>>
}

/* Async on every method even though the implementation is synchronous. The
   interface is the contract downstream cards are written against, and a store
   that later reads from anywhere but a Map must not force them all to change. */
export function createFactStore(): FactStore {
  const results = new Map<ScoutId, ScoutResult<unknown>>()

  return {
    async put(scout, result) {
      results.set(scout, result)
    },

    async get(scout) {
      return results.get(scout) ?? null
    },

    async all() {
      return Object.fromEntries(results) as Partial<
        Record<ScoutId, ScoutResult<unknown>>
      >
    },

    /* Partial by design: a scout that has not reported yet is absent, which is
       distinct from one that reported NONE. "Still looking" and "looked, found
       nothing" are different states and the panel renders them differently. */
    async coverage() {
      const out: Partial<Record<ScoutId, ScoutStatus>> = {}
      for (const [scout, result] of results) out[scout] = result.status
      return out
    },
  }
}
