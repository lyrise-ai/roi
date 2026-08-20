// ─────────────────────────────────────────────────────────────────────────────
// orchestrator — runs the scouts and streams their results (LYR-187 R5 /
// LYR-198).
//
//   S1 runs alone and first (~1s)   gates everything
//        ↓ {region, vertical}
//   S2 runs                          Promise.allSettled, never Promise.all
//        ↓
//   results stream into the fact store as each resolves
//        ↓
//   aggregation once everything settles
//
// S1 must finish before S2 dispatches because S2's later tiers pick sources by
// region. Scope is S1 + S2 for the POC; S3 moved out (LYR-197). The registry
// below is what makes adding S3–S7 a config change rather than a rewrite, but
// it deliberately does not pretend to orchestrate scouts that do not exist.
//
// Two properties the scan panel depends on:
//
//   Results stream. Each scout writes to the store the moment it resolves, so
//   the panel can render S1's firmographics while S2 is still crawling. Do not
//   batch and write at the end — that turns a progressive panel into a spinner.
//
//   A slow scout degrades one row, never the panel. Everything is wrapped so
//   that a scout which throws, hangs or times out becomes an ERROR result
//   alongside its siblings rather than an exception that takes down the run.
// ─────────────────────────────────────────────────────────────────────────────

import { type ResearchSummary, summarize } from './aggregate'
import { type FactStore, createFactStore } from './factStore'
import { runS1 } from './scouts/s1'
import { getJobPostings } from './scouts/s2'
import type { Region } from './scouts/s1Derive'
import type { ScoutId, ScoutResult } from './types'

/* Worst-case wall clock for a whole run, and deliberately the SUM of the
   per-scout budgets below rather than a separate countdown they share. Anything
   unresolved past its own budget becomes ERROR with a note, so a hung scout
   costs one row rather than the run. The interview this sits behind lasts
   minutes; nothing here should ever approach 30s. */
export const RUN_BUDGET_MS = 30_000

/* Per-scout budgets, deliberately NOT a shared countdown.

   The first version handed S1 the whole run budget and gave S2 whatever was
   left, floored at 1s. When S1 hung for the full 30s, S2 was dispatched with
   1s, timed out instantly and reported ERROR — so the company scored THIN
   because *both* scouts failed, when only one had. `stalawfirm.com` in the
   25-domain coverage run is exactly this:

     gaps: [ { S1, 'exceeded 30000ms budget' },
             { S2, 'exceeded 1000ms budget'  } ]

   S2's failure there was entirely an artifact of our own scheduling, and THIN
   is the tier that tells the observation generator to say nothing at all. We
   were staying silent about a company we could have spoken about.

   S1's own target is ~1s and its observed p90 is well under 5s, so 10s is
   generous. S2 legitimately takes longer — it searches, then fetches several
   pages, then extracts each one. The two sum to RUN_BUDGET_MS by design. */
export const S1_BUDGET_MS = 10_000
export const S2_BUDGET_MS = 20_000

const EMPTY_RESULT = (scout: ScoutId, notes: string): ScoutResult<null> => ({
  scout,
  status: 'ERROR',
  facts: null,
  sourcesAttempted: [],
  durationMs: 0,
  costUsd: 0,
  notes,
})

/* Wraps a scout so no failure mode can escape: a rejection, a hang, or a
   scout that resolves after the deadline all become an ERROR result. ERROR and
   not NONE — we failed to look, we did not establish there was nothing. */
async function settle<T>(
  scout: ScoutId,
  work: Promise<ScoutResult<T>>,
  budgetMs: number,
): Promise<ScoutResult<T | null>> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const startedAt = Date.now()

  const timeout = new Promise<ScoutResult<null>>((resolve) => {
    timer = setTimeout(
      () =>
        resolve({
          ...EMPTY_RESULT(scout, `exceeded ${budgetMs}ms budget`),
          durationMs: Date.now() - startedAt,
        }),
      budgetMs,
    )
  })

  try {
    return await Promise.race([work, timeout])
  } catch (error) {
    return {
      ...EMPTY_RESULT(scout, (error as Error)?.message ?? 'scout threw'),
      durationMs: Date.now() - startedAt,
    }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export type ResearchRun = {
  domain: string
  store: FactStore
  summary: ResearchSummary
  durationMs: number
}

export type RunOptions = {
  /* Called the moment a scout lands, before the run finishes. This is the hook
     the scan panel streams from — waiting for the return value would defeat
     the point. */
  onScoutResolved?: (result: ScoutResult<unknown>) => void
  budgetMs?: number
  store?: FactStore
}

export async function runResearch(
  domain: string,
  options: RunOptions = {},
): Promise<ResearchRun> {
  const startedAt = Date.now()
  const budgetMs = options.budgetMs ?? RUN_BUDGET_MS
  const store = options.store ?? createFactStore()

  const land = async (result: ScoutResult<unknown>) => {
    await store.put(result.scout, result)
    try {
      options.onScoutResolved?.(result)
    } catch {
      /* A consumer's callback throwing is the consumer's problem, not a reason
         to fail the research run. */
    }
  }

  /* S1 alone and first. Every later scout picks sources by region, so
     dispatching them in parallel with S1 would mean routing on a region we do
     not have yet. */
  const s1 = await settle('S1', runS1(domain), Math.min(S1_BUDGET_MS, budgetMs))
  await land(s1)

  const s1Facts = s1.facts as {
    region?: { value?: Region }
    vertical?: { value?: string }
  } | null
  const region = s1Facts?.region?.value
  /* S2's discovery tier shapes its query with the vertical when S1 resolved
     one — "legal" and "accounting" pull very different results. */
  const vertical = s1Facts?.vertical?.value

  /* S2's budget is its own, not the remainder of a shared countdown. Nothing
     S1 did can shrink it, which is the whole point — a scout that blows its
     budget now costs its own row and nothing else. It is still scaled down by
     an unusually small `budgetMs` so a caller asking for a fast run gets one. */
  const s2Budget = Math.min(S2_BUDGET_MS, budgetMs)

  /* allSettled, never all. With one scout in the POC the difference is
     invisible; with S3–S7 it is the difference between one provider outage
     degrading a row and taking down the run. The shape is here so adding a
     scout is appending to this array. */
  const rest = await Promise.allSettled([
    settle('S2', getJobPostings(domain, region, vertical), s2Budget),
  ])

  for (const outcome of rest) {
    if (outcome.status === 'fulfilled') {
      await land(outcome.value)
    }
  }

  const all = await store.all()

  return {
    domain,
    store,
    summary: summarize(all),
    durationMs: Date.now() - startedAt,
  }
}
