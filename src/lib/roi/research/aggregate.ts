// ─────────────────────────────────────────────────────────────────────────────
// aggregate — derived facts and the confidence model (LYR-187 R5 / LYR-198).
//
// Pure functions, zero LLM, no I/O. Everything here is counting, ranking and
// set arithmetic over what the scouts returned. R4 of the parent card is blunt
// about why: a model computing a ratio is untestable and drifts between runs,
// so two reports for the same company would disagree for no reason.
//
// The important output is `confidenceTier`. It computes how much the system
// actually knows and gates how assertive a downstream writer is allowed to be.
// The previous research agent had no notion of this — it wrote confidently
// whether or not it had found anything, which is the single root cause of its
// output being untrustworthy. Making "we don't know enough to say something
// specific" a computed, enforceable state is the whole point of this file.
// ─────────────────────────────────────────────────────────────────────────────

import type { ScoutId, ScoutResult, ScoutStatus } from './types'

/* How much each scout contributes to coverage. S2 is weighted heaviest
   because a job posting is testimony — a company describing its own work in
   its own words — while everything else is inference about it.

   S3–S7 are registered here with their weights but are not built yet; a scout
   that never reports simply contributes nothing, so adding one later is a
   config change rather than a rewrite. */
export const SCOUT_WEIGHTS: Record<ScoutId, number> = {
  S1: 0.25,
  S2: 0.75,
  S3: 0,
  S4: 0,
  S5: 0,
  S6: 0,
  S7: 0,
}

/* NONE and ERROR must not score the same, and NONE must score higher.

   NONE means we looked and there is genuinely nothing — the company is not
   hiring. That is information: a writer may say so, and the interview can lean
   on it. ERROR means we failed to look, which is a blind spot a writer must
   stay silent about. Scoring them identically is what let the old system treat
   "we couldn't reach the ATS" as license to describe a hiring pattern.

   PARTIAL sits above NONE because facts we did retrieve are worth more than a
   confirmed absence, but below FULL because coverage is incomplete. */
export const STATUS_SCORES: Record<ScoutStatus, number> = {
  FULL: 1,
  PARTIAL: 0.6,
  NONE: 0.3,
  ERROR: 0,
}

export type ConfidenceTier = 'RICH' | 'MODERATE' | 'THIN'

export type Coverage = Partial<Record<ScoutId, ScoutStatus>>

/* Weighted mean over the scouts that actually reported, in 0..1. Scouts that
   never reported are excluded from the denominator rather than counted as
   zero — a run where S2 has not resolved yet is incomplete, not bad, and the
   panel reads this while scouts are still in flight. */
export function coverageScore(coverage: Coverage): number {
  let weighted = 0
  let total = 0

  for (const [scout, status] of Object.entries(coverage) as [
    ScoutId,
    ScoutStatus,
  ][]) {
    const weight = SCOUT_WEIGHTS[scout] ?? 0
    /* A zero-weight scout is one that isn't built yet — registering it must
       not move the score. */
    if (weight > 0) {
      weighted += weight * (STATUS_SCORES[status] ?? 0)
      total += weight
    }
  }

  return total === 0 ? 0 : Number((weighted / total).toFixed(4))
}

/* The gate. Conditions come straight from the card, and are expressed as
   conditions rather than as thresholds on `coverageScore` on purpose: "S2 is
   FULL and something else corroborates it" is a statement a reader can check
   against the run, where "score ≥ 0.72" is not.

     RICH     — S2 FULL, plus at least one other scout that found something.
                A writer may be specific and may quote verbatim.
     MODERATE — some scout returned facts, but S2 is thin or absent. Hedge,
                and lean on what the user said in the interview.
     THIN     — nothing usable. NO external claim at all: the reveal uses only
                the interview. This is the state the old system could not
                represent, so it never entered it.

   Note ERROR is not "thin evidence", it is no evidence: a run where every
   scout errored is THIN however many scouts ran. */
