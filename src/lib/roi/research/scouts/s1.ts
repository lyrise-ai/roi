// ─────────────────────────────────────────────────────────────────────────────
// S1 — works out the basics about a company before anything else runs
// (LYR-187 R2 / LYR-195).
//
// It runs first, on its own. Every other scout needs to know the region and
// the type of business before it can pick where to look: a UAE firm's jobs are
// not on the same boards as a Chicago firm's, and a law firm's website says
// "practice areas" where a consultancy says "capabilities". One fast call
// gives all of them the right places to look, which is why we aim for about
// half a second rather than "however long it takes".
//
// No model calls anywhere in this file. The data providers answer in
// structured JSON, and the website fallback is keyword matching over page
// text. Both are ordinary code, and ordinary code can be unit tested. The
// decisions themselves live in s1Derive.ts.
//
// We try People Data Labs first, then the company's own website. Apollo and
// Explorium were the two other providers the plan named. We have accounts with
// neither — Apollo only opens its API on the Organization plan, Explorium is
// enterprise contracts only — so they are simply not built, rather than built
// against a guessed request shape. Each is one entry in TIERS away. See
// .env.example.
//
// Two rules that are easy to break by accident:
//
//   Revenue must never reach anything the user sees. The providers give it to
//   us and it is useful for judging whether a company is worth pursuing, so we
//   keep it — but under `internal`, not wrapped as a Fact. Everything that
//   displays facts loops over Fact-shaped values, so revenue is left out by
//   design rather than by us remembering not to show it.
//
//   "Found nothing" is not a valid answer for S1. Every company has a country,
//   so finding nothing can only mean we failed to look — which is an error.
//   Reporting "nothing found" would tell the report writer "we established
//   this company has no country", which is nonsense. Only full, partial or
//   error.
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
  canonicalDomainFromHtml,
  companyNameFromHtml,
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

/* The four fields that decide where other scouts look can each be empty. The
   plan drew them as always present, but the binding rule from R1 is that
   "we don't know" has to be expressible. A required size band would force S1
   to invent one for a firm whose site does not say — exactly the invention
   this subsystem exists to stop. So the keys are always there, which means no
   caller can forget one, and the values can be empty, which means we cannot
   lie. */
export type S1Facts = {
  /* Optional, not one of the four. A firm whose homepage we could not read
     still gets routed by country and business type, and when this is missing
     S2's search falls back to using the domain name. */
  name?: Fact<string>
  /* Passed to S2, so a search result on the company's real domain is not
     thrown away as belonging to someone else. Never shown to a prospect. */
  canonicalDomain?: Fact<string>
  country: Fact<string> | null
  region: Fact<Region> | null
  vertical: Fact<string> | null
  sizeBand: Fact<string> | null
  headcount?: Fact<number>
  hq?: Fact<string>
  locations?: Fact<string[]>
  founded?: Fact<number>
  industry?: Fact<string>
  /* Never displayed, never quoted, never handed to the report writer. It is
     deliberately not Fact-shaped, so it cannot travel down any path that shows
     facts. The prospect knows their real revenue and ours will be wrong. Being
     visibly wrong about that one number poisons trust in every other number on
     the page. */
  internal?: { annualRevenueUsd?: number }
}

/* Every source is cut down to this shape before we build facts from it. That
   keeps each provider's oddities inside its own small adapter, and leaves
   exactly one place where data turns into facts. */
type RawRecord = {
  /* The firm's name the way the firm writes it — "Gowling WLG", not
     "gowlingwlg". Only the website step produces this. The data providers could
     too, but PDL's `name` is its own tidied-up spelling, not the company's, and
     the whole point of this field is how the company writes itself. See
     `companyNameFromHtml` for why this matters (LYR-221). */
  name?: string
  /* Another domain the company itself says is the same as the one we were
     given. Website step only — a bought data record cannot tell us what the
     company's own page says. */
  canonicalDomain?: string
  country?: string
  vertical?: string
  industry?: string
  sizeBand?: string
  headcount?: number
  hq?: string
  locations?: string[]
  founded?: number
  annualRevenueUsd?: number
  /* The provider's own date for when the DATA was true, when they publish one.
     None of the providers we currently call do — see `retrievedAtFor`. */
  dataAsOf?: string
}

type TierResult = { record: RawRecord; url: string } | null

type Tier = {
  source: string
  /* Named here rather than checked further down, so a step that needs an API
     key we do not have reports a clean miss instead of firing off a request
     with no key on it. */
  requiresKey?: ProviderKey
  run: (domain: string) => Promise<TierResult>
}

const ENRICHMENT_TIMEOUT_MS = 3_000

/* The data providers rebuild their whole database on a schedule. PDL publishes
   a version number for the set but no date per record. So a lookup we make
   this second may describe the company as it was weeks ago.

   Where a provider gives a real date, we use it. Where it does not, we fall
   back to the time we fetched it and cap our confidence at medium. Claiming
   high confidence in an undated snapshot is exactly the credibility damage this
   redesign exists to avoid.

   Facts from the company's own site are different. We read the live page, so
   the time we fetched it IS the age of the data, and it can carry whatever
   confidence the match deserves. */
