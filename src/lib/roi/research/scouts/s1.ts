// ─────────────────────────────────────────────────────────────────────────────
// S1 — pre-flight resolver and firmographics (LYR-187 R2 / LYR-195).
//
// Runs alone and first. Every other scout needs `region` and `vertical` before
// it can choose its sources: a UAE firm's postings are not on the same boards
// as a Chicago firm's, and a law firm's site says "practice areas" where a
// consultancy says "capabilities". One fast call buys correct routing for all
// of them, which is why the target is ~500ms rather than "as long as it takes".
//
// No LLM anywhere in this file. Enrichment responses are structured JSON and
// the site fallback is keyword matching over page text — both are code, and
// code is what can be unit tested. The decisions live in s1Derive.ts.
//
// The cascade is PDL → site. Apollo and Explorium are the two providers the
// card's original cascade named; we hold neither (Apollo gates its API to the
// Organization plan, Explorium is enterprise-contract only), so they are not
// implemented rather than implemented against a guessed request shape. Each is
// one entry in TIERS away — see .env.example.
//
// Two rules that are easy to break by accident:
//
//   Revenue never reaches a user-facing path. Providers return it and it is
//   useful for internal qualification, so it is kept — but under `internal`,
//   not wrapped in a Fact. Anything that renders facts iterates Fact-shaped
//   values, so revenue is structurally excluded rather than merely undocumented.
//
//   NONE is not a valid status for S1. A company always has a country, so
//   "we found nothing" can only mean we failed to look — which is ERROR. NONE
//   here would tell a downstream writer "we established this company has no
//   country", which is nonsense. FULL, PARTIAL or ERROR only.
// ─────────────────────────────────────────────────────────────────────────────

import { getArtifact } from '../artifactCache'
import { type ProviderKey, providerKey } from '../env'
import {
  type Fact,
  type ScoutResult,
  type ScoutStatus,
  type SourceAttempt,
  fact,
  sourceUrl,
} from '../types'
import {
  type Region,
  countryFromDomain,
  countryFromRegistration,
  countryFromStructuredData,
  countryFromText,
  htmlToText,
  normalizeDomain,
  normalizeSizeBand,
  regionForCountry,
  sizeBandForHeadcount,
  verticalFromText,
} from './s1Derive'

/* The four routing fields are `Fact<T> | null` rather than plain `Fact<T>`.
   The card sketches them as always-present, but R1's binding rule is that
   absence must be representable — a required `sizeBand` would force S1 to
   invent one for a firm whose site doesn't say, which is precisely the
   fabrication this subsystem exists to prevent. The keys are always present so
   consumers can't forget a field; the values are nullable so we can't lie. */
export type S1Facts = {
  country: Fact<string> | null
  region: Fact<Region> | null
  vertical: Fact<string> | null
  sizeBand: Fact<string> | null
  headcount?: Fact<number>
  hq?: Fact<string>
  locations?: Fact<string[]>
  founded?: Fact<number>
  industry?: Fact<string>
  /* Never rendered, never quoted, never passed to a writer. Not Fact-shaped, so
     it cannot travel through any path that displays facts. The prospect knows
     their real revenue and ours will be wrong; being visibly wrong about it
     poisons trust in every other number on the page. */
  internal?: { annualRevenueUsd?: number }
}

/* What every tier reduces to before facts are built, so provider quirks stay
   inside their own adapter and there is exactly one place that turns data into
   Facts. */
type RawRecord = {
  country?: string
  vertical?: string
  industry?: string
  sizeBand?: string
  headcount?: number
  hq?: string
  locations?: string[]
  founded?: number
  annualRevenueUsd?: number
  /* The provider's own timestamp for the DATA, where it publishes one. Absent
     for every provider we currently call — see `retrievedAtFor`. */
  dataAsOf?: string
}

type TierResult = { record: RawRecord; url: string } | null

type Tier = {
  source: string
  /* Named rather than checked inline, so a tier that needs a key we don't hold
     reports a miss instead of firing an unauthenticated request. */
  requiresKey?: ProviderKey
  run: (domain: string) => Promise<TierResult>
}

const ENRICHMENT_TIMEOUT_MS = 3_000

/* Enrichment providers rebuild their corpus on a schedule — PDL publishes a
   `dataset_version` but no per-record date — so a lookup made this second may
   describe the company as it was weeks ago. Where a provider gives a real
   timestamp we use it; where it doesn't we fall back to our fetch time and cap
   confidence at 'medium', because claiming high confidence in an undated
   snapshot is the credibility damage the redesign exists to avoid.

   Site-derived facts are different: we read the live page, so our fetch time
   IS the data's age and it can carry the confidence the match deserves. */
function retrievedAtFor(record: RawRecord, fallback: string): string {
  return record.dataAsOf ?? fallback
}

// ── Tier 1 — People Data Labs ────────────────────────────────────────────────
// GET /v5/company/enrich?website=<domain>, X-Api-Key header. 404 on no match,
// which is a clean miss rather than an error: PDL looked and had nothing.

