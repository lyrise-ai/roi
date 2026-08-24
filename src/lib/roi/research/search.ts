// ─────────────────────────────────────────────────────────────────────────────
// research/search — find where a company's job postings actually live
// (LYR-187 R9 / LYR-212).
//
// S2 used to guess: guess the ATS board slug from the domain, then guess
// careers paths. Measured against 22 real professional-services firms, that
// produced usable postings for 1 of them. The careers pages of most law and
// accountancy firms are recruitment-*marketing* pages — no vacancy list, no
// links to job detail pages, and every plausible deeper path 404s.
//
// Searching first finds a vacancy URL for 20 of the same 22. The postings were
// always there; we were looking in the wrong place with the wrong method.
//
// This module does the finding. It does not fetch — discovered URLs go through
// the shared artifact cache like everything else.
//
// ── The rule that matters most in this file ──────────────────────────────────
//
// A search result is a GUESS about identity, and acting on the wrong guess is
// worse than finding nothing: it would attach another company's job postings to
// this prospect and state them as fact. Real examples from the measurement run:
//
//   stalawfirm.com  →  stblaw.wd1.myworkdayjobs.com   (Simpson Thacher, not STA)
//   tamimi.com      →  tamimicontracting.com          (a contractor, not the law firm)
//   farrer.co.uk    →  farrercapital.com              (Farrer Capital, not Farrer & Co)
//   bakertilly.com  →  bakertilly.ca                  (a different member firm)
//
// So identity is checked structurally, and anything that does not clearly
// belong to this company is dropped. We would rather return nothing.
// ─────────────────────────────────────────────────────────────────────────────

import { webSearch as providerSearch } from '@/src/lib/roi/tools/webSearch'

export type SearchHit = { url: string; title: string }

/* How a discovered URL relates to the company we were asked about.
     own     — the company's own domain, or a subdomain of it
     ats     — a known applicant-tracking host whose board slug matches
     blocked — LinkedIn, or a scraped-content aggregator
     other   — cannot be tied to this company; dropped */
export type HostClass = 'own' | 'ats' | 'blocked' | 'other'

/* Applicant-tracking hosts worth trusting as first-party. Workday leads this
   list on merit: it appeared for 5 of 22 firms in the measurement run, more
   than every other platform combined, and S2's direct-probe tier does not try
   it because its board URLs are unguessable (`{tenant}.wd{N}.myworkdayjobs.com`).
   Search finds them; guessing never could. */
const ATS_HOSTS = [
  'myworkdayjobs.com',
  'talentera.com',
  'teamtailor.com',
  'allhires.com',
  'greenhouse.io',
  'lever.co',
  'ashbyhq.com',
  'workable.com',
  'recruitee.com',
  'personio.de',
  'smartrecruiters.com',
  'bamboohr.com',
  'icims.com',
  'taleo.net',
  'jobvite.com',
  'breezy.hr',
]

/* Never fetched, from any path, for any reason.

   LinkedIn is a legal decision, not a quality one: Proxycurl was shut down in
   July 2025 after LinkedIn's federal lawsuit over unauthorised scraping, and we
   sell to law firms. It dominated organic results in testing, so this list is
   load-bearing rather than theoretical — and it is a filter rather than a
   prompt instruction precisely because a filter cannot be talked past.

   The rest are scraped-content aggregators: undated, frequently stale, and
   often wrong about which company a posting belongs to. A fact whose sourceUrl
   points at one of these is worse than no fact, because it looks citable. */
const BLOCKED_HOSTS = [
  'linkedin.com',
  'lnkd.in',
  'indeed.com',
  'glassdoor.com',
  'glassdoor.co.uk',
  'ziprecruiter.com',
  'monster.com',
  'simplyhired.com',
  'jobsarchives.com',
  'dubaicareer.ae',
  'dubailivejobs.com',
  'gulftalent.com',
  'naukrigulf.com',
  'jooble.org',
  'trabajo.org',
  'talent.com',
  'careerjet.com',
  'jobrapido.com',
]

