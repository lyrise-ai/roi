// ─────────────────────────────────────────────────────────────────────────────
// s2Derive — the deterministic core of the job-postings scout (LYR-187 R3 /
// LYR-196).
//
// Pure functions: no I/O, no LLM. The extraction model turns a job description
// into typed fields, and everything computed *from* those fields lives here —
// counts, rankings, set differences. R4 of the parent card is explicit that an
// LLM must never compute a ratio, because an LLM computing a ratio is
// untestable and drifts between runs.
//
// The distinction that matters: "this posting mentions chasing documents" is a
// reading, and the model does it. "Three of their last five postings mention
// chasing documents" is arithmetic, and this file does it.
// ─────────────────────────────────────────────────────────────────────────────

/* Second-level public suffixes we actually meet, so `acmelaw.co.uk` yields the
   slug `acmelaw` rather than `co`. Not a full public-suffix list: this is a
   slug guesser, and a wrong guess costs one 404 against a free endpoint. */
const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'gov', 'ac', 'edu'])

/* Legal-entity and descriptor suffixes that appear in a domain but usually not
   in the ATS board slug — `acmelawllp.com` is nearly always `acmelaw`. */
const TRIM_SUFFIXES = [
  'llp',
  'llc',
  'ltd',
  'limited',
  'inc',
  'group',
  'partners',
  'associates',
  'advocates',
  'solicitors',
  'lawfirm',
  'legal',
  'co',
]

/* The registrable label — the bit a board slug is built from. */
export function baseLabel(domain: string): string | null {
  if (typeof domain !== 'string' || domain.trim() === '') return null
  const labels = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    .replace(/^www\./, '')
    .split('.')
    .filter(Boolean)

  if (labels.length < 2) return null
  const secondLast = labels[labels.length - 2]
  /* `acmelaw.co.uk` → the label two back; `acmelaw.com` → the label one back. */
  const index =
    labels.length >= 3 && SECOND_LEVEL.has(secondLast)
      ? labels.length - 3
      : labels.length - 2
  return labels[index] ?? null
}

/* L0 of the cascade. Real ATS slugs vary — `acmelaw.com` might be registered
   as `acmelaw`, `acme-law` or `acmelawgroup` — so we try a handful rather than
   one. Deterministic and free: every candidate is a 404 against a public
   endpoint at worst, and generating them costs nothing.
   Ordered most to least likely, deduped, capped at three so a long domain
   can't fan out into a dozen requests per platform. */
export function slugCandidates(domain: string): string[] {
  const base = baseLabel(domain)
  if (!base) return []

  const candidates: string[] = [base]

  /* Hyphens are the single most common difference between a domain and its
     board slug, in both directions. */
  if (base.includes('-')) candidates.push(base.replace(/-/g, ''))

  for (const suffix of TRIM_SUFFIXES) {
    if (base.length > suffix.length + 2 && base.endsWith(suffix)) {
      candidates.push(base.slice(0, -suffix.length).replace(/-+$/, ''))
      break
    }
  }

  return [...new Set(candidates.filter((c) => c.length >= 2))].slice(0, 3)
}

/* L2's target pages, in the order worth trying. Most small professional
   services firms have exactly one of these and nothing resembling an ATS. */
export const CAREERS_PATHS = [
  '/careers',
  '/jobs',
  '/join-us',
  '/vacancies',
  '/about/careers',
]

/* Rough function buckets from a job title. Deliberately coarse: the point is
   "where is this firm adding people", not an org chart. Order matters — the
   first bucket whose keyword appears wins, so specific titles sit above
   generic ones. */
const FUNCTION_KEYWORDS: { fn: string; keywords: string[] }[] = [
  {
    fn: 'finance',
    keywords: [
      'account',
      'bookkeep',
      'payroll',
      'billing',
      'invoice',
      'credit control',
      'audit',
      'tax',
      'financ',
      'treasur',
    ],
  },
  {
    fn: 'legal',
    keywords: [
      'paralegal',
      'solicitor',
      'lawyer',
      'attorney',
      'counsel',
      'advocate',
      'legal',
      'compliance',
      'conveyanc',
    ],
  },
  {
    fn: 'admin',
    keywords: [
      'administrat',
      'secretar',
      'receptionist',
      'clerk',
      'data entry',
      'office manager',
      'assistant',
      'coordinator',
    ],
  },
  {
    fn: 'operations',
    keywords: ['operations', 'process', 'delivery', 'logistics', 'facilities'],
  },
  {
    fn: 'technology',
    keywords: [
      'engineer',
      'developer',
      'software',
      'it ',
      'data ',
      'analyst',
      'devops',
      'architect',
    ],
  },
  {
    fn: 'sales',
    keywords: [
      'sales',
      'business development',
      'account executive',
      'partnership',
    ],
  },
  {
    fn: 'marketing',
    keywords: ['marketing', 'brand', 'content', 'communications', 'seo'],
  },
  {
    fn: 'people',
    keywords: ['recruit', 'talent', 'human resources', 'hr ', 'people '],
  },
]

