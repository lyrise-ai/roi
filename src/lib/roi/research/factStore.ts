// ─────────────────────────────────────────────────────────────────────────────
// research/factStore — where scout results land, and what everything downstream
// reads from (LYR-187 R1 / LYR-194).
//
// It can be queried; it is not one lump of text. The whole job of the writer is
// to JOIN something the user typed to something the research found: "you
// promise 48-hour turnaround, and your last three job postings were all for
// document review." That means asking about specific facts afterwards. A
// pre-written research summary makes that join impossible, and that is exactly
// what produced the generic output last time.
//
// Results arrive one at a time. Each scout writes the moment it finishes, so
// both reading a fact and asking what we have must work while other scouts are
// still running. The side panel starts drawing S1's results after about half a
// second, while S2 is still working.
//
// One store per run, held in memory. A run is a single request, so there is no
// reason to save it, and the page cache already keeps the part worth keeping
// between runs. If a later card needs a run you can resume, that is when a
// database table earns its place.
// ─────────────────────────────────────────────────────────────────────────────

import type { ScoutId, ScoutResult, ScoutStatus } from './types'

export type FactStore = {
  put(scout: ScoutId, result: ScoutResult<unknown>): Promise<void>
  get(scout: ScoutId): Promise<ScoutResult<unknown> | null>
  all(): Promise<Partial<Record<ScoutId, ScoutResult<unknown>>>>
  coverage(): Promise<Partial<Record<ScoutId, ScoutStatus>>>
}

/* Every method waits, even though nothing in here actually does. Later cards are
   written against this shape, and if the store ever reads from somewhere slower
   than memory, none of them should have to change. */
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

    /* Deliberately incomplete: a scout that has not answered yet is simply not
       here, which is different from one that answered "nothing found". "Still
       looking" and "looked and found nothing" are different states, and the
       panel shows them differently. */
    async coverage() {
      const out: Partial<Record<ScoutId, ScoutStatus>> = {}
      for (const [scout, result] of results) out[scout] = result.status
      return out
    },
  }
}
