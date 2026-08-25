// ─────────────────────────────────────────────────────────────────────────────
// research/types — the shapes every scout in the research system has to follow
// (LYR-187 R1 / LYR-194).
//
// This whole subsystem exists because the old research agent made things up.
// Its prompt demanded exactly four workflows and a monthly volume whether or
// not any evidence existed, so "we found nothing" was not an allowed answer and
// it invented one instead.
//
// Two things in this file make that impossible by construction, rather than
// merely discouraged by a prompt:
//
//   1. A fact cannot exist without a source. The source URL is not an ordinary
//      string. It is a special type that only the `sourceUrl()` function can
//      produce, and that function checks the URL. You cannot write a fact by
//      hand with a literal URL in it, and you cannot leave the field out.
//      Both fail to compile.
//
//   2. "Found nothing" and "failed to look" are different answers, and must
//      never be treated as the same thing.
//
// Why the special type rather than a plain string: this repo compiles with
// TypeScript's strict checks off, so a plain string field would still accept
// null. The special type is what actually holds the line under these settings —
// an ordinary string cannot be assigned to it, strict mode or not.
// ─────────────────────────────────────────────────────────────────────────────

export type SourceType = 'enrichment' | 'ats' | 'site' | 'registry' | 'news'

export type Confidence = 'high' | 'medium' | 'low'

/* A URL that has been through `sourceUrl()`. Tagging the string type with a
   private marker is what makes a plain string unusable here: there is no way to
   produce this type except by calling that function. */
declare const SOURCE_VERIFIED: unique symbol
export type SourceUrl = string & { readonly [SOURCE_VERIFIED]: true }

export type Provenance = {
  sourceUrl: SourceUrl
  sourceType: SourceType
  /* A date and time in the standard format. This is how old the DATA is, not
     when we asked for it. A data provider refreshes its store monthly, so a
     lookup made this second may describe the company as it was in March.
     Anything that shows a fact is expected to show this too. */
  retrievedAt: string
  confidence: Confidence
  /* Word for word from the source, cut to 200 characters by `fact()`. This is
     what lets the report quote instead of rephrase. "Your posting from 3 March
     lists 'chasing outstanding client documents' as the first duty" is only
     possible if the original text survives this far. */
  excerpt?: string
}

export type Fact<T> = {
  value: T
  provenance: Provenance
}

export const EXCERPT_MAX = 200

/* Produces a checked source URL, or nothing if the input is not a real http or
   https address. It returns nothing rather than throwing, because this sits on
   the report-generation path, and nothing on that path is allowed to throw (see
   pipeline/validationBaseline.ts). A caller that cannot produce a source is
   expected to drop the fact. That is the right outcome: a fact we cannot point
   at is one we should not state. */
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

/* The only allowed way to build a fact. It returns nothing when the source is
   unusable, so "no source" becomes "no fact" rather than a fact with an empty
   source. It shortens a long quote rather than refusing it: the first 200
   characters of the source text are still the source's own words, which is the
   part that matters for quoting. */
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

/* "Found nothing" and "error" do real work here and must never be merged:
     NONE  = we looked and there genuinely is nothing. The company is not
             hiring. That is INFORMATION, and the report may say so.
     ERROR = we failed to look. The API was down, we were blocked, it timed
             out. That is a GAP, and the report must stay quiet about it.
   Merging the two is how the old system ended up inventing things: it could not
   tell "there are no postings" from "we could not reach the job board", so it
   treated both as an invitation to produce something. */
export type ScoutStatus = 'FULL' | 'PARTIAL' | 'NONE' | 'ERROR'

export type SourceAttempt = {
  source: string
  outcome: 'hit' | 'miss' | 'blocked' | 'error'
  ms: number
}

/* What we looked at is always declared, never hidden (R5 of the parent card).
   Every scout reports what it TRIED as well as what it found, so we can score
   how much we actually know, instead of assuming a quiet result means the
   company has nothing going on. */
export type ScoutResult<T> = {
  scout: ScoutId
  status: ScoutStatus
  facts: T
  sourcesAttempted: SourceAttempt[]
  durationMs: number
  costUsd: number
  /* A readable reason for a weaker result, such as "Apollo rate-limited us,
     fell back to the website". Shown in the coverage test's report, never to a
     prospect. */
  notes?: string
}

export type Artifact = {
  content: string
  /* A date and time in the standard format: when this page was actually
     downloaded, not when someone asked for it. A page served from the cache
     reports when it was first downloaded. */
  fetchedAt: string
}
