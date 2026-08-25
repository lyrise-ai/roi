// ─────────────────────────────────────────────────────────────────────────────
// aggregate — works out how much we actually know (LYR-187 R5 / LYR-198).
//
// Plain functions. No model calls, no network. Everything here just counts what
// each scout came back with. R4 of the parent card says plainly that a model
// must never work out a ratio: you cannot test it, and it changes between runs,
// so two reports for the same company would disagree for no reason.
//
// What this file deliberately no longer does is judge WORDS. It used to keep a
// list of verbs that supposedly meant manual work and compare it against the
// verbs in the job postings. That was the wrong tool for the question: "review"
// is document review at a law firm and performance review at a consultancy, and
// a verb pulled out of its posting cannot carry that difference. That judgement
// now belongs to `researchAnalyst.ts`, which reads the postings themselves
// (LYR-216).
//
// The confidence level below is still worked out here and still useful, but it
// is now EVIDENCE WE HAND TO THE ANALYST rather than the final answer. The
// analyst can see what the scouts actually returned and may disagree with what
// the counts suggest.
//
// That confidence level is the most important thing this file produces, and
// arguably the most important thing in the whole subsystem. The old system had
// no idea how much it knew, so it wrote with the same confidence whether it had
// found three dated job postings or nothing at all. This turns "we do not know
// enough to say anything specific" into a state we can calculate and
// enforce.
// ─────────────────────────────────────────────────────────────────────────────

import type { ScoutId, ScoutResult, ScoutStatus } from './types'

export type ConfidenceTier = 'RICH' | 'MODERATE' | 'THIN'

/* S2 counts for the most, because job postings are the company describing its
   own work, with a date on it, in words we can quote. Everything else is us
   working things out. A run with only S2 knows more worth saying than a run
   with everything except S2. */
const SCOUT_WEIGHTS: Partial<Record<ScoutId, number>> = {
  S1: 1,
  S2: 3,
  S3: 1.5,
}

/* "Nothing found" and "error" must score differently, and "nothing found" must
   score above zero.

   "Nothing found" means we established the company is not hiring. That is real
   information the report can use: "they are not hiring right now, so this is
   about the team they already have." An error means we could not look at all,
   which supports no sentence whatsoever. Scoring the two the same is how the
   old system lost the difference and started inventing things.

   "Nothing found" deliberately scores lower than a full result. Knowing there
   is nothing is useful, but it gives a writer far less to work with than three
   dated job postings. */
const STATUS_SCORES: Record<ScoutStatus, number> = {
  FULL: 1,
  PARTIAL: 0.6,
  NONE: 0.35,
  ERROR: 0,
}

export type Coverage = Partial<Record<ScoutId, ScoutStatus>>

/* A score from 0 to 1, weighted per scout. Only scouts that actually ran are
   counted, so adding S3 later does not make every past run look worse than it
   was. */
export function coverageScore(coverage: Coverage): number {
  const entries = Object.entries(coverage) as [ScoutId, ScoutStatus][]
  if (entries.length === 0) return 0

  let earned = 0
  let possible = 0
  for (const [scout, status] of entries) {
    const weight = SCOUT_WEIGHTS[scout] ?? 1
    possible += weight
    earned += weight * (STATUS_SCORES[status] ?? 0)
  }
  return possible === 0 ? 0 : Number((earned / possible).toFixed(4))
}

/* Decides how boldly the report is allowed to speak:
     rich     — may be specific, and may quote a source word for word
     moderate — hedges, and leans on what the user told us
     thin     — makes no claim about the company at all

   This deliberately depends on what S2 found, not on the score alone. A high
   score built entirely from company details still cannot support a specific
   observation, because "you are a 30-person law firm in Dubai" is not a
   sentence that makes anyone feel understood. Rich needs the company's own
   words. */
export function confidenceTier(
  coverage: Coverage,
  score = coverageScore(coverage),
): ConfidenceTier {
  const others = (Object.entries(coverage) as [ScoutId, ScoutStatus][]).filter(
    ([scout]) => scout !== 'S2',
  )
  const otherHasFacts = others.some(
    ([, status]) => status === 'FULL' || status === 'PARTIAL',
  )

  if (coverage.S2 === 'FULL' && otherHasFacts) return 'RICH'

  /* Did anyone find anything at all? "Not hiring" counts here: it is something
     we can build a sentence on, just not something we can quote. */
  const anythingFound = (Object.values(coverage) as ScoutStatus[]).some(
    (status) => status === 'FULL' || status === 'PARTIAL' || status === 'NONE',
  )

  if (!anythingFound || score < 0.2) return 'THIN'
  return 'MODERATE'
}

export type ResearchSummary = {
  coverage: Coverage
  coverageScore: number
  confidenceTier: ConfidenceTier
  /* Everything that failed, so a thin result can be explained rather than
     mistaken for a company with nothing going on. */
  gaps: { scout: ScoutId; reason: string }[]
}

export function summarize(
  results: Partial<Record<ScoutId, ScoutResult<unknown>>>,
): ResearchSummary {
  const coverage: Coverage = {}
  const gaps: { scout: ScoutId; reason: string }[] = []

  for (const [scout, result] of Object.entries(results) as [
    ScoutId,
    ScoutResult<unknown>,
  ][]) {
    if (result) {
      coverage[scout] = result.status
      if (result.status === 'ERROR') {
        gaps.push({ scout, reason: result.notes ?? 'failed to look' })
      }
    }
  }

  const score = coverageScore(coverage)

  return {
    coverage,
    coverageScore: score,
    confidenceTier: confidenceTier(coverage, score),
    gaps,
  }
}
