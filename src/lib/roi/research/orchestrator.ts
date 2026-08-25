// ─────────────────────────────────────────────────────────────────────────────
// orchestrator — runs the scouts and passes their results out as they arrive
// (LYR-187 R5 / LYR-198).
//
//   S1 runs first, on its own (about 1s)   everything else waits on it
//        v  region and business type
//   S2 runs                                 we wait for all of them to
//        v                                  settle, and never let one
//                                           failure abort the rest
//   each result is stored the moment it lands
//        v
//   we summarise once everything has settled
//
// S1 has to finish before S2 starts, because S2's later steps pick where to
// look based on the region. The POC covers S1 and S2 only; S3 moved out to
// LYR-197. The list below is what makes adding S3 to S7 a config change rather
// than a rewrite — but it does not pretend to run scouts that do not exist yet.
//
// Two things the side panel depends on:
//
//   Results arrive one at a time. Each scout writes its result the moment it
//   finishes, so the panel can show S1's company details while S2 is still
//   working. Never collect them and write at the end — that turns a panel that
//   fills up into a spinner.
//
//   A slow scout costs one row, never the panel. Everything is wrapped so that
//   a scout which throws, hangs or runs out of time becomes an error result
//   next to its siblings, rather than an exception that kills the run.
// ─────────────────────────────────────────────────────────────────────────────

import { type ResearchSummary, summarize } from './aggregate'
import { type FactStore, createFactStore } from './factStore'
import { runS1 } from './scouts/s1'
import { getJobPostings } from './scouts/s2'
import type { Region } from './scouts/s1Derive'
import type { ScoutId, ScoutResult } from './types'

/* The worst case for a whole run. It is deliberately the SUM of the per-scout
   limits below, not a shared countdown they race each other for. A scout that
   passes its own limit becomes an error with a note, so a stuck scout costs one
   row rather than the run. The questions this sits behind take minutes;
   nothing here should ever get near 30 seconds. */
export const RUN_BUDGET_MS = 30_000

/* A time limit per scout, deliberately NOT one shared countdown.

   The first version gave S1 the whole budget and handed S2 whatever was left,
   with a floor of 1 second. So when S1 hung for the full 30 seconds, S2 started
   with 1 second, timed out at once and reported an error — and the company was
   scored thin because BOTH scouts had failed, when really only one had.
   `stalawfirm.com` in the 25-domain coverage run is exactly this:

     gaps: [ { S1, 'exceeded 30000ms budget' },
             { S2, 'exceeded 1000ms budget'  } ]

   S2's failure there was entirely caused by our own scheduling. And thin is the
   level that tells the writer to say nothing at all. We were staying quiet
   about a company we could have spoken about.

   S1 aims for about a second and almost always finishes well under five, so ten
   is generous. S2 legitimately takes longer: it searches, fetches several
   pages, then reads each one. The two add up to the whole-run limit on
   purpose. */
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

/* Wraps a scout so no kind of failure can escape. A thrown error, a hang, or a
   scout that answers after its time is up all become an error result. An error,
   never "nothing found" — we failed to look; we did not establish that there
   was nothing there. */
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
  /* Called the moment a scout finishes, long before the run is over. This is
     what the side panel fills itself from. Waiting for the final return value
     would defeat the whole point. */
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
      /* If the caller's own callback throws, that is the caller's problem, not
         a reason to fail the research run. */
    }
  }

  /* S1 on its own, first. Every later scout picks where to look based on the
     region, so starting them alongside S1 would mean choosing sources before we
     know the region. */
  const s1 = await settle('S1', runS1(domain), Math.min(S1_BUDGET_MS, budgetMs))
  await land(s1)

  const s1Facts = s1.facts as {
    region?: { value?: Region }
    vertical?: { value?: string }
    name?: { value?: string }
    canonicalDomain?: { value?: string }
  } | null
  const region = s1Facts?.region?.value
  /* When S1 worked out the type of business, S2's search uses it. "Legal" and
     "accounting" bring back very different results. */
  const vertical = s1Facts?.vertical?.value
  /* The firm's name as the firm writes it, and any other domain it says is
     the same as its own. Both are optional, and without them S2 falls back to
     how it used to work. But they are the difference between searching for
     "gowlingwlg" and "Gowling WLG", and between keeping and throwing away the
     real careers page of a firm that redirects to a different domain
     (LYR-221). */
  const companyName = s1Facts?.name?.value
  const canonicalDomain = s1Facts?.canonicalDomain?.value

  /* S2's time limit is its own, not what is left over from a shared countdown.
     Nothing S1 did can shrink it, which is the whole point: a scout that runs
     out of time now costs its own row and nothing else. It is still cut down if
     the caller asked for an unusually short run, so "make it fast" still
     works. */
  const s2Budget = Math.min(S2_BUDGET_MS, budgetMs)

  /* We wait for every scout to settle, and never abort on the first failure.
     With one scout in the POC you cannot see the difference. With S3 to S7 it
     is the difference between one provider being down costing a row, and it
     killing the whole run. The shape is here so that adding a scout means
     adding to this list. */
  const rest = await Promise.allSettled([
    settle(
      'S2',
      getJobPostings(domain, region, vertical, companyName, canonicalDomain),
      s2Budget,
    ),
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