export function confidenceTier(coverage: Coverage): ConfidenceTier {
  const reported = Object.entries(coverage) as [ScoutId, ScoutStatus][]
  const found = reported.filter(
    ([, status]) => status === 'FULL' || status === 'PARTIAL',
  )

  if (found.length === 0) return 'THIN'

  const s2 = coverage.S2
  const corroborated = found.some(([scout]) => scout !== 'S2')

  if (s2 === 'FULL' && corroborated) return 'RICH'
  return 'MODERATE'
}

/* Verbs that describe moving information around rather than deciding
   anything — the work a system can take over. S2's extraction already drops
   generic filler; this is the narrower question of which surviving verbs point
   at specifically mechanical work.

   Kept as an explicit set rather than a heuristic because it is the input to a
   claim about someone's business, and a reader must be able to see exactly
   what qualified. */
const MANUAL_WORK_VERBS = new Set([
  'chase',
  'collate',
  'compile',
  'copy',
  'cross-check',
  'enter',
  'extract',
  'file',
  'follow up',
  'input',
  'key',
  'log',
  'match',
  'monitor',
  'process',
  'reconcile',
  're-enter',
  're-key',
  'rekey',
  'record',
  'retype',
  'review',
  'scan',
  'sort',
  'submit',
  'track',
  'transcribe',
  'transfer',
  'update',
  'upload',
  'verify',
])

export function manualWorkIndicators(verbs: string[]): string[] {
  if (!Array.isArray(verbs)) return []
  const out: string[] = []
  for (const raw of verbs) {
    const verb = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
    if (verb !== '' && MANUAL_WORK_VERBS.has(verb) && !out.includes(verb)) {
      out.push(verb)
    }
  }
  return out
}

export type TurnoverSignal = { role: string; count: number; months: number }

/* A turnover proxy, already counted by S2. Re-exposed here as a named derived
   fact so downstream reads one aggregate rather than reaching into a scout's
   internals, and filtered to the repeats strong enough to be worth stating. */
export function turnoverSignals(
  repeats: TurnoverSignal[] | undefined,
): TurnoverSignal[] {
  if (!Array.isArray(repeats)) return []
  return repeats.filter(
    (r) =>
      r &&
      typeof r.role === 'string' &&
      r.role !== '' &&
      typeof r.count === 'number' &&
      r.count >= 2,
  )
}

export type Aggregate = {
  coverage: Coverage
  coverageScore: number
  confidenceTier: ConfidenceTier
  turnoverSignals: TurnoverSignal[]
  manualWorkIndicators: string[]
  /* Which scouts contributed nothing and why, so a thin result is explainable
     rather than merely disappointing. */
  gaps: { scout: ScoutId; status: ScoutStatus; notes?: string }[]
}

/* Builds the aggregate from whatever the store currently holds. Safe to call
   mid-run: it describes the run as it stands, which is exactly what the scan
   panel needs while scouts are still resolving. */
export function aggregate(
  results: Partial<Record<ScoutId, ScoutResult<unknown>>>,
): Aggregate {
  const coverage: Coverage = {}
  const gaps: Aggregate['gaps'] = []

  for (const [scout, result] of Object.entries(results) as [
    ScoutId,
    ScoutResult<unknown>,
  ][]) {
    if (result) {
      coverage[scout] = result.status
      if (result.status === 'ERROR' || result.status === 'NONE') {
        gaps.push({
          scout,
          status: result.status,
          ...(result.notes ? { notes: result.notes } : {}),
        })
      }
    }
  }

  /* Reaching into S2's typed facts is deliberate and narrow: these two
     derivations are defined in terms of job postings and nothing else
     produces them. Guarded so a shape change degrades to an empty list rather
     than throwing on the report path. */
  const s2Facts = (results.S2?.facts ?? {}) as {
    topTaskVerbs?: { value?: unknown }[]
    repeatPostings?: TurnoverSignal[]
  }
  const verbs = Array.isArray(s2Facts.topTaskVerbs)
    ? s2Facts.topTaskVerbs
        .map((f) => (typeof f?.value === 'string' ? f.value : ''))
        .filter(Boolean)
    : []

  return {
    coverage,
    coverageScore: coverageScore(coverage),
    confidenceTier: confidenceTier(coverage),
    turnoverSignals: turnoverSignals(s2Facts.repeatPostings),
    manualWorkIndicators: manualWorkIndicators(verbs),
    gaps,
  }
}
