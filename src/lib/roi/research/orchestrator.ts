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

/* Total wall-clock ceiling. Anything unresolved past this becomes ERROR with a
   note, so a hung scout costs one row rather than the whole run. The interview
   it runs behind lasts minutes, but nothing here should ever take 30s — that
   is a backstop, not a budget. */
export const RUN_BUDGET_MS = 30_000

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
  const s1 = await settle('S1', runS1(domain), budgetMs)
  await land(s1)

  const region = (s1.facts as { region?: { value?: Region } } | null)?.region
    ?.value

  const remaining = Math.max(1_000, budgetMs - (Date.now() - startedAt))

  /* allSettled, never all. With one scout in the POC the difference is
     invisible; with S3–S7 it is the difference between one provider outage
     degrading a row and taking down the run. The shape is here so adding a
     scout is appending to this array. */
  const rest = await Promise.allSettled([
    settle('S2', getJobPostings(domain, region), remaining),
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
