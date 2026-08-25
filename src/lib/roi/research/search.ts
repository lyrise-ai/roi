// ─────────────────────────────────────────────────────────────────────────────
// research/search — finds where a company's job postings actually live
// (LYR-187 R9 / LYR-212).
//
// S2 used to guess. It guessed the company's board name from its domain, then
// guessed careers page paths. Measured against 22 real professional-services
// firms, that found usable postings for exactly ONE of them. Most law and
// accountancy careers pages are recruitment *marketing* pages: no list of
// vacancies, no links to individual jobs, and every deeper path we could think
// of returns "not found".
//
// Searching first finds a real vacancy URL for 20 of those same 22. The
// postings were always there. We were looking in the wrong place, the wrong
// way.
//
// This file does the finding only. It never downloads anything — found URLs go
// through the shared page cache like everything else.
//
// -- The rule that matters most in this file ---------------------------------
//
// A search result is a GUESS about who a page belongs to, and acting on a wrong
// guess is worse than finding nothing. It would attach another company's job
// postings to this prospect and present them as fact. Real examples from the
// measurement run:
//
//   stalawfirm.com  ->  stblaw.wd1.myworkdayjobs.com  (Simpson Thacher, not STA)
//   tamimi.com      ->  tamimicontracting.com         (a contractor, not the law firm)
//   farrer.co.uk    ->  farrercapital.com             (Farrer Capital, not Farrer & Co)
//   bakertilly.com  ->  bakertilly.ca                 (a different member firm)
//
// So we check ownership by the shape of the address, and drop anything that
// does not clearly belong to this company. We would rather come back with
// nothing.
// ─────────────────────────────────────────────────────────────────────────────

import { webSearch as providerSearch } from '@/src/lib/roi/tools/webSearch'

export type SearchHit = { url: string; title: string }

/* How a URL we found relates to the company we were asked about.
     own     — the company's own domain, or something under it
     ats     — a hiring platform we know, with a board name that matches
     blocked — LinkedIn, or a site that republishes other people's listings
     other   — we cannot tie it to this company, so we drop it */
export type HostClass = 'own' | 'ats' | 'blocked' | 'other'

/* Hiring platforms we trust as if they were the company's own site. Workday is
   first on merit: it turned up for 5 of the 22 firms we measured, more than
   every other platform put together, and S2's guessing step never tries it
   because its addresses cannot be guessed
   (`{tenant}.wd{N}.myworkdayjobs.com`). Search finds them; guessing never
   could. */
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

/* Never fetched, by any route, for any reason.

   LinkedIn is a legal decision, not a quality one. Proxycurl was shut down in
   July 2025 after LinkedIn sued them in federal court over scraping, and we
   sell to law firms. LinkedIn dominated the search results in testing, so this
   list does real work rather than sitting there for show — and it is a filter
   in code, not an instruction in a prompt, because a filter cannot be talked
   past.

   The rest are sites that republish other people's job listings. They carry no
   dates, they are often out of date, and they are often wrong about which
   company a posting belongs to. A fact pointing at one of those is worse than
   no fact at all, because it looks checkable. */
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

/* Address paths that look like a vacancy list or an individual job page, as
   opposed to an About page that just happens to mention hiring. */
const VACANCY_PATH =
  /\/(jobs?|vacanc|career|opportunit|position|opening|apply|job-application|recruit)/i

/* Takes either a full URL or a bare domain, because callers pass both: a search
   result is a URL, the company is a domain. Returning nothing for a bare domain
   — which is what the built-in URL parser does, since it throws without an
   http:// on the front — quietly switched off the whole "is this their own
   domain" check. */
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
    /* It still has to look like a domain, so rubbish from a search result
       cannot be mistaken for one. We check it piece by piece rather than with a
       single pattern: the pattern you would naturally write can take
       exponentially long on certain input, and this input comes from an outside
       search service. */
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

/* The core name a board should look like. `acmelaw.co.uk` and `acmelaw.com`
   both come down to `acmelaw`. */
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

