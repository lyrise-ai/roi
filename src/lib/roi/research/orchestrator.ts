// ─────────────────────────────────────────────────────────────────────────────
// orchestrator — runs the scouts and streams their results (LYR-187 R5 /
// LYR-198).
//
//   S1 alone, first          gates everything, ~500ms-1s
//        ↓ { region, vertical }
//   S2 (+ future scouts)     concurrent, Promise.allSettled
//        ↓
//   fact store               written the moment each scout resolves
//        ↓
//   aggregate                recomputed on demand, safe to read mid-run
//
// S1 must finish before the rest start because they need `region` and
// `vertical` to choose sources and vocabulary. Everything after S1 runs
// together.
//
// Three properties this file exists to guarantee:
//
//   One scout failing never takes down the others. `Promise.allSettled`, and
//   every scout additionally wrapped so a throw becomes an ERROR result rather
//   than a rejected run. A failed scout is a PARTIAL run, not a failed one.
//
//   Results stream. Each scout writes to the store as it resolves, not in a
//   batch at the end, because the scan panel renders off S1 while S2 is still
//   crawling. Batching would make the panel wait for the slowest scout and
//   defeat the whole design.
//
//   Total wall time is capped. Anything unresolved at the deadline becomes
//   ERROR with a note saying so — an honest gap, recorded, rather than a
//   request that hangs until Vercel kills the lambda.
// ─────────────────────────────────────────────────────────────────────────────

import { type Aggregate, aggregate } from './aggregate'
import { type FactStore, createFactStore } from './factStore'
import { type S1Facts, runS1 } from './scouts/s1'
import { type Region } from './scouts/s1Derive'
import { getJobPostings } from './scouts/s2'
import type { ScoutId, ScoutResult } from './types'

/* Wall-clock ceiling for the whole run. The scan panel is allowed to be
   incomplete; it is not allowed to hang. */
export const RUN_BUDGET_MS = 30_000

/* What S1 hands the scouts that follow it. */
export type ScoutContext = {
  domain: string
  region: Region
  vertical: string | null
}

type ScoutRegistration = {
  id: ScoutId
  run: (ctx: ScoutContext) => Promise<ScoutResult<unknown>>
}

/* The registry. Adding S3–S7 later is one entry each — the orchestrator does
   not know or care what a scout does, only that it returns a ScoutResult.
   Deliberately not populated with scouts that don't exist yet: an entry for
   S3 today would mean a permanent ERROR row in every run's coverage. */
const SCOUTS: ScoutRegistration[] = [
  { id: 'S2', run: (ctx) => getJobPostings(ctx.domain, ctx.region) },
]

function errorResult(
  scout: ScoutId,
  notes: string,
  durationMs: number,
): ScoutResult<unknown> {
  return {
    scout,
    status: 'ERROR',
    facts: null,
    sourcesAttempted: [],
    durationMs,
    costUsd: 0,
    notes,
  }
}

/* Resolves to an ERROR result rather than rejecting or hanging. `ms` is
   whatever remains of the run budget when the scout starts, so a slow S1
   eats into the time available to the rest instead of extending the total.

   Takes a thunk, not a promise, and that is load-bearing. A scout that throws
   synchronously — a bad argument, a destructuring error before its first
   await — never returns a promise at all, so passing `run(ctx)` directly would
   throw while the array was still being built and escape `Promise.allSettled`
   entirely, taking the whole run with it. Calling it inside here turns a sync
   throw into a rejection like any other. */
async function withDeadline(
  scout: ScoutId,
  start: () => Promise<ScoutResult<unknown>>,
  ms: number,
): Promise<ScoutResult<unknown>> {
  const startedAt = Date.now()
  let timer: ReturnType<typeof setTimeout> | undefined

  const timeout = new Promise<ScoutResult<unknown>>((resolve) => {
    timer = setTimeout(
      () =>
        resolve(
          errorResult(
            scout,
            `did not finish within the ${Math.round(ms / 1000)}s budget`,
            Date.now() - startedAt,
          ),
        ),
      Math.max(ms, 0),
    )
  })

  /* Wrapping the call in an async IIFE is what converts a synchronous throw
     into a rejected promise the catch below can see. */
  const work = (async () => start())()

  try {
    /* A scout that throws is still a scout that ran: record it as an ERROR on
       its own row so coverage stays honest and the other scouts continue. */
    return await Promise.race([
      work.catch((error) =>
        errorResult(
          scout,
          `threw: ${error?.message ?? String(error)}`,
          Date.now() - startedAt,
        ),
      ),
      timeout,
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export type ResearchRun = {
  domain: string
  store: FactStore
  /* Snapshot taken once every scout settled or the budget expired. Call
     `aggregate(await store.all())` directly for a mid-run view. */
  summary: Aggregate
  durationMs: number
}

/* Runs the whole research pass for one domain.
   Never throws. A caller gets a run whose store may be sparse and whose
   `confidenceTier` may be THIN, which is a supported and meaningful outcome —
   not an error to handle. */
export async function runResearch(
  domain: string,
  options: { store?: FactStore; budgetMs?: number } = {},
): Promise<ResearchRun> {
  const startedAt = Date.now()
  const budgetMs = options.budgetMs ?? RUN_BUDGET_MS
  /* Injectable so a caller — the scan panel's SSE handler — can hold the store
     and read from it while this promise is still pending. */
  const store = options.store ?? createFactStore()

  const remaining = () => budgetMs - (Date.now() - startedAt)

  // ── S1: alone, first, gates the rest ──────────────────────────────────────
  const s1 = await withDeadline('S1', () => runS1(domain), remaining())
  await store.put('S1', s1)

  const s1Facts = (s1.facts ?? {}) as S1Facts
  const ctx: ScoutContext = {
    domain,
    /* 'OTHER' is the documented fallback when S1 could not determine a region:
       downstream uses default routing and marks its confidence low. */
    region: (s1Facts.region?.value as Region) ?? 'OTHER',
    vertical: s1Facts.vertical?.value ?? null,
  }

  // ── Everything else: concurrent, streaming ────────────────────────────────
  /* Each scout writes to the store inside its own promise chain, so a fast
     scout is readable while a slow one is still running. `allSettled` then
     waits for all of them — but the writes have already happened. */
  await Promise.allSettled(
    SCOUTS.map((registration) =>
      withDeadline(
        registration.id,
        () => registration.run(ctx),
        remaining(),
      ).then((result) => store.put(registration.id, result)),
    ),
  )

  return {
    domain,
    store,
    summary: aggregate(await store.all()),
    durationMs: Date.now() - startedAt,
  }
}
