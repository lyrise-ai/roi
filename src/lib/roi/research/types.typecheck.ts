// ─────────────────────────────────────────────────────────────────────────────
// research/types.typecheck — a test that runs in the compiler, not the runner.
//
// R1's headline acceptance criterion is "a Fact cannot be constructed without a
// sourceUrl — verify by trying, it should be a type error". That guarantee
// can't be asserted from `node --test`, because the code under test is the type
// system. So it's asserted here instead.
//
// Every `@ts-expect-error` below is an assertion: if the line it precedes ever
// STOPS being an error, tsc fails with "unused '@ts-expect-error' directive".
// That is what makes this a regression guard rather than a comment — weaken the
// `SourceUrl` brand or make `sourceUrl` optional and `next build` breaks.
//
// Nothing here is imported at runtime; the file exists to be compiled.
// Everything is exported only so no-unused-vars stays quiet.
// ─────────────────────────────────────────────────────────────────────────────

import {
  fact,
  sourceUrl,
  type Fact,
  type Provenance,
  type ScoutResult,
} from './types'

const NOW = '2026-03-03T00:00:00.000Z'

/* 1. A source cannot be omitted. This is the "everything else is inferred"
      shape the old research agent produced. */
/* The directive sits above the declaration rather than inside the literal: a
   missing required property is reported against the object as a whole, not
   against any one line within it. */
// @ts-expect-error — sourceUrl is required
export const missingSource: Provenance = {
  sourceType: 'site',
  retrievedAt: NOW,
  confidence: 'high',
}

/* 2. A source cannot be hand-written. A raw string is not a SourceUrl, so a
      model-supplied or invented URL cannot be dropped straight into a fact —
      it has to go through `sourceUrl()`, which validates. */
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

/* 6. A scout cannot invent a status outside the four. In particular there is no
      way to spell a single value meaning "nothing here" that blurs NONE
      (we looked, there's nothing) into ERROR (we couldn't look). */
export const badStatus: ScoutResult<null> = {
  scout: 'S2',
  // @ts-expect-error — 'EMPTY' is not a ScoutStatus
  status: 'EMPTY',
  facts: null,
  sourcesAttempted: [],
  durationMs: 0,
  costUsd: 0,
}

/* 7. The sanctioned path. This one must COMPILE — if it ever fails, the
      contract has been tightened into something no scout can satisfy, which is
      its own kind of breakage. */
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