/* Paths that look like a vacancy listing or a job detail page, as opposed to a
   company's About page that merely mentions hiring. */
const VACANCY_PATH =
  /\/(jobs?|vacanc|career|opportunit|position|opening|apply|job-application|recruit)/i

/* Accepts both a full URL and a bare domain, because callers pass both — the
   discovered result is a URL, the company is a domain. Returning '' for a bare
   domain (which is what `new URL()` alone does, since it throws without a
   scheme) silently disabled the own-domain check entirely. */
export function hostOf(input: string): string {
  if (typeof input !== 'string' || input.trim() === '') return ''
  const raw = input.trim()
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    const host = raw
      .toLowerCase()
      .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
      .split('/')[0]
      .split('?')[0]
      .replace(/^www\./, '')
    /* Must still look like a hostname, so junk from a search result cannot be
       mistaken for one. Validated label by label rather than with one regex:
       the natural pattern is a quantified group of quantified groups, which
       backtracks catastrophically, and this input comes from a search API. */
    const labels = host.split('.')
    if (labels.length < 2) return ''
    const ok = labels.every(
      (label) =>
        label.length > 0 &&
        label.length <= 63 &&
        !label.startsWith('-') &&
        !label.endsWith('-') &&
        [...label].every(
          (c) => (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c === '-',
        ),
    )
    return ok ? host : ''
  }
}

/* The registrable-ish label a board slug should resemble. `acmelaw.co.uk` and
   `acmelaw.com` both reduce to `acmelaw`. */
export function companyToken(domain: string): string {
  const host = hostOf(domain) || String(domain ?? '').toLowerCase()
  const labels = host.split('.').filter(Boolean)
  if (labels.length === 0) return ''
  const second = labels[labels.length - 2]
  const generic = new Set(['co', 'com', 'org', 'net', 'gov', 'ac', 'edu'])
  const index =
    labels.length >= 3 && generic.has(second)
      ? labels.length - 3
      : labels.length - 2
  return (labels[index] ?? labels[0]).replace(/[^a-z0-9]/g, '')
}

/* Does this ATS board plausibly belong to this company?

   Prefix matching with a tight length tolerance, not substring matching.
   Substring would accept `stblaw` for `stalawfirm` on the shared "law", which
   is how you end up publishing Simpson Thacher's vacancies to an STA Law Firm
   prospect. Requiring one to be a PREFIX of the other, within a few
   characters, accepts the real pairs seen in measurement — bakertilly/
   bakertilly, morganlewis/morganlewis, rsm/rsmus, tamimi/tamimi — and rejects
   stblaw/stalawfirm and pkfsmithcooper/pkfuae.

   ponytail: a shared global brand across member firms (bdo/bdoau) can still
   pass. Tighten only if the coverage re-run shows it attaching the wrong
   country's postings. */