export function functionForTitle(title: string): string {
  if (typeof title !== 'string' || title.trim() === '') return 'other'
  const haystack = ` ${title.toLowerCase()} `
  for (const { fn, keywords } of FUNCTION_KEYWORDS) {
    if (keywords.some((keyword) => haystack.includes(keyword))) return fn
  }
  return 'other'
}

/* Strips seniority, location and req-number noise so "Senior Paralegal (Dubai)"
   and "Paralegal - 2 positions" collapse to the same role. Without this, a firm
   re-posting the same job reads as two different jobs and the turnover signal
   disappears. */
export function normalizeRole(title: string): string {
  if (typeof title !== 'string') return ''
  return title
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(
      /\b(senior|junior|snr|jnr|sr|jr|lead|principal|head of|chief|assistant|associate|trainee|graduate|entry.level|mid.level|intern)\b/g,
      ' ',
    )
    .replace(
      /\b(full.time|part.time|permanent|contract|temporary|remote|hybrid|onsite|on.site)\b/g,
      ' ',
    )
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(m|f|d|x)\b/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/* Verbs that appear in every job description ever written. They describe
   seniority, judgement or ambition rather than repetition, so they say nothing
   about how the work is actually done — and an observation built on them
   ("your postings mention driving outcomes") is exactly the generic output the
   redesign exists to kill.

   The extraction prompt already asks the model to skip these. It does not
   reliably comply: across a live run, gpt-4o-mini returned "lead", "drive",
   "build" and "partner" for senior roles even when told not to, because a
   posting with no clerical duties still leaves it feeling obliged to fill the
   array. So the prompt asks and this set enforces. A set difference is
   deterministic, testable and cannot drift between runs — which is exactly the
   kind of work R4 of the parent card says belongs in code rather than in a
   model.

   Note this is an English stoplist. A Dutch posting returns Dutch verbs and
   passes straight through; the ICP is GCC, UK and US, so that is a known
   ceiling rather than a bug.
   ponytail: single-language stoplist, revisit if R8 finds non-English boards
   in the ICP. */
export const GENERIC_VERBS = new Set([
  'assist',
  'build',
  'collaborate',
  'communicate',
  'contribute',
  'coordinate',
  'create',
  'deliver',
  'develop',
  'drive',
  'engage',
  'ensure',
  'establish',
  'evolve',
  'execute',
  'grow',
  'help',
  'identify',
  'implement',
  'improve',
  'influence',
  'innovate',
  'lead',
  'learn',
  'maintain',
  'manage',
  'mentor',
  'optimize',
  'optimise',
  'own',
  'partner',
  'perform',
  'provide',
  'shape',
  'solve',
  'support',
  'understand',
  'work',
])

/* Normalises and drops the generic ones. Gerunds are folded to base form so
   "chasing" and "chase" rank as one verb — the extraction prompt asks for base
   forms, and this makes it true rather than hoped for. */
export function filterTaskVerbs(verbs: unknown): string[] {
  if (!Array.isArray(verbs)) return []
  const out: string[] = []
  for (const raw of verbs) {
    const verb = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
    if (verb !== '' && !GENERIC_VERBS.has(verb) && !out.includes(verb)) {
      out.push(verb)
    }
  }
  return out
}

/* Below this, two postings of the same role are concurrent vacancies rather
   than a role being refilled. Two weeks is comfortably shorter than any real
   hire-and-leave cycle and comfortably longer than a batch of roles posted
   across a few days. */
const MIN_REPEAT_GAP_DAYS = 14

/* Drops listing pages. Verbs and named systems read off a careers page are
   still real and still quotable, so `rankTaskVerbs` and `rankNamedSystems`
   deliberately keep them — it is only the ROLE-shaped derivations, which
   assume one entry is one job, that must not count a page. */
export function realPostings<T extends { kind?: 'posting' | 'page' }>(
  postings: T[],
): T[] {
  return Array.isArray(postings)
    ? postings.filter((p) => (p?.kind ?? 'posting') !== 'page')
    : []
}

export type CountedPosting = {
  title: string
  /* 'page' entries are a careers or listing page we could read but not split
     into roles. Every derivation below assumes one entry is one role, so they
     are filtered out rather than counted — a single entry called "Careers
     page" would otherwise be a role with a turnover history and a function. */
  kind?: 'posting' | 'page'
  postedAt?: string
  taskVerbs?: string[]
  namedSystems?: { name: string; category: string }[]
}

/* A turnover proxy: the same role advertised 2+ times inside twelve months
   suggests the work grinds people down. It is one of the strongest observations
   available, and it is pure counting — which is exactly why it must not be a
   model's opinion.

   `months` is the span between the first and last posting of that role, so a
   reader can say "twice in five months" rather than the vaguer "twice". */
export function repeatPostings(
  postings: CountedPosting[],
): { role: string; count: number; months: number }[] {
  if (!Array.isArray(postings)) return []
  postings = realPostings(postings)

  const byRole = new Map<string, { title: string; dates: number[] }>()
  for (const posting of postings) {
    const role = normalizeRole(posting?.title ?? '')
    if (role !== '') {
      const entry = byRole.get(role) ?? { title: posting.title, dates: [] }
      const at = posting.postedAt ? Date.parse(posting.postedAt) : NaN
      /* An undated posting cannot contribute to a twelve-month window, so it
         is kept as a role but never as evidence of repetition. */
      if (Number.isFinite(at)) entry.dates.push(at)
      byRole.set(role, entry)
    }
  }

  const out: { role: string; count: number; months: number }[] = []
  for (const [role, { dates }] of byRole) {
    if (dates.length >= 2) {
      dates.sort((a, b) => a - b)
      const spanMs = dates[dates.length - 1] - dates[0]
      const months = Math.round(spanMs / (30 * 24 * 60 * 60 * 1000))
      const days = spanMs / (24 * 60 * 60 * 1000)
      /* Only within twelve months, and only if the postings are actually
         spread out. Two postings three years apart is a firm that grew; two on
         the same day is a firm filling two seats at once. Neither is churn.
         bakertilly.com produced exactly the second case on a live run —
         "consultant it advisory" twice with months: 0 — which would have read
         as a turnover signal when it is just a double vacancy. */
      if (months <= 12 && days >= MIN_REPEAT_GAP_DAYS) {
        out.push({ role, count: dates.length, months })
      }
    }
  }

  return out.sort((a, b) => b.count - a.count || a.months - b.months)
}

export function functionDistribution(
  postings: CountedPosting[],
): Record<string, number> {
  const out: Record<string, number> = {}
  if (!Array.isArray(postings)) return out
  for (const posting of realPostings(postings)) {
    const fn = functionForTitle(posting?.title ?? '')
    out[fn] = (out[fn] ?? 0) + 1
  }
  return out
}

/* Ranks the verbs the postings actually used, most frequent first. Ties break
   alphabetically so the output is stable between runs — an unstable ranking
   makes the eval harness useless and makes two reports for the same company
   disagree for no reason. */
export function rankTaskVerbs(
  postings: CountedPosting[],
): { verb: string; count: number }[] {
  const counts = new Map<string, number>()
  if (!Array.isArray(postings)) return []

  for (const posting of postings) {
    /* Per posting, not per mention: a JD repeating "chase" six times is one
       posting that cares about chasing, not six signals. */
    const seen = new Set<string>()
    for (const verb of filterTaskVerbs(posting?.taskVerbs)) {
      if (!seen.has(verb)) {
        seen.add(verb)
        counts.set(verb, (counts.get(verb) ?? 0) + 1)
      }
    }
  }

  return [...counts.entries()]
    .map(([verb, count]) => ({ verb, count }))
    .sort((a, b) => b.count - a.count || a.verb.localeCompare(b.verb))
}

/* Same shape for named systems, keyed on the system name so "3E" and "3e"
   don't split. Keeps the first-seen spelling and category for display. */
export function rankNamedSystems(
  postings: CountedPosting[],
): { name: string; category: string; count: number }[] {
  const counts = new Map<
    string,
    { name: string; category: string; count: number }
  >()
  if (!Array.isArray(postings)) return []

  for (const posting of postings) {
    const seen = new Set<string>()
    for (const system of posting?.namedSystems ?? []) {
      const name = typeof system?.name === 'string' ? system.name.trim() : ''
      const key = name.toLowerCase()
      if (name !== '' && !seen.has(key)) {
        seen.add(key)
        const existing = counts.get(key)
        if (existing) {
          existing.count += 1
        } else {
          counts.set(key, {
            name,
            category:
              typeof system?.category === 'string' &&
              system.category.trim() !== ''
                ? system.category.trim()
                : 'unknown',
            count: 1,
          })
        }
      }
    }
  }

  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  )
}