async function pdlTier(domain: string): Promise<TierResult> {
  const key = providerKey('PDL_API_KEY')
  if (!key) return null

  const endpoint = `https://api.peopledatalabs.com/v5/company/enrich?website=${encodeURIComponent(domain)}`
  const response = await fetch(endpoint, {
    headers: { 'x-api-key': key, accept: 'application/json' },
    signal: AbortSignal.timeout(ENRICHMENT_TIMEOUT_MS),
  })
  if (!response.ok) return null

  const body = await response.json()
  if (!body || typeof body !== 'object') return null

  const location = body.location ?? {}
  const record: RawRecord = {
    country:
      typeof location.country === 'string' ? location.country : undefined,
    industry: typeof body.industry === 'string' ? body.industry : undefined,
    vertical:
      verticalFromText(
        [body.industry, body.summary, body.tags?.join?.(' ')]
          .filter(Boolean)
          .join(' '),
      ) ?? undefined,
    sizeBand:
      (typeof body.size === 'string' ? normalizeSizeBand(body.size) : null) ??
      (typeof body.employee_count === 'number'
        ? sizeBandForHeadcount(body.employee_count)
        : null) ??
      undefined,
    headcount:
      typeof body.employee_count === 'number' ? body.employee_count : undefined,
    hq: typeof location.name === 'string' ? location.name : undefined,
    founded: typeof body.founded === 'number' ? body.founded : undefined,
    /* Kept for internal qualification only — see S1Facts.internal. */
    annualRevenueUsd:
      typeof body.inferred_revenue === 'number'
        ? body.inferred_revenue
        : undefined,
  }

  /* PDL returns country as a name ("united arab emirates"), not a code. */
  if (record.country) {
    record.country = countryFromText(record.country) ?? undefined
  }

  return hasAnything(record)
    ? {
        record,
        url: 'https://docs.peopledatalabs.com/docs/company-enrichment-api',
      }
    : null
}

// ── Tier 2 — the company's own site ──────────────────────────────────────────
// Always available, no key, and the source is a page a prospect can open. The
// weakest tier on completeness and the strongest on verifiability.

async function siteTier(domain: string): Promise<TierResult> {
  const homepage = `https://${domain}/`
  const artifact = await getArtifact(homepage)
  if (!artifact) return null

  const text = htmlToText(artifact.content)
  if (text === '') return null

  /* Country signals in descending order of precision. Each one is either right
     or absent; none of them guesses.

       ccTLD              — a .ae is a UAE firm. Cheap and near-certain.
       addressCountry     — the company's own schema.org markup of its HQ.
       "registered in X"  — the country of incorporation, stated in prose.
       footer prose       — last resort, and only when the footer names exactly
                            one country. A global office list names several, and
                            that resolves to null rather than to whichever
                            matched first.

     The last rule is not theoretical: before it existed, morganlewis.com (a
     Philadelphia firm) resolved to AE and hlbhamt.com (a Dubai firm) resolved
     to IN, both off office lists. Null here costs us `region: 'OTHER'` and low
     confidence; a wrong answer costs every downstream scout its sources. */
  const country =
    countryFromDomain(domain) ??
    countryFromStructuredData(artifact.content) ??
    countryFromRegistration(text.slice(-6000)) ??
    countryFromText(text.slice(-4000)) ??
    undefined

  const record: RawRecord = {
    country,
    vertical: verticalFromText(text.slice(0, 20_000)) ?? undefined,
    /* No headcount, no size band, no founding year. A homepage rarely states
       them, and guessing from "we're a large firm" is exactly the invention the
       interview is there to replace. PARTIAL is the honest outcome. */
  }

  /* Returned even when nothing classified. Unlike an enrichment miss, reading
     the page IS the finding: it means we looked and the site doesn't say, which
     is PARTIAL with region 'OTHER' at low confidence. Treating it as a miss
     would collapse "their site doesn't tell us" into "we couldn't reach them",
     and ERROR would then claim a blind spot we don't have. */
  return { record, url: homepage }
}

const TIERS: Tier[] = [
  { source: 'pdl', requiresKey: 'PDL_API_KEY', run: pdlTier },
  { source: 'site', run: siteTier },
]

function hasAnything(record: RawRecord): boolean {
  return Object.values(record).some(
    (value) => value !== undefined && value !== null && value !== '',
  )
}

const EMPTY_FACTS: S1Facts = {
  country: null,
  region: null,
  vertical: null,
  sizeBand: null,
}

/* Enrichment is a cached snapshot, the site is live. That difference is what
   the confidence ceiling encodes, and it is why `sourceType` is carried through
   to the panel rather than flattened away. */