export function slugMatchesCompany(slug: string, token: string): boolean {
  const a = String(slug ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
  const b = String(token ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
  if (a.length < 3 || b.length < 3) return false
  if (a === b) return true
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a]
  if (longer.length - shorter.length > 3) return false
  return longer.startsWith(shorter)
}

export function classifyHost(
  url: string,
  domain: string,
  /* Hosts the company itself declared equivalent to `domain` — see
     `canonicalDomainFromHtml`. Never inferred here: this function is given
     them or it does without. */
  aliases: string[] = [],
): HostClass {
  const host = hostOf(url)
  if (host === '') return 'other'

  if (BLOCKED_HOSTS.some((b) => host === b || host.endsWith(`.${b}`))) {
    return 'blocked'
  }

  /* The company's own domain, or a subdomain of it. `careers.osborneclarke.com`
     and `jobs.rsmus.com` are the company; `bakertilly.ca` is not, and a plain
     brand-name match would have accepted it.

     Aliases extend this to a domain the company REDIRECTS to and names in its
     own `rel=canonical` — `kingsleynapley.com` serves `kingsleynapley.co.uk`,
     so its real careers page was scoring `other` and being dropped. This stays
     safe precisely because the alias is read off the company's own markup
     rather than derived from the brand token: `bakertilly.com` declares no
     canonical, so `bakertilly.ca` is still rejected, which is the wrong-firm
     case this module exists to prevent. */
  const own = hostOf(domain)
  const owned = [own, ...aliases.map(hostOf)].filter((h) => h !== '')
  if (owned.some((o) => host === o || host.endsWith(`.${o}`))) return 'own'

  const ats = ATS_HOSTS.find((a) => host === a || host.endsWith(`.${a}`))
  if (ats) {
    const slug = host.slice(0, host.length - ats.length).split('.')[0]
    return slugMatchesCompany(slug, companyToken(domain)) ? 'ats' : 'other'
  }

  return 'other'
}

/* A vacancy page names itself in the PATH (`/careers`) or in the SUBDOMAIN
   (`careers.bdo.co.uk`). Checking only the path dropped `careers.bdo.co.uk` —
   classified `own`, exactly the right page — because its pathname is bare `/`.
   That was one of the six zero-yield domains in the LYR-221 measurement. */
export function isVacancyUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (VACANCY_PATH.test(parsed.pathname)) return true
    const label = parsed.hostname
      .toLowerCase()
      .replace(/^www\./, '')
      .split('.')[0]
    return VACANCY_PATH.test(`/${label}`)
  } catch {
    return false
  }
}

/* Ranked, filtered, deduped. An ATS board outranks the company's own site
   because it is where dated, individual postings live; the company's own
   careers page is usually prose. Everything unattributable is gone by here —
   `blocked` and `other` never survive, so no caller can accidentally fetch
   LinkedIn or another company's board. */
