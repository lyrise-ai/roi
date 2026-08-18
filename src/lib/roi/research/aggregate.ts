// ─────────────────────────────────────────────────────────────────────────────
// aggregate — derived facts and the confidence model (LYR-187 R5 / LYR-198).
//
// Pure functions, zero LLM, no I/O. Everything here is counting, ranking and
// set differences over what the scouts returned. R4 of the parent card is
// explicit that an LLM must never compute a ratio: it is untestable and it
// drifts between runs, so two reports for the same company would disagree for
// no reason.
//
// `confidenceTier` is the most important output in this file, and arguably in
// the whole subsystem. The previous system had no notion of how much it knew,
// so it wrote with the same confidence whether it had found three dated job
// postings or nothing at all. This makes "we do not know enough to say
// something specific" a computed, enforceable state rather than a hope.
// ─────────────────────────────────────────────────────────────────────────────

import type { ScoutId, ScoutResult, ScoutStatus } from './types'

export type ConfidenceTier = 'RICH' | 'MODERATE' | 'THIN'

/* S2 is weighted heaviest because job postings are testimony — a company
   describing its own work, dated and quotable — where everything else is
   inference. A run with S2 and nothing else knows more that is worth saying
   than a run with everything except S2. */
const SCOUT_WEIGHTS: Partial<Record<ScoutId, number>> = {
  S1: 1,
  S2: 3,
  S3: 1.5,
}

/* NONE and ERROR must score differently, and NONE must score ABOVE nothing.
   NONE means we established the company isn't hiring — real information a
   writer may use ("they're not hiring right now, so this is about the team
   they already have"). ERROR means we couldn't look, which supports no
   sentence at all. Scoring them the same is how the old system lost the
   distinction and started inventing.

   NONE deliberately does not score as high as FULL: knowing there is nothing
   is useful, but it gives a writer far less to work with than three dated
   postings do. */
const STATUS_SCORES: Record<ScoutStatus, number> = {
  FULL: 1,
  PARTIAL: 0.6,
  NONE: 0.35,
  ERROR: 0,
}

export type Coverage = Partial<Record<ScoutId, ScoutStatus>>

/* 0–1, weighted by scout. Only scouts that actually ran are in the
   denominator, so adding S3 later does not retroactively make every past run
   look worse than it was. */
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

/* The gate on how assertive every downstream writer is allowed to be:
     RICH     — may be specific and may quote a source verbatim
     MODERATE — hedges, leans on what the user told us
     THIN     — makes no external claim at all

   Deliberately keyed on what S2 returned rather than on the score alone. A
   high score built entirely from firmographics still cannot support a specific
   observation, because "you are a 30-person law firm in Dubai" is not a
   sentence that makes anyone feel seen. RICH requires testimony. */
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

  /* Anything at all was found, by anyone. NONE counts here: "they aren't
     hiring" is a usable premise, just not a quotable one. */
  const anythingFound = (Object.values(coverage) as ScoutStatus[]).some(
    (status) => status === 'FULL' || status === 'PARTIAL' || status === 'NONE',
  )

  if (!anythingFound || score < 0.2) return 'THIN'
  return 'MODERATE'
}

type PostingLike = {
  title?: string
  taskVerbs?: string[]
  namedSystems?: { name: string; category: string }[]
}

/* Verbs that imply information being moved, re-entered or pursued by hand —
   the work a system could take over. A subset of what S2 extracts, because not
   every non-generic verb is automatable: "draft" and "advise" are real duties
   but they are judgement, not repetition. */
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
  're-key',
  'reconcile',
  'record',
  'retype',
  'scan',
  'transcribe',
  'transfer',
  'update',
  'upload',
  'verify',
])

/* Which of the verbs the postings used actually imply manual data work. A set
   intersection — code, not a model's opinion about what sounds manual. */
export function manualWorkIndicators(postings: PostingLike[]): string[] {
  if (!Array.isArray(postings)) return []
  const found = new Set<string>()
  for (const posting of postings) {
    for (const raw of posting?.taskVerbs ?? []) {
      const verb = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
      if (MANUAL_WORK_VERBS.has(verb)) found.add(verb)
    }
  }
  return [...found].sort()
}

export type ResearchSummary = {
  coverage: Coverage
  coverageScore: number
  confidenceTier: ConfidenceTier
  manualWorkIndicators: string[]
  /* Everything that failed, so a thin result can be explained rather than
     mistaken for an empty world. */
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

  const s2 = results.S2 as ScoutResult<{ postings?: PostingLike[] }> | undefined
  const score = coverageScore(coverage)

  return {
    coverage,
    coverageScore: score,
    confidenceTier: confidenceTier(coverage, score),
    manualWorkIndicators: manualWorkIndicators(s2?.facts?.postings ?? []),
    gaps,
  }
}
