// ─────────────────────────────────────────────────────────────────────────────
// research/types — the contracts every scout in the Profit Map research system
// implements (LYR-187 R1 / LYR-194).
//
// The whole subsystem exists because the previous research agent fabricated.
// Its prompt required exactly four workflows and a monthly volume whether or
// not evidence existed, so "we found nothing" was not a legal answer and it
// invented one. Two properties of this file make that failure structural
// rather than something a prompt politely discourages:
//
//   1. A fact cannot exist without a source. `Provenance.sourceUrl` is not a
//      `string` — it is a branded `SourceUrl` that only `sourceUrl()` can
//      mint, and that function validates. You cannot hand-write a Fact with a
//      literal URL, and you cannot omit the field. Both fail to compile.
//
//   2. NONE and ERROR are different statuses and must never be collapsed.
//
// Note on the brand: this repo runs `strict: false`, so `strictNullChecks` is
// off and a plain `sourceUrl: string` would still accept `null`. The brand is
// what actually holds the line under these compiler settings — a raw string is
// not assignable to it regardless of strictness.
// ─────────────────────────────────────────────────────────────────────────────

export type SourceType = 'enrichment' | 'ats' | 'site' | 'registry' | 'news'

export type Confidence = 'high' | 'medium' | 'low'

/* A URL that has been through `sourceUrl()`. The intersection with an object
   type carrying a `unique symbol` is what makes a plain string un-assignable:
   there is no way to produce this type except by calling the constructor. */
declare const SOURCE_VERIFIED: unique symbol
export type SourceUrl = string & { readonly [SOURCE_VERIFIED]: true }

export type Provenance = {
  sourceUrl: SourceUrl
  sourceType: SourceType
  /* ISO 8601. This is the age of the DATA, not the time of our call. An
     enrichment provider refreshes its cache monthly, so a lookup made this
     second may be describing a company as it was in March. Anything that
     displays a fact is expected to surface this. */
  retrievedAt: string
  confidence: Confidence
  /* Verbatim from the source, capped at 200 chars by `fact()`. This is what
     lets a downstream writer quote rather than paraphrase — "your posting from
     3 March lists 'chasing outstanding client documents' as the first duty" is
     only possible if the raw span survives extraction. */
  excerpt?: string
}

export type Fact<T> = {
  value: T
  provenance: Provenance
}

export const EXCERPT_MAX = 200

/* Mints a `SourceUrl`, or returns null if the input isn't a real http(s) URL.
   Null rather than throw: this sits on the report-generation path, which never
   throws (see pipeline/validationBaseline.ts). A caller that can't produce a
   source is expected to drop the fact, which is the correct outcome — a fact
   we can't point at is one we shouldn't state. */
export function sourceUrl(raw: string): SourceUrl | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null
  let parsed: URL
  try {
    parsed = new URL(raw.trim())
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  return parsed.toString() as SourceUrl
}

/* The only sanctioned way to build a Fact. Returns null when provenance is
   unusable, so "no source" degrades to "no fact" rather than to a fact with an
   empty source. Truncates `excerpt` instead of rejecting it — a 200-char
   prefix of the source text is still verbatim, which is the property that
   matters for quoting. */
export function fact<T>(
  value: T,
  provenance: {
    sourceUrl: SourceUrl
    sourceType: SourceType
    retrievedAt: string
    confidence: Confidence
    excerpt?: string
  },
): Fact<T> | null {
  if (!provenance || !provenance.sourceUrl) return null
  const excerpt =
    typeof provenance.excerpt === 'string' && provenance.excerpt !== ''
      ? provenance.excerpt.slice(0, EXCERPT_MAX)
      : undefined
  return {
    value,
    provenance: {
      sourceUrl: provenance.sourceUrl,
      sourceType: provenance.sourceType,
      retrievedAt: provenance.retrievedAt,
      confidence: provenance.confidence,
      ...(excerpt ? { excerpt } : {}),
    },
  }
}

export type ScoutId = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'S7'

/* NONE and ERROR are load-bearing and must not be collapsed:
     NONE  = we looked and there is genuinely nothing. The company isn't
             hiring. This is INFORMATION, and a writer may say so.
     ERROR = we failed to look. API down, blocked, timed out. This is a GAP,
             and a writer must stay quiet about it.
   Collapsing the two is how the old system ended up inventing: it could not
   tell "no postings exist" from "we couldn't reach the ATS", so it treated
   both as a prompt to produce something. */
export type ScoutStatus = 'FULL' | 'PARTIAL' | 'NONE' | 'ERROR'

export type SourceAttempt = {
  source: string
  outcome: 'hit' | 'miss' | 'blocked' | 'error'
  ms: number
}

/* Coverage is declared, never hidden (R5 of the parent card). Every scout
   reports what it tried as well as what it found, so the aggregator can score
   how much the system actually knows rather than assuming a quiet result
   means an empty world. */
export type ScoutResult<T> = {
  scout: ScoutId
  status: ScoutStatus
  facts: T
  sourcesAttempted: SourceAttempt[]
  durationMs: number
  costUsd: number
  /* Human-readable reason for degradation, e.g. "Apollo 429, fell back to
     site". Shown in the coverage test's report, never to a prospect. */
  notes?: string
}

export type Artifact = {
  content: string
  /* ISO 8601 — when these bytes were fetched, not when they were requested.
     A cache hit reports the original fetch time. */
  fetchedAt: string
}
