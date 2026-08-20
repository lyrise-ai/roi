// ─────────────────────────────────────────────────────────────────────────────
// s1Derive — the deterministic core of the pre-flight scout (LYR-187 R2 /
// LYR-195).
//
// Pure functions only: no I/O, no provider objects, no LLM. Everything S1 has
// to *decide* rather than *read* lives here, so it can be unit tested against
// known inputs instead of against a live API. R4 of the parent card — ratios,
// counts and set differences are code — starts at this file.
//
// Every function returns null rather than a guess when the input doesn't
// support an answer. A wrong country routes every downstream scout at the
// wrong sources, which is worse than an honest 'OTHER'.
// ─────────────────────────────────────────────────────────────────────────────

export type Region = 'US' | 'UK' | 'EU' | 'GCC' | 'OTHER'

/* Strips a user-typed website down to a bare registrable hostname.
   "https://WWW.AcmeLaw.com/about?x=1" → "acmelaw.com". Returns null for
   anything that isn't plausibly a domain, so a typo fails loudly at the top of
   the scout rather than becoming a fetch of a nonsense URL. */
export function normalizeDomain(input: string): string | null {
  if (typeof input !== 'string') return null
  let value = input.trim().toLowerCase()
  if (value === '') return null

  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
  value = value.split(/[/?#]/)[0]
  value = value.replace(/^www\./, '')
  value = value.split('@').pop()
  value = value.split(':')[0]

  /* Validated label by label rather than with one regex over the whole name.
     The obvious pattern for this — a quantified group of quantified groups —
     backtracks catastrophically on a long hostile string, and this function
     sits on a trust boundary: `domainInput` is whatever the prospect typed.
     Splitting first makes the check linear and unfoolable. */
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

/* ccTLD → ISO 3166-1 alpha-2. Only the countries we actually route on: the
   GCC (the deliberately over-weighted segment in the coverage test), the
   US/UK/EU core, and the handful of others that show up in professional
   services. A ccTLD is strong evidence of country but not proof — a UK firm
   can sit on a .com — so callers treat this as medium confidence and let a
   real enrichment record override it. */
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

/* Generic TLDs carry no country signal at all. Returning null for these is the
   point: it sends the caller to the page text instead of letting ".com" quietly
   mean "American", which would misroute most of the GCC book. */
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

  /* Second-level ccTLDs — co.uk, com.sa, ae.org and friends. The country lives
     one label further left than usual. */
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

/* The routing decision every other scout depends on. 'OTHER' is a real answer,
   not a failure: it means "use default sources and mark confidence low", which
   is what the card asks for when country is undeterminable. */
export function regionForCountry(country: string | null): Region {
  if (!country) return 'OTHER'
  const code = country.trim().toUpperCase()
  if (code === 'US') return 'US'
  if (code === 'GB' || code === 'UK') return 'UK'
  if (GCC.has(code)) return 'GCC'
  if (EU.has(code)) return 'EU'
  return 'OTHER'
}

/* The bands the enrichment providers already use (PDL's `size` field is
   exactly this vocabulary), so a provider band passes through untouched and a
   raw headcount lands in the same buckets. One vocabulary downstream. */
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

/* Providers spell their bands inconsistently — "11-50", "11 - 50", "11to50".
   Anything that doesn't reduce to a known band is dropped rather than coerced
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

/* ICP-first vocabulary. The order matters: the first vertical with a keyword
   hit wins, so the more specific terms sit above the general ones — a firm
   describing both "practice areas" and "advisory" is a law firm that also
   advises, not a consultancy.

   These feed S3's extraction vocabulary as well as S2's source choice, which
   is why a wrong answer is expensive: hunting a law firm's site for "service
   lines" instead of "practice areas" returns vague extraction. */
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

/* Keyword match, not inference. If the text doesn't say it, we don't know it —
   which is a supported answer, and the interview asks instead. */
export function verticalFromText(text: string): string | null {
  if (typeof text !== 'string' || text.trim() === '') return null
  const haystack = text.toLowerCase()
  for (const { vertical, keywords } of VERTICAL_KEYWORDS) {
    if (keywords.some((keyword) => haystack.includes(keyword))) return vertical
  }
  return null
}

/* Country names as they appear in a footer address, mapped to ISO codes. Used
   only when the TLD is generic. Longest names are checked first so "United
   Arab Emirates" can't be shadowed by a shorter substring match. */
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

/* City names that pin a country hard enough to be worth checking when no
   country name appears — a footer often reads "Dubai, UAE" but just as often
   reads only "Dubai". Deliberately short: only cities where the mapping is
   unambiguous for professional-services firms. */
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

/* Every distinct country the text mentions, by name or by unambiguous city.
   Exported because ambiguity is the interesting signal, not an inconvenience:
   a footer naming six countries is a multi-office firm, and knowing that is
   what stops us picking one at random. */
export function countryCandidates(text: string): string[] {
  if (typeof text !== 'string' || text.trim() === '') return []

  /* Every run of non-alphanumerics becomes one space, and the result is padded
     at both ends. A whole-word match is then a plain substring search for the
     space-wrapped term — no per-term RegExp construction, and no way for "uae"
     to fire inside "nuance" or "ksa" inside a hashed asset filename. Multi-word
     names survive because punctuation between their words collapses to the
     single space they're written with. */
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

/* One country named, or none. Ambiguity resolves to null.
   This rule exists because of two real misreads on live sites: morganlewis.com
   (Philadelphia) resolved to AE and hlbhamt.com (Dubai) resolved to IN, both
   because a global office list in the footer was scanned first-match-wins. A
   confidently wrong country is far worse than an absent one — it routes every
   downstream scout at the wrong sources, while null routes to 'OTHER' at low
   confidence and lets the interview fill the gap. */
export function countryFromText(text: string): string | null {
  const candidates = countryCandidates(text)
  return candidates.length === 1 ? candidates[0] : null
}

/* Schema.org PostalAddress, as JSON-LD or as a microdata attribute. This is the
   company declaring its own address in machine-readable form, so it beats any
   amount of prose — and a multi-office firm still publishes exactly one
   `addressCountry` for its headquarters. Highest-precision signal available
   without an enrichment provider. */
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

  /* Several distinct addressCountry values means several offices marked up,
     with no way to tell which is the HQ. Same rule as prose: ambiguous is
     null. */
  return found.size === 1 ? [...found][0] : null
}

/* "Registered in England and Wales", "registered office ... Dubai". A
   registration statement names the country of incorporation specifically,
   which is what we want, rather than wherever the firm happens to have a desk. */
export function countryFromRegistration(text: string): string | null {
  if (typeof text !== 'string' || text === '') return null
  const match = text
    .toLowerCase()
    .match(/registered\s+(?:in|office[^.]{0,60}?\bin)\s+([a-z][a-z ,&]{2,40})/)
  if (!match) return null
  return countryFromText(match[1])
}

/* Reduces fetched HTML to the text a human would read, for keyword matching.
   Script and style bodies go first — a bundled JS blob is full of words that
   mean nothing about the business and would produce false vertical hits. */
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
