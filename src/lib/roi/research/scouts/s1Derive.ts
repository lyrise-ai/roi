// ─────────────────────────────────────────────────────────────────────────────
// s1Derive — the decision-making half of the first scout (LYR-187 R2 /
// LYR-195).
//
// Plain functions only. No network, no provider objects, no model calls.
// Everything S1 has to DECIDE, rather than simply read, lives here, so it can
// be tested against known inputs instead of against a live API. R4 of the
// parent card — counts and comparisons are code, not model output — starts in
// this file.
//
// Every function returns nothing rather than a guess when the input does not
// support an answer. A wrong country sends every other scout to the wrong
// sources, which is worse than honestly saying "unknown".
// ─────────────────────────────────────────────────────────────────────────────

import { companyToken, slugMatchesCompany } from '../search'

export type Region = 'US' | 'UK' | 'EU' | 'GCC' | 'OTHER'

/* Cuts whatever the user typed down to a plain domain.
   "https://WWW.AcmeLaw.com/about?x=1" becomes "acmelaw.com". Returns nothing
   for anything that could not be a domain, so a typo fails at the top of the
   scout rather than turning into a request for a nonsense address. */
export function normalizeDomain(input: string): string | null {
  if (typeof input !== 'string') return null
  let value = input.trim().toLowerCase()
  if (value === '') return null

  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
  value = value.split(/[/?#]/)[0]
  value = value.replace(/^www\./, '')
  value = value.split('@').pop()
  value = value.split(':')[0]

  /* Checked piece by piece rather than with one big pattern over the whole
     name. The obvious pattern for this can take exponentially long on a long
     hostile string, and this function sits on the boundary where outside input
     comes in: the domain is whatever the prospect typed. Splitting it first
     makes the check fast and impossible to trip up. */
  if (value.length > 253) return null
  const labels = value.split('.')
  if (labels.length < 2) return null
  return labels.every(isValidLabel) ? value : null
}

function isValidLabel(label: string): boolean {
  if (label.length === 0 || label.length > 63) return false
  if (label.startsWith('-') || label.endsWith('-')) return false
  for (const char of label) {
    const isDigit = char >= '0' && char <= '9'
    const isLetter = char >= 'a' && char <= 'z'
    if (!isDigit && !isLetter && char !== '-') return false
  }
  return true
}

/* Domain endings mapped to country codes. Only the countries we actually route
   on: the Gulf (deliberately over-represented in the coverage test), the US, UK
   and EU core, and the handful of others that turn up in professional services.
   A country domain ending is strong evidence but not proof — a UK firm can sit
   on a .com — so callers treat it as medium confidence and let a real data
   provider overrule it. */
const TLD_COUNTRY: Record<string, string> = {
  ae: 'AE',
  sa: 'SA',
  qa: 'QA',
  kw: 'KW',
  bh: 'BH',
  om: 'OM',
  uk: 'GB',
  gb: 'GB',
  ie: 'IE',
  de: 'DE',
  fr: 'FR',
  nl: 'NL',
  es: 'ES',
  it: 'IT',
  pt: 'PT',
  be: 'BE',
  at: 'AT',
  se: 'SE',
  dk: 'DK',
  fi: 'FI',
  pl: 'PL',
  cz: 'CZ',
  gr: 'GR',
  ro: 'RO',
  hu: 'HU',
  us: 'US',
  ca: 'CA',
  au: 'AU',
  nz: 'NZ',
  in: 'IN',
  sg: 'SG',
  za: 'ZA',
  eg: 'EG',
  jo: 'JO',
  lb: 'LB',
  ch: 'CH',
  no: 'NO',
}

/* Endings like .com say nothing about country. Returning nothing for these is
   the point: it sends the caller to read the page instead of letting ".com"
   quietly mean "American", which would misroute most of our Gulf pipeline. */
const GENERIC_TLDS = new Set([
  'com',
  'org',
  'net',
  'io',
  'co',
  'biz',
  'info',
  'law',
  'legal',
  'group',
  'agency',
  'consulting',
  'company',
  'global',
  'digital',
  'partners',
  'services',
  'solutions',
])

export function countryFromDomain(domain: string): string | null {
  const normalized = normalizeDomain(domain)
  if (!normalized) return null
  const labels = normalized.split('.')
  const tld = labels[labels.length - 1]

  /* Two-part endings like co.uk, com.sa and ae.org. The country sits one step
     further left than usual. */
  if (labels.length >= 3 && GENERIC_TLDS.has(labels[labels.length - 2])) {
    const mapped = TLD_COUNTRY[tld]
    if (mapped) return mapped
  }
  if (GENERIC_TLDS.has(tld)) return null
  return TLD_COUNTRY[tld] ?? null
}

const GCC = new Set(['AE', 'SA', 'QA', 'KW', 'BH', 'OM'])

const EU = new Set([
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
])

/* The decision every other scout depends on. 'OTHER' is a real answer, not a
   failure. It means "use the default sources and mark our confidence low",
   which is exactly what the card asks for when the country cannot be worked
   out. */
export function regionForCountry(country: string | null): Region {
  if (!country) return 'OTHER'
  const code = country.trim().toUpperCase()
  if (code === 'US') return 'US'
  if (code === 'GB' || code === 'UK') return 'UK'
  if (GCC.has(code)) return 'GCC'
  if (EU.has(code)) return 'EU'
  return 'OTHER'
}

/* The size bands the data providers already use — PDL's `size` field is exactly
   this wording — so a band from a provider passes through untouched, and a raw
   staff count lands in the same buckets. One set of words downstream. */
const SIZE_BANDS: { max: number; band: string }[] = [
  { max: 10, band: '1-10' },
  { max: 50, band: '11-50' },
  { max: 200, band: '51-200' },
  { max: 500, band: '201-500' },
  { max: 1000, band: '501-1000' },
  { max: 5000, band: '1001-5000' },
  { max: 10000, band: '5001-10000' },
]

export const SIZE_BAND_VALUES = [...SIZE_BANDS.map((b) => b.band), '10001+']

export function sizeBandForHeadcount(headcount: number): string | null {
  if (typeof headcount !== 'number' || !Number.isFinite(headcount)) return null
  if (headcount < 1) return null
  for (const { max, band } of SIZE_BANDS) {
    if (headcount <= max) return band
  }
  return '10001+'
}

/* Providers write their bands inconsistently: "11-50", "11 - 50", "11to50".
   Anything that does not come down to a band we know is dropped, never forced
   into the nearest one. */
export function normalizeSizeBand(raw: string): string | null {
  if (typeof raw !== 'string') return null
  const compact = raw
    .trim()
    .toLowerCase()
    .replace(/\s|to|–|—/g, '-')
    .replace(/-+/g, '-')
  if (compact === '') return null
  if (compact === '10001+' || compact === '10001-') return '10001+'
  const match = SIZE_BAND_VALUES.find((band) => band.toLowerCase() === compact)
  return match ?? null
}

/* Words that identify each kind of business, our target customers first. The
   order matters: the first match wins, so the more specific words sit above the
   general ones. A firm that says both "practice areas" and "advisory" is a law
   firm that also advises, not a consultancy.

   These decide both what S3 looks for and where S2 looks, which is why a wrong
   answer is expensive: searching a law firm's site for "service lines" instead
   of "practice areas" brings back vague results. */
const VERTICAL_KEYWORDS: { vertical: string; keywords: string[] }[] = [
  {
    vertical: 'legal',
    keywords: [
      'law firm',
      'practice areas',
      'solicitor',
      'barrister',
      'attorney',
      'litigation',
      'legal services',
      'advocates',
      'legal counsel',
      'law practice',
      'conveyancing',
      'paralegal',
    ],
  },
  {
    vertical: 'accounting',
    keywords: [
      'accounting',
      'accountancy',
      'chartered accountant',
      'bookkeeping',
      'audit',
      'auditing',
      'tax advisory',
      'tax services',
      'cpa firm',
      'vat return',
      'payroll services',
    ],
  },
  {
    vertical: 'consulting',
    keywords: [
      'management consulting',
      'consultancy',
      'consulting firm',
      'advisory firm',
      'strategy consulting',
      'business advisory',
      'transformation consulting',
    ],
  },
  {
    vertical: 'recruitment',
    keywords: [
      'recruitment',
      'staffing',
      'talent acquisition',
      'headhunting',
      'executive search',
      'job portal',
      'hiring platform',
    ],
  },
  {
    vertical: 'insurance',
    keywords: [
      'insurance broker',
      'underwriting',
      'insurance services',
      'claims handling',
    ],
  },
  {
    vertical: 'real-estate',
    keywords: [
      'real estate',
      'property management',
      'lettings',
      'estate agent',
      'brokerage',
    ],
  },
  {
    vertical: 'engineering',
    keywords: [
      'engineering consultancy',
      'civil engineering',
      'structural engineering',
      'mep',
    ],
  },
  {
    vertical: 'healthcare',
    keywords: [
      'dental practice',
      'medical clinic',
      'healthcare provider',
      'patient care',
    ],
  },
  {
    vertical: 'marketing',
    keywords: [
      'marketing agency',
      'digital agency',
      'advertising agency',
      'branding agency',
    ],
  },
]

/* A keyword match, not a guess. If the text does not say it, we do not know it
   — which is a perfectly good answer, and the questions ask instead. */
export function verticalFromText(text: string): string | null {
  if (typeof text !== 'string' || text.trim() === '') return null
  const haystack = text.toLowerCase()
  for (const { vertical, keywords } of VERTICAL_KEYWORDS) {
    if (keywords.some((keyword) => haystack.includes(keyword))) return vertical
  }
  return null
}

/* Country names as they appear in a footer address, mapped to country codes.
   Only used when the domain ending says nothing. Longest names are checked
   first, so "United Arab Emirates" cannot be hidden by a shorter match inside
   it. */
const COUNTRY_NAMES: { name: string; code: string }[] = [
  { name: 'united arab emirates', code: 'AE' },
  { name: 'saudi arabia', code: 'SA' },
  { name: 'kingdom of saudi arabia', code: 'SA' },
  { name: 'united kingdom', code: 'GB' },
  { name: 'united states', code: 'US' },
  { name: 'netherlands', code: 'NL' },
  { name: 'switzerland', code: 'CH' },
  { name: 'south africa', code: 'ZA' },
  { name: 'new zealand', code: 'NZ' },
  { name: 'singapore', code: 'SG' },
  { name: 'australia', code: 'AU' },
  { name: 'germany', code: 'DE' },
  { name: 'ireland', code: 'IE' },
  { name: 'belgium', code: 'BE' },
  { name: 'portugal', code: 'PT' },
  { name: 'denmark', code: 'DK' },
  { name: 'bahrain', code: 'BH' },
  { name: 'lebanon', code: 'LB' },
  { name: 'england', code: 'GB' },
  { name: 'scotland', code: 'GB' },
  { name: 'kuwait', code: 'KW' },
  { name: 'canada', code: 'CA' },
  { name: 'france', code: 'FR' },
  { name: 'jordan', code: 'JO' },
  { name: 'sweden', code: 'SE' },
  { name: 'norway', code: 'NO' },
  { name: 'poland', code: 'PL' },
  { name: 'spain', code: 'ES' },
  { name: 'italy', code: 'IT' },
  { name: 'egypt', code: 'EG' },
  { name: 'india', code: 'IN' },
  { name: 'qatar', code: 'QA' },
  { name: 'wales', code: 'GB' },
  { name: 'oman', code: 'OM' },
  { name: 'uae', code: 'AE' },
  { name: 'ksa', code: 'SA' },
]

/* Cities that identify a country clearly enough to be worth checking when no
   country is named. A footer often reads "Dubai, UAE", but just as often it
   reads only "Dubai". Deliberately a short list: only cities where there is no
   doubt, for the kinds of firms we deal with. */
const CITY_COUNTRY: { city: string; code: string }[] = [
  { city: 'abu dhabi', code: 'AE' },
  { city: 'dubai', code: 'AE' },
  { city: 'sharjah', code: 'AE' },
  { city: 'riyadh', code: 'SA' },
  { city: 'jeddah', code: 'SA' },
  { city: 'dammam', code: 'SA' },
  { city: 'doha', code: 'QA' },
  { city: 'manama', code: 'BH' },
  { city: 'muscat', code: 'OM' },
  { city: 'kuwait city', code: 'KW' },
  { city: 'london', code: 'GB' },
  { city: 'manchester', code: 'GB' },
  { city: 'birmingham', code: 'GB' },
  { city: 'edinburgh', code: 'GB' },
  { city: 'dublin', code: 'IE' },
  { city: 'amsterdam', code: 'NL' },
  { city: 'frankfurt', code: 'DE' },
  { city: 'berlin', code: 'DE' },
  { city: 'paris', code: 'FR' },
  { city: 'madrid', code: 'ES' },
  { city: 'new york', code: 'US' },
  { city: 'san francisco', code: 'US' },
  { city: 'chicago', code: 'US' },
  { city: 'boston', code: 'US' },
  { city: 'los angeles', code: 'US' },
]

const ISO_CODES = new Set([
  ...Object.values(TLD_COUNTRY),
  ...COUNTRY_NAMES.map((c) => c.code),
])

/* Every different country the text mentions, by name or by an unmistakable
   city. Exported on purpose, because finding several is useful information, not
   a nuisance: a footer naming six countries is a firm with six offices, and
   knowing that is what stops us picking one at random. */
export function countryCandidates(text: string): string[] {
  if (typeof text !== 'string' || text.trim() === '') return []

  /* Turn every run of punctuation into a single space, and put a space at each
     end. Then matching a whole word is just searching for that word with
     spaces around it. No pattern building per word, and no way for "uae" to
     match inside "nuance" or "ksa" inside a jumbled filename. Names of several
     words still work, because the punctuation between them becomes the single
     space they are normally written with. */
  const haystack = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `
  const found = new Set<string>()

  for (const { name, code } of COUNTRY_NAMES) {
    if (haystack.includes(` ${name} `)) found.add(code)
  }
  for (const { city, code } of CITY_COUNTRY) {
    if (haystack.includes(` ${city} `)) found.add(code)
  }
  return [...found]
}

/* Exactly one country named, or none at all. If it is unclear, we answer
   nothing.

   This rule exists because of two real misreadings on live sites:
   morganlewis.com (Philadelphia) came out as UAE, and hlbhamt.com (Dubai) came
   out as India. Both because a global office list in the footer was scanned and
   the first match won.

   Being confidently wrong about the country is far worse than not knowing it. A
   wrong country sends every other scout to the wrong sources. No answer sends
   them to the defaults at low confidence, and lets the questions fill the
   gap. */
export function countryFromText(text: string): string | null {
  const candidates = countryCandidates(text)
  return candidates.length === 1 ? candidates[0] : null
}

/* The company's address in machine-readable form, in either of the two standard
   formats. This is the company stating its own address for machines to read, so
   it beats any amount of prose. Even a firm with many offices publishes exactly
   one country for its head office. This is the most reliable signal we can get
   without paying a data provider. */
export function countryFromStructuredData(html: string): string | null {
  if (typeof html !== 'string' || html === '') return null

  const found = new Set<string>()
  const pattern =
    /["']?addressCountry["']?\s*[:=]\s*["']([A-Za-z][A-Za-z .-]{1,40})["']/g

  for (const match of html.matchAll(pattern)) {
    const raw = match[1].trim()
    const code =
      raw.length === 2 && ISO_CODES.has(raw.toUpperCase())
        ? raw.toUpperCase()
        : countryFromText(raw)
    if (code) found.add(code)
  }

  /* Several different countries marked up means several offices, with no way
     to tell which is head office. Same rule as with prose: if it is unclear, we
     answer nothing. */
  return found.size === 1 ? [...found][0] : null
}

/* Catches "Registered in England and Wales", "registered office ... Dubai". A
   registration line names the country the company is legally based in, which is
   what we want, rather than wherever it happens to rent a desk. */
export function countryFromRegistration(text: string): string | null {
  if (typeof text !== 'string' || text === '') return null
  const match = text
    .toLowerCase()
    .match(/registered\s+(?:in|office[^.]{0,60}?\bin)\s+([a-z][a-z ,&]{2,40})/)
  if (!match) return null
  return countryFromText(match[1])
}

/* Cuts a fetched page down to the text a person would actually read, so we can
   match keywords against it. Scripts and styles go first: a bundle of
   JavaScript is full of words that say nothing about the business and would
   cause false matches. */
export function htmlToText(html: string): string {
  if (typeof html !== 'string') return ''
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/* The company's own name, written the way a person would write it (LYR-221).

   This exists because the search was being built from the domain name.
   `gowlingwlg.com` became the search "gowlingwlg" careers, which Tavily
   answered with a German packaging company four times. `farrer.co.uk` became
   "farrer", which pulled six unrelated US firms. Measured over 25 domains, six
   firms produced no usable URL at all — and swapping the domain for the real
   name, "Gowling WLG" and "Farrer & Co", took two of those six from zero usable
   results to four each. Nobody writes their firm's name the way a domain spells
   it, and search engines match how people write.

   Three places to look, in order of how deliberately the company chose the
   wording: the social-sharing name is written for exactly this purpose, the
   machine-readable name is written for machines, and the page title is written
   for people and therefore usually has a tagline we have to cut off.

   We CHECK the result against the domain before returning it, because a wrong
   name is worse than no name: it would search for a different company and
   attach their vacancies to this prospect. We use the same check the hiring-
   platform step uses, so "Kingsley Napley" and "Farrer & Co" pass against their
   own domains, while a page whose title is a parent brand or a website-builder
   default does not.

   ponytail: a domain that is an acronym of a longer name — `bsabh.com` is "BSA
   Ahmad Bin Hezeem" — fails the check and falls back to the domain, which is
   what it does today. Fixing it means matching initials, and that would let
   through far more wrong names than it would rescue right ones. */
export function companyNameFromHtml(
  html: string,
  domain: string,
): string | null {
  if (typeof html !== 'string' || html === '') return null

  const candidates: string[] = []

  const ogSiteName = html.match(
    /<meta[^>]+property\s*=\s*["']og:site_name["'][^>]+content\s*=\s*["']([^"']{2,80})["']/i,
  )
  if (ogSiteName) candidates.push(ogSiteName[1])

  const schemaName = html.match(
    /"@type"\s*:\s*"(?:Organization|LegalService|Corporation|LocalBusiness|ProfessionalService)"[\s\S]{0,400}?"name"\s*:\s*"([^"]{2,80})"/i,
  )
  if (schemaName) candidates.push(schemaName[1])

  const title = html.match(/<title[^>]*>([\s\S]{2,200}?)<\/title>/i)
  if (title) candidates.push(title[1])

  const token = companyToken(domain)
  for (const raw of candidates) {
    for (const part of splitTitle(raw)) {
      const cleaned = cleanCompanyName(part)
      if (cleaned && slugMatchesCompany(alphanumeric(cleaned), token)) {
        return cleaned
      }
    }
  }
  return null
}

/* A page title is usually "Name | Tagline", "Name - Tagline" or "Tagline —
   Name". We consider every piece, because the name is not reliably first —
   several firms we measured lead with the tagline. Longest piece first, so a
   piece that is only the first word of the brand loses to the full name. */
function splitTitle(raw: string): string[] {
  const decoded = raw
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
  const parts = decoded
    .split(/\s*[|–—•·]\s*|\s+[-]\s+|\s*:\s+/)
    .map((p) => p.trim())
    .filter((p) => p !== '')
  return [decoded, ...parts].sort((a, b) => b.length - a.length)
}

/* Strips company-form endings and leading filler that a search engine does not
   need, and that hurt an exact-phrase match. `Farrer & Co LLP` searches better
   as `Farrer & Co`. */
function cleanCompanyName(raw: string): string | null {
  const cleaned = raw
    /* Two passes, each matching a single space, rather than one pattern with a
       repeat and an optional group. Both of those can match spaces, and that
       overlap is what makes a pattern take exponentially long. `splitTitle` has
       already squashed runs of spaces, so one space is all there is anyway. */
    .replace(/^(?:welcome to|home|homepage)\s/i, '')
    .replace(/^the\s/i, '')
    /* One separator character, not `[\s,]+`. The quantified class followed by
       an alternation anchored at `$` backtracks quadratically on a long run of
       spaces that never matches, and this string comes off a fetched page. The
       trailing `.trim()` below absorbs whatever whitespace is left over. */
    .replace(
      /[\s,](?:llp|l\.l\.p\.|ltd|limited|plc|inc|incorporated|llc|gmbh|s\.a\.|pllc|p\.c\.)\.?$/i,
      '',
    )
    .replace(/\s+/g, ' ')
    .trim()
  if (cleaned.length < 2 || cleaned.length > 70) return null
  /* Must contain a letter — a title that is only punctuation or a number is
     not a name. */
  if (!/[a-z]/i.test(cleaned)) return null
  return cleaned
}

function alphanumeric(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/* The domain the company itself says is its real one (LYR-221).

   `kingsleynapley.com` serves a 200 but redirects to — and declares
   `rel=canonical` and `og:url` on — `kingsleynapley.co.uk`. Search correctly
   returned `kingsleynapley.co.uk/careers`, and `classifyHost` correctly scored
   it `other`, because on the evidence it had, a different TLD is a different
   company. The alias closes that gap without loosening the identity rule.

   Two guards keep this from becoming the brand-token match the search module
   exists to reject:

     The alias must SHARE THE BRAND TOKEN with the input domain. A canonical
     pointing at a CMS host, a CDN, or a parent brand is not an alias.

     It must be DECLARED. `bakertilly.com` publishes no canonical, so
     `bakertilly.ca` — a different member firm — is still `other`, exactly as
     it was. Nothing here infers an alias from spelling alone. */
export function canonicalDomainFromHtml(
  html: string,
  domain: string,
): string | null {
  if (typeof html !== 'string' || html === '') return null

  const declared =
    html.match(
      /<link[^>]+rel\s*=\s*["']canonical["'][^>]+href\s*=\s*["']([^"']+)["']/i,
    ) ??
    html.match(
      /<link[^>]+href\s*=\s*["']([^"']+)["'][^>]+rel\s*=\s*["']canonical["']/i,
    ) ??
    html.match(
      /<meta[^>]+property\s*=\s*["']og:url["'][^>]+content\s*=\s*["']([^"']+)["']/i,
    )
  if (!declared) return null

  const alias = normalizeDomain(declared[1])
  const input = normalizeDomain(domain)
  if (!alias || !input || alias === input) return null

  return companyToken(alias) !== '' &&
    companyToken(alias) === companyToken(input)
    ? alias
    : null
}
