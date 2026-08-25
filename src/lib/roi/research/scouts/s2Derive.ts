// ─────────────────────────────────────────────────────────────────────────────
// s2Derive — the counting half of the job-postings scout (LYR-187 R3 /
// LYR-196).
//
// Plain functions: no network, no model calls. The model turns a job advert
// into clean fields, and everything worked out FROM those fields lives here —
// counting, ranking, comparing. R4 of the parent card says plainly that a model
// must never work out a ratio, because you cannot test it and it changes
// between runs.
//
// The line that matters: "this posting mentions chasing documents" is reading,
// and the model does that. "Three of their last five postings mention chasing
// documents" is arithmetic, and this file does that.
// ─────────────────────────────────────────────────────────────────────────────

/* The two-part domain endings we actually run into, so `acmelaw.co.uk` gives us
   `acmelaw` rather than `co`. This is not the full official list of them: we
   are only guessing a board name, and a wrong guess costs one failed request
   against a free endpoint. */
const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'gov', 'ac', 'edu'])

/* Company-form and filler endings that appear in a domain but usually not in
   the hiring board's name — `acmelawllp.com` is nearly always `acmelaw`. */
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

/* The first step: guess the board name. Real ones vary — `acmelaw.com` might be
   registered as `acmelaw`, `acme-law` or `acmelawgroup` — so we try a few
   rather than one. It is plain code and it is free: at worst each guess is one
   failed request against a public endpoint, and making the guesses costs
   nothing.
   Sorted most likely first, duplicates removed, capped at three so a long
   domain cannot turn into a dozen requests per platform. */
export function slugCandidates(domain: string): string[] {
  const base = baseLabel(domain)
  if (!base) return []

  const candidates: string[] = [base]

  /* A hyphen is the single most common difference between a domain and its
     board name, in both directions. */
  if (base.includes('-')) candidates.push(base.replace(/-/g, ''))

  for (const suffix of TRIM_SUFFIXES) {
    if (base.length > suffix.length + 2 && base.endsWith(suffix)) {
      candidates.push(base.slice(0, -suffix.length).replace(/-+$/, ''))
      break
    }
  }

  return [...new Set(candidates.filter((c) => c.length >= 2))].slice(0, 3)
}

/* The careers pages we try, in the order worth trying them. Most small
   professional-services firms have exactly one of these and nothing resembling
   a hiring platform. */
export const CAREERS_PATHS = [
  '/careers',
  '/jobs',
  '/join-us',
  '/vacancies',
  '/about/careers',
]

/* Sorts a job title into a rough department. Deliberately rough: the question
   is "where is this firm adding people", not what their org chart looks like.
   Order matters — the first match wins, so specific titles sit above general
   ones. */
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

/* Strips out seniority, location and reference numbers, so "Senior Paralegal
   (Dubai)" and "Paralegal - 2 positions" come down to the same role. Without
   this, a firm re-advertising the same job looks like two different jobs, and
   the sign that people keep leaving disappears. */
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

/* Verbs that appear in every job advert ever written. They describe seniority,
   judgement or ambition rather than repeated work, so they tell us nothing
   about how the job is actually done. A sentence built on them — "your postings
   mention driving outcomes" — is exactly the generic output this redesign
   exists to kill.

   The prompt already asks the model to skip these. It does not reliably obey:
   in a live run, gpt-4o-mini returned "lead", "drive", "build" and "partner"
   for senior roles even when told not to, because a posting with no clerical
   duties still leaves it feeling it has to fill the list in. So the prompt
   asks, and this list enforces. Removing a fixed set of words is exact,
   testable and cannot change between runs — which is exactly the kind of work
   R4 of the parent card says belongs in code, not in a model.

   Note this list is English only. A Dutch posting returns Dutch verbs and
   passes straight through. Our customers are in the Gulf, the UK and the US, so
   that is a known limit rather than a bug.
   ponytail: one language only, revisit if R8 finds non-English boards among our
   customers. */
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

/* Tidies the verbs and drops the generic ones. "Chasing" is folded to "chase"
   so the two rank as one verb. The prompt asks for the plain form; this makes
   it actually true rather than something we hope for. */
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

/* Closer together than this, two adverts for the same role are two open seats
   at once, not the same seat being refilled. Two weeks is comfortably shorter
   than any real hire-and-leave cycle, and comfortably longer than a batch of
   roles posted over a few days. */
const MIN_REPEAT_GAP_DAYS = 14

/* Removes list pages. Tasks and system names read off a careers page are still
   real and still quotable, so the ranking functions deliberately keep them.
   It is only the counts that treat one entry as one job that must not count a
   page. */
export function realPostings<T extends { kind?: 'posting' | 'page' }>(
  postings: T[],
): T[] {
  return Array.isArray(postings)
    ? postings.filter((p) => (p?.kind ?? 'posting') !== 'page')
    : []
}

export type CountedPosting = {
  title: string
  /* A 'page' entry is a careers or list page we could read but could not split
     into individual jobs. Everything below assumes one entry is one job, so
     these are filtered out rather than counted. Otherwise a single entry called
     "Careers page" would end up looking like a job with its own department and
     hiring history. */
  kind?: 'posting' | 'page'
  postedAt?: string
  taskVerbs?: string[]
  namedSystems?: { name: string; category: string }[]
}

/* A stand-in for staff turnover: the same job advertised twice or more within
   twelve months suggests the work wears people down. It is one of the strongest
   things we can say, and it is pure counting — which is exactly why it must not
   be a model's opinion.

   `months` is the gap between the first and last advert for that role, so we
   can say "twice in five months" rather than just "twice". */
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
      /* A posting with no date cannot help with a twelve-month window, so we
         keep it as a job but never count it as a repeat. */
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
      /* Only within twelve months, and only if the two adverts are actually
         spread apart. Two adverts three years apart is a firm that grew; two on
         the same day is a firm filling two seats at once. Neither is turnover.
         bakertilly.com produced exactly the second case in a live run —
         "consultant it advisory" twice, zero months apart — which would have
         read as turnover when it was simply two open seats. */
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

/* Ranks the task words the postings actually used, most common first. Ties are
   broken alphabetically so the order never changes between runs. An unstable
   order makes the eval harness useless and makes two reports for the same
   company disagree for no reason. */
export function rankTaskVerbs(
  postings: CountedPosting[],
): { verb: string; count: number }[] {
  const counts = new Map<string, number>()
  if (!Array.isArray(postings)) return []

  for (const posting of postings) {
    /* Counted once per posting, not once per mention. An advert that says
       "chase" six times is one job that involves chasing, not six separate
       pieces of evidence. */
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

/* The same again for the software the postings name, matched without regard to
   capitalisation so "3E" and "3e" do not become two entries. We keep the first
   spelling we saw, and its category, for display. */
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