function retrievedAtFor(record: RawRecord, fallback: string): string {
  return record.dataAsOf ?? fallback
}

// -- Step 1: People Data Labs ------------------------------------------------
// GET /v5/company/enrich?website=<domain>, with the key in an X-Api-Key header.
// A 404 means no match, which is a clean miss and not an error: PDL looked and
// had nothing on this company.

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

// -- Step 2: the company's own website ---------------------------------------
// Always available, needs no API key, and the source is a page the prospect can
// open themselves. It tells us the least, and it is the easiest to check.

async function siteTier(domain: string): Promise<TierResult> {
  const homepage = `https://${domain}/`
  const artifact = await getArtifact(homepage)
  if (!artifact) return null

  const text = htmlToText(artifact.content)
  if (text === '') return null

  /* Ways to tell the country, most reliable first. Each one is either right or
     silent. None of them guesses.

       the domain ending  — a .ae is a UAE firm. Cheap and nearly certain.
       address markup     — the company's own machine-readable head office.
       "registered in X"  — the country of incorporation, written in prose.
       footer text        — last resort, and only when the footer names exactly
                            ONE country. A global office list names several, and
                            in that case we answer "unknown" rather than
                            picking whichever matched first.

     That last rule is not theoretical. Before it existed, morganlewis.com (a
     Philadelphia firm) came out as UAE and hlbhamt.com (a Dubai firm) came out
     as India, both from office lists. Answering "unknown" costs us a region of
     'OTHER' and low confidence. Answering wrongly sends every other scout to
     the wrong sources. */
  const country =
    countryFromDomain(domain) ??
    countryFromStructuredData(artifact.content) ??
    countryFromRegistration(text.slice(-6000)) ??
    countryFromText(text.slice(-4000)) ??
    undefined

  const record: RawRecord = {
    /* Read from the raw HTML, not the plain text: the site name and the
       machine-readable block both live in markup that `htmlToText` has already
       stripped out. */
    name: companyNameFromHtml(artifact.content, domain) ?? undefined,
    canonicalDomain:
      canonicalDomainFromHtml(artifact.content, domain) ?? undefined,
    country,
    vertical: verticalFromText(text.slice(0, 20_000)) ?? undefined,
    /* No staff count, no size band, no founding year. A homepage rarely states
       them, and guessing from "we're a large firm" is exactly the invention the
       questions are there to replace. Partial is the honest answer. */
  }

  /* We return this even when we worked nothing out. Unlike a provider miss,
     reading the page IS the finding: we looked, and the site does not say. That
     is partial, region 'OTHER', low confidence. Calling it a miss would mash
     "their site doesn't tell us" together with "we couldn't reach them", and
     then an error would claim a blind spot we do not actually have. */
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

/* A data provider gives us a stored snapshot; the website is live right now.
   That difference is what the confidence limit above captures, and it is why we
   carry `sourceType` all the way to the panel instead of dropping it. */
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

  /* We work the region out; we never read it from anywhere. It follows
     directly from the country, so it takes the country's source: the page or
     record that told us the country is the same evidence that places the
     company in a region. With no country we still answer 'OTHER' at low
     confidence — "we looked and could not tell" is a useful answer for routing,
     and it is credited to whatever we did manage to read. */
  const region = make<Region>(
    regionForCountry(record.country ?? null),
    record.country ? 'high' : 'low',
  )

  return {
    country,
    region,
    vertical: make(record.vertical, 'medium'),
    ...(record.name !== undefined ? { name: make(record.name, 'high') } : {}),
    ...(record.canonicalDomain !== undefined
      ? { canonicalDomain: make(record.canonicalDomain, 'high') }
      : {}),
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

/* Full means all four routing fields came back. Partial means some did — still
   useful, still enough to route on. Error means no step produced a record at
   all: we failed to look, and everything downstream must treat that as a blind
   spot rather than as a finding. We never answer "nothing found" here; see the
   note at the top of the file. */
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

  /* One after another, not all at once, and that is on purpose. The steps are
     in order of quality, so the moment one gives us a usable record the rest are
     wasted money and wasted time. We log every attempt either way — what we
     looked at is always declared, never hidden. */
  for (const tier of TIERS) {
    if (winner) break

    const tierStartedAt = Date.now()

    /* A step with no API key is recorded as a miss, not skipped quietly. The
       coverage test has to tell "we have no PDL key" apart from "PDL had no
       record": the first is a decision we made, the second is a fact about the
       company. */
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
        /* This never throws. A provider being down makes the result weaker; it
           does not fail the run. The next step gets its turn. */
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
    /* PDL's free plan charges nothing, and only bills at all on a successful
       match. Reading the website is just a fetch. So both are zero today. When
       a paid provider is added, its per-call price goes here. */
    costUsd: 0,
    ...(notes.length ? { notes: notes.join('; ') } : {}),
  }
}