/* Could this hiring board plausibly belong to this company?

   We require one name to START with the other, within a few characters. We do
   NOT accept one merely appearing inside the other. "Appears inside" would
   accept `stblaw` for `stalawfirm` on the shared "law" — which is how you end
   up showing Simpson Thacher's vacancies to an STA Law Firm prospect.

   Starts-with accepts the real pairs we measured — bakertilly/bakertilly,
   morganlewis/morganlewis, rsm/rsmus, tamimi/tamimi — and rejects
   stblaw/stalawfirm and pkfsmithcooper/pkfuae.

   ponytail: a brand shared by member firms in different countries (bdo/bdoau)
   can still slip through. Only tighten this if a coverage re-run shows it
   attaching the wrong country's postings. */
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
  /* Other domains the company itself says are the same as this one — see
     `canonicalDomainFromHtml`. We never work these out here: they are either
     handed in or we manage without them. */
  aliases: string[] = [],
): HostClass {
  const host = hostOf(url)
  if (host === '') return 'other'

  if (BLOCKED_HOSTS.some((b) => host === b || host.endsWith(`.${b}`))) {
    return 'blocked'
  }

  /* The company's own domain, or anything under it.
     `careers.osborneclarke.com` and `jobs.rsmus.com` are the company.
     `bakertilly.ca` is not — and a simple brand-name match would have let it
     through.

     Aliases extend this to a domain the company REDIRECTS to and names on its
     own pages: `kingsleynapley.com` serves `kingsleynapley.co.uk`, so its real
     careers page was being classed as someone else's and dropped.

     This stays safe precisely because an alias is read off the company's own
     page, not worked out from the brand name. `bakertilly.com` names no alias,
     so `bakertilly.ca` is still rejected — and that is the wrong-firm case this
     whole file exists to prevent. */
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

/* A vacancy page says so either in the path (`/careers`) or in the domain
   itself (`careers.bdo.co.uk`). Checking only the path threw away
   `careers.bdo.co.uk` — correctly identified as theirs, and exactly the right
   page — because its path is just `/`. That was one of the six domains that
   produced nothing in the LYR-221 measurement. */
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

/* Sorts the results, filters them, and removes duplicates. A hiring board beats
   the company's own site, because that is where dated, individual postings
   live; their own careers page is usually just prose. Anything we cannot
   attribute is already gone by this point — blocked and unknown results never
   survive — so no caller can accidentally fetch LinkedIn or another company's
   board. */
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
    /* On the company's own domain, a page that is not about vacancies is
       usually the About page and holds no jobs. On a hiring platform, the front
       page IS the board. */
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

/* Short, because S2 has a 20-second budget in total and may try two search
   engines. The shared search code defaults to 15 seconds, which suits the older
   ROI agent, where there is no such limit. */
const SEARCH_TIMEOUT_MS = 6_000

/* The search engines, their API keys, the order we fall back through and the
   error handling all live in `tools/webSearch`. This file used to keep a second
   copy of all that, and the two drifted apart (LYR-221).
   All this function does now is cut the rich result down to the {url, title}
   pairs the scouts sort on. We deliberately throw away the snippet and the
   engine's own summary, because a scout has to read the page itself rather
   than trust a search engine's description of it. */
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

/* The search wording that found `tamimi.talentera.com` on the first try.

   `companyName` comes from S1 — the firm's name as the firm writes it. It is
   optional, and without it we fall back to the domain name, which is the old
   behaviour, so this step still works when S1 found nothing.

   But the real name was worth passing through three function signatures,
   because the domain name is what was breaking the search. Measured over 25
   domains (LYR-221): searching "gowlingwlg" returned a German packaging company
   four times, and "farrer" returned six unrelated US firms. Both scored zero
   usable results. "Gowling WLG" and "Farrer & Co" scored four each. Search
   engines match how people write a name, and nobody writes a domain. */
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

/* Finds links to individual jobs on a page we already downloaded.

   A URL we found is usually a LIST — a board index or a careers page that links
   to the jobs rather than describing them. Measured across 22 firms, 10 came
   back with exactly one "posting" that was really a list page, and 8 of those
   described no tasks at all. We were downloading the page that names the jobs
   and never opening the jobs themselves. This closes that gap.

   It reads links in both HTML and markdown form, because the page cache returns
   HTML from a plain fetch and markdown from Firecrawl, and a caller should not
   have to know which one produced it.

   Same domain only. A careers page also links to LinkedIn, to the hiring
   platform, to the press page and to a cookie policy. Following links off the
   domain would walk straight into the sources this file exists to keep out. */
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

    /* An individual job page has a long last piece in its address — long enough
       to be a job title or an id, not just `/careers` or `/jobs`. That is what
       separates `/en/uae/jobs/legal-assistant-1100020087` from `/jobs`. */
    const last = resolved.pathname.split('/').filter(Boolean).pop() ?? ''
    if (last.length < 8 || !/[-_0-9]/.test(last)) return

    candidates.add(resolved.toString())
  }

  for (const match of content.matchAll(/href\s*=\s*["']([^"']+)["']/gi))
    push(match[1])
  for (const match of content.matchAll(/\]\(([^)\s]+)/g)) push(match[1])

  return [...candidates].slice(0, limit)
}