function buildFacts(record: RawRecord, url: string, source: string): S1Facts {
  const verified = sourceUrl(url)
  if (!verified) return EMPTY_FACTS

  const isEnrichment = source !== 'site'
  const sourceType = isEnrichment ? 'enrichment' : 'site'
  const now = new Date().toISOString()
  const retrievedAt = retrievedAtFor(record, now)
  const ceiling = isEnrichment && !record.dataAsOf ? 'medium' : 'high'

  const make = <T>(
    value: T | undefined,
    confidence: 'high' | 'medium' | 'low',
  ) =>
    value === undefined || value === null
      ? null
      : fact(value, {
          sourceUrl: verified,
          sourceType,
          retrievedAt,
          confidence:
            confidence === 'high' ? (ceiling as 'high' | 'medium') : confidence,
        })

  const country = make(record.country, 'high')

  /* Region is derived, never read. It is a pure function of country, so it
     inherits country's source: the page or record that told us the country is
     the same evidence that puts the company in a region. With no country we
     still emit 'OTHER' at low confidence — "we looked and couldn't tell" is a
     usable routing answer, and it is sourced at whatever we did manage to
     read. */
  const region = make<Region>(
    regionForCountry(record.country ?? null),
    record.country ? 'high' : 'low',
  )

  return {
    country,
    region,
    vertical: make(record.vertical, 'medium'),
    sizeBand: make(record.sizeBand, 'high'),
    ...(record.headcount !== undefined
      ? { headcount: make(record.headcount, 'high') }
      : {}),
    ...(record.hq !== undefined ? { hq: make(record.hq, 'high') } : {}),
    ...(record.locations !== undefined
      ? { locations: make(record.locations, 'medium') }
      : {}),
    ...(record.founded !== undefined
      ? { founded: make(record.founded, 'high') }
      : {}),
    ...(record.industry !== undefined
      ? { industry: make(record.industry, 'medium') }
      : {}),
    ...(record.annualRevenueUsd !== undefined
      ? { internal: { annualRevenueUsd: record.annualRevenueUsd } }
      : {}),
  }
}

/* FULL means all four routing fields landed. PARTIAL means some did — still
   useful, still routes. ERROR means no tier produced a record at all: we failed
   to look, and downstream must treat that as a blind spot rather than as a
   finding. NONE is never returned; see the file header. */
function statusFor(facts: S1Facts, anyTierSucceeded: boolean): ScoutStatus {
  if (!anyTierSucceeded) return 'ERROR'
  const complete =
    facts.country && facts.region && facts.vertical && facts.sizeBand
  return complete ? 'FULL' : 'PARTIAL'
}

export async function runS1(
  domainInput: string,
): Promise<ScoutResult<S1Facts>> {
  const startedAt = Date.now()
  const sourcesAttempted: SourceAttempt[] = []

  const domain = normalizeDomain(domainInput)
  if (!domain) {
    return {
      scout: 'S1',
      status: 'ERROR',
      facts: EMPTY_FACTS,
      sourcesAttempted,
      durationMs: Date.now() - startedAt,
      costUsd: 0,
      notes: `"${domainInput}" is not a usable domain`,
    }
  }

  let winner: { record: RawRecord; url: string; source: string } | null = null
  const notes: string[] = []

  /* Sequential, not parallel, and that is deliberate: the tiers are ordered by
     quality, so the moment one returns a usable record the rest are wasted
     money and wasted milliseconds. Every attempt is logged either way —
     coverage is declared, never hidden. */
  for (const tier of TIERS) {
    if (winner) break

    const tierStartedAt = Date.now()

    /* An unconfigured tier is a logged miss, not a silent skip. The coverage
       test needs to tell "we have no PDL key" apart from "PDL had no record" —
       one is a decision we made, the other is a fact about the company. */
    if (tier.requiresKey && !providerKey(tier.requiresKey)) {
      sourcesAttempted.push({ source: tier.source, outcome: 'miss', ms: 0 })
      notes.push(`${tier.source}: no key configured`)
    } else {
      try {
        const result = await tier.run(domain)
        const ms = Date.now() - tierStartedAt
        if (result) {
          sourcesAttempted.push({ source: tier.source, outcome: 'hit', ms })
          winner = { ...result, source: tier.source }
        } else {
          sourcesAttempted.push({ source: tier.source, outcome: 'miss', ms })
        }
      } catch (error) {
        /* Never throws — a provider being down degrades the cascade, it does
           not fail the run. The next tier gets its turn. */
        sourcesAttempted.push({
          source: tier.source,
          outcome: 'error',
          ms: Date.now() - tierStartedAt,
        })
        notes.push(`${tier.source}: ${error?.message ?? 'failed'}`)
      }
    }
  }

  const facts = winner
    ? buildFacts(winner.record, winner.url, winner.source)
    : EMPTY_FACTS
  const status = statusFor(facts, Boolean(winner))

  if (status === 'PARTIAL' && winner) {
    const missing = ['country', 'region', 'vertical', 'sizeBand'].filter(
      (field) => !facts[field],
    )
    if (missing.length) notes.push(`undetermined: ${missing.join(', ')}`)
  }

  return {
    scout: 'S1',
    status,
    facts,
    sourcesAttempted,
    durationMs: Date.now() - startedAt,
    /* PDL's free tier charges nothing and only bills on a successful match;
       the site tier is a plain fetch. Both are zero today. When a metered
       provider lands, this is where its per-call price goes. */
    costUsd: 0,
    ...(notes.length ? { notes: notes.join('; ') } : {}),
  }
}
