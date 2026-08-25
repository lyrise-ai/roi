// ─────────────────────────────────────────────────────────────────────────────
// research/types.typecheck — a test that runs in the type checker, not in the
// test runner.
//
// R1's main requirement is "a fact cannot be built without a source URL —
// check by trying, it should be a type error". You cannot check that from
// `node --test`, because the thing being tested is the type system itself. So
// it is checked here.
//
// Every `@ts-expect-error` below is a claim that the next line is an error. If
// that line ever STOPS being an error, the compiler fails with "unused
// '@ts-expect-error' directive". That is what makes this file a real guard
// rather than a comment: weaken the source-URL type, or make the field
// optional, and `next build` breaks.
//
// Nothing here runs. The file exists only to be compiled. Everything is
// exported purely to keep the unused-variable rule quiet.
// ─────────────────────────────────────────────────────────────────────────────

import {
  fact,
  sourceUrl,
  type Fact,
  type Provenance,
  type ScoutResult,
} from './types'

const NOW = '2026-03-03T00:00:00.000Z'

/* 1. You cannot leave the source out. This is the shape the old research agent
      produced, where everything was inferred and nothing was sourced. */
/* The marker sits above the whole declaration, not inside the object. A missing
   required field is reported against the object as a whole, not against any one
   line inside it. */
// @ts-expect-error — sourceUrl is required
export const missingSource: Provenance = {
  sourceType: 'site',
  retrievedAt: NOW,
  confidence: 'high',
}

/* 2. You cannot write a source by hand. A plain string is not a checked source
      URL, so a URL from a model, or one someone made up, cannot be dropped
      straight into a fact. It has to go through `sourceUrl()`, which checks
      it. */
export const handWrittenSource: Provenance = {
  // @ts-expect-error — string is not assignable to SourceUrl
  sourceUrl: 'https://acmelaw.com/careers',
  sourceType: 'site',
  retrievedAt: NOW,
  confidence: 'high',
}

/* 3. An empty string is not a loophole around rule 2. */
export const emptySource: Provenance = {
  // @ts-expect-error — string is not assignable to SourceUrl
  sourceUrl: '',
  sourceType: 'site',
  retrievedAt: NOW,
  confidence: 'high',
}

/* 4. A fact cannot carry no provenance at all. */
// @ts-expect-error — provenance is required
export const noProvenance: Fact<string> = { value: 'four paralegals' }

/* 5. `fact()` refuses a raw string just as the type does. */
export const factWithRawString = fact(1, {
  // @ts-expect-error — string is not assignable to SourceUrl
  sourceUrl: 'https://acmelaw.com/careers',
  sourceType: 'ats',
  retrievedAt: NOW,
  confidence: 'high',
})

/* 6. A scout cannot invent a fifth answer. In particular there is no way to
      write one value meaning "nothing here" that blurs "we looked and there is
      nothing" together with "we could not look". */
export const badStatus: ScoutResult<null> = {
  scout: 'S2',
  // @ts-expect-error — 'EMPTY' is not a ScoutStatus
  status: 'EMPTY',
  facts: null,
  sourcesAttempted: [],
  durationMs: 0,
  costUsd: 0,
}

/* 7. The proper way to do it. This one must COMPILE. If it ever fails, the
      rules have been tightened into something no scout can satisfy, which is
      its own kind of broken. */
export function sanctioned(): Fact<number> | null {
  const url = sourceUrl('https://acmelaw.com/careers')
  if (!url) return null
  return fact(3, {
    sourceUrl: url,
    sourceType: 'ats',
    retrievedAt: NOW,
    confidence: 'high',
    excerpt: 'chasing outstanding client documents',
  })
}