export function rankHits(
  hits: SearchHit[],
  domain: string,
  limit = 4,
  aliases: string[] = [],
): SearchHit[] {
  if (!Array.isArray(hits)) return []
  const seen = new Set<string>()
  const scored: { hit: SearchHit; score: number }[] = []

  for (const hit of hits) {
    const url = typeof hit?.url === 'string' ? hit.url : ''
    const cls = url === '' ? 'other' : classifyHost(url, domain, aliases)
    /* A non-vacancy page on the company's own domain is usually the About page
       and carries no postings; on an ATS host the root IS the board. */
    const keep =
      url !== '' &&
      !seen.has(url) &&
      (cls === 'ats' || (cls === 'own' && isVacancyUrl(url)))

    if (url !== '') seen.add(url)
    if (keep) {
      scored.push({
        hit: { url, title: hit.title ?? '' },
        score: cls === 'ats' ? 2 : 1,
      })
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.hit)
}

/* Tight because S2 runs inside a 20s budget and the cascade may try two
   engines. The provider layer's own default is 15s, for the older ROI agent
   which has no such ceiling. */
const SEARCH_TIMEOUT_MS = 6_000

/* The engines, their keys, their failover and their error handling all live in
   `tools/webSearch` — this is the only place that used to carry a second copy
   of them, and the two drifted (LYR-221). All this does is narrow the rich
   provider shape to the {url, title} pairs the scouts rank on; the snippet and
   the generated answer are deliberately dropped, because a scout must read the
   page itself rather than trust a search engine's summary of it. */
export async function webSearch(
  query: string,
  limit = 8,
): Promise<SearchHit[]> {
  try {
    const { results } = await providerSearch(query, limit, SEARCH_TIMEOUT_MS)
    return results
      .map((r) => ({
        url: String(r?.url ?? ''),
        title: String(r?.title ?? ''),
      }))
      .filter((r) => r.url !== '')
  } catch {
    /* A search outage is a miss, not a failed run. */
    return []
  }
}

/* The query that found `tamimi.talentera.com` on the first attempt.

   `companyName` is S1's — the firm's name as it writes it. It is optional and
   the domain-token fallback below is the original behaviour, so this tier still
   runs when S1 found nothing; but the name is worth threading three signatures
   for, because the token is what was breaking the search. Measured over the
   25-domain set (LYR-221): `"gowlingwlg"` returned a German packaging company
   four times and `"farrer"` returned six unrelated US firms, both scoring zero
   usable hits. `"Gowling WLG"` and `"Farrer & Co"` scored four each. Search
   engines match how people write a name, and nobody writes a hostname. */
export function discoveryQuery(
  domain: string,
  vertical?: string,
  companyName?: string,
): string {
  const subject = usableName(companyName) ?? subjectFromDomain(domain)
  return `"${subject}" careers current vacancies job openings${vertical ? ` ${vertical}` : ''}`
}

function usableName(companyName?: string): string | null {
  if (typeof companyName !== 'string') return null
  const trimmed = companyName.trim().replace(/\s+/g, ' ')
  /* Quoted into the query, so a stray quote would break the phrase match. */
  return trimmed.length >= 2 && trimmed.length <= 70 && !trimmed.includes('"')
    ? trimmed
    : null
}

function subjectFromDomain(domain: string): string {
  const name = companyToken(domain).replace(/([a-z])([A-Z])/g, '$1 $2')
  const pretty = hostOf(domain).split('.')[0].replace(/-/g, ' ')
  return pretty.length >= name.length ? pretty : name
}

/* Job-detail links on a page we already fetched.

   A discovered URL is usually a LISTING — a board index or a careers page that
   links to the roles rather than describing them. Measured across 22 firms, 10
   returned exactly one "posting" that was really a listing, and 8 of those
   yielded no task verbs at all: we were fetching the page that names the jobs
   and never opening the jobs. This closes that gap.

   Reads both HTML (`href="..."`) and markdown (`](...)`), because the artifact
   cache returns HTML from a plain fetch and markdown from Firecrawl, and a
   caller should not have to know which tier produced the bytes.

   Same host only. A careers page links to LinkedIn, to the ATS, to the press
   page and to a cookie policy; following off-host would walk straight into the
   sources this module exists to exclude. */
export function jobLinksFrom(
  content: string,
  baseUrl: string,
  limit = 6,
): string[] {
  if (typeof content !== 'string' || content === '') return []

  let base: URL
  try {
    base = new URL(baseUrl)
  } catch {
    return []
  }

  const candidates = new Set<string>()
  const push = (href: string) => {
    if (!href || href.startsWith('#') || href.startsWith('mailto:')) return
    let resolved: URL
    try {
      resolved = new URL(href, base)
    } catch {
      return
    }
    if (
      resolved.hostname.toLowerCase().replace(/^www\./, '') !== hostOf(baseUrl)
    )
      return
    resolved.hash = ''
    /* The listing itself is not one of its own jobs. */
    if (
      resolved.toString().replace(/\/$/, '') ===
      base.toString().replace(/\/$/, '')
    )
      return
    if (!isVacancyUrl(resolved.toString())) return

    /* A detail page has a slug: a last segment long enough to be a role name or
       an id, not just `/careers` or `/jobs`. This is what separates
       `/en/uae/jobs/legal-assistant-1100020087` from `/jobs`. */
    const last = resolved.pathname.split('/').filter(Boolean).pop() ?? ''
    if (last.length < 8 || !/[-_0-9]/.test(last)) return

    candidates.add(resolved.toString())
  }

  for (const match of content.matchAll(/href\s*=\s*["']([^"']+)["']/gi))
    push(match[1])
  for (const match of content.matchAll(/\]\(([^)\s]+)/g)) push(match[1])

  return [...candidates].slice(0, limit)
}
