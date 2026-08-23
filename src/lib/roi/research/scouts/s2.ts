// ─────────────────────────────────────────────────────────────────────────────
// S2 — job postings (LYR-187 R3 / LYR-196). The crown jewel.
//
// A job description is the only source that describes a company's work in its
// own words, dated and verbatim. It enumerates the tasks — "reconcile 200+
// invoices weekly", "chase outstanding documents from clients", "maintain
// matter records in 3E". Those verbs are a direct readout of manual work.
// Everything else the research system gathers is inference; this is testimony.
//
// The cascade, all of it internal to this file:
//
//   L0   slug candidates  domain → up to 3 guesses          deterministic
//   L1   direct ATS       6 platforms, public no-auth JSON   concurrent
//   L1.5 search discovery ask where the jobs are, then fetch
//   L2   careers page     /careers, /jobs, … via the cache
//   →    NONE
//
// L1.5 exists because L0/L1/L2 all GUESS. Measured across 22 real
// professional-services firms they produced usable postings for one of them:
// most law and accountancy careers pages are recruitment-marketing prose with
// no vacancy list and no links to job detail pages, and the ATS boards that do
// exist sit on hosts nobody can guess (`{tenant}.wd5.myworkdayjobs.com`).
// Searching first found a vacancy URL for 20 of the same 22.
//
// `getJobPostings(domain, region)` is the whole public surface. Keeping the
// cascade private is what lets Ever Jobs — the open-source aggregator that
// covers Bayt and Naukri, deferred post-POC because it needs a container —
// slot in as another tier without a single downstream change.
//
// Two rules, both load-bearing:
//
//   NONE is a success. A firm that genuinely isn't hiring returns NONE, not
//   ERROR and not invented postings. Downstream then leans on the interview.
//   This is the exact rule the old system broke, and why its output could not
//   be trusted. The distinction is visible in the endpoints themselves: a
//   Greenhouse board that 200s with an empty array is NONE, a board that 404s
//   is a wrong slug and merely a miss.
//
//   LinkedIn is never called, from any path. Proxycurl was shut down in July
//   2025 after LinkedIn's federal lawsuit over unauthorised scraping. We sell
//   to law firms; the exposure is not worth any amount of coverage.
// ─────────────────────────────────────────────────────────────────────────────

import { generateObject, jsonSchema } from 'ai'

import { getFastModel } from '@/src/lib/roi/llm'
import { getArtifact } from '../artifactCache'
import { discoveryQuery, jobLinksFrom, rankHits, webSearch } from '../search'
import {
  type Fact,
  type ScoutResult,
  type ScoutStatus,
  type SourceAttempt,
  type SourceUrl,
  EXCERPT_MAX,
  fact,
  sourceUrl,
} from '../types'
import { type Region, normalizeDomain } from './s1Derive'
import {
  CAREERS_PATHS,
  filterTaskVerbs,
  functionDistribution,
  rankNamedSystems,
  rankTaskVerbs,
  repeatPostings,
  slugCandidates,
} from './s2Derive'

export type JobPostingFact = {
  title: string
  /* What this record actually is.

       'posting' — one dated, individual role. The real thing: quotable,
                   countable, and what every downstream consumer assumes.
       'page'    — a careers or vacancy LISTING we could read but could not
                   break into roles. One web page, not one job.

     The distinction exists because collapsing it overstates what we know. 13
     of 22 ICP firms in the coverage run reported exactly one "posting" that
     was really a marketing page, 11 of them with no task verbs at all — and a
     panel rendering "1 job posting" off that shows a prospect something we
     cannot point at. Anything counting or ranking roles must filter to
     'posting'. */
  kind: 'posting' | 'page'
  postedAt?: string
  location?: string
  seniority?: string
  sourceUrl: SourceUrl
  /* ≤200 chars, verbatim. This is what lets the observation quote rather than
     paraphrase, which is the difference between "your postings mention
     document review" and "your posting from 3 March lists 'chasing outstanding
     client documents' as the first duty". */
  excerpt: string
  taskVerbs: string[]
  namedSystems: { name: string; category: string }[]
  statedVolumes: string[]
}

export type S2Facts = {
  postings: JobPostingFact[]
  topTaskVerbs: Fact<string>[]
  namedSystems: Fact<{ name: string; category: string }>[]
  repeatPostings: { role: string; count: number; months: number }[]
  functionDistribution: Record<string, number>
}

const EMPTY_FACTS: S2Facts = {
  postings: [],
  topTaskVerbs: [],
  namedSystems: [],
  repeatPostings: [],
  functionDistribution: {},
}

/* What every ATS response is reduced to before extraction, so platform quirks
   stay inside their own adapter. `body` is the JD text — the entire value of
   this scout — and never leaves this file unextracted. */
type RawPosting = {
  title: string
  body: string
  url: string
  postedAt?: string
  location?: string
  /* Absent means 'posting'. Only the listing-page fallbacks set 'page'. */
  kind?: 'posting' | 'page'
}

const ATS_TIMEOUT_MS = 8_000

/* Cap the work, not the truth. A firm with 400 open roles is real, but
   extracting all of them costs 400 model calls for a signal that saturates
   long before that. Newest first, so the cap keeps the most quotable ones. */
const MAX_POSTINGS_EXTRACTED = 12

/* Wall-clock ceiling for the whole careers-page sweep. The orchestrator caps a
   full run at ~30s, so one scout's fallback tier cannot be allowed to spend
   more than a fraction of that. */
const L2_BUDGET_MS = 20_000

/* How many discovered pages to fetch and extract per company. Each one is a
   cache fetch plus one extraction call, so this is the tier's cost knob. */
const MAX_DISCOVERED_PAGES = 4

/* Individual job pages followed from a listing. Each is a cache fetch plus one
   extraction call, so this is the other half of the tier's cost knob. */
const MAX_JOB_LINKS = 6

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(ATS_TIMEOUT_MS),
    })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

/* Strips tags from the HTML-bodied platforms. The extraction model reads text,
   and paying tokens for markup is paying for nothing. */
function stripHtml(html: string): string {
  if (typeof html !== 'string') return ''
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' ')
    .trim()
}

// ── L1 adapters ──────────────────────────────────────────────────────────────
// Every field name below was read off a live response, not a doc page. All six
// endpoints are public and unauthenticated for reads.
//
// Each adapter returns null for "no such board" and [] for "board exists, no
// open roles". That difference is the whole NONE-vs-miss distinction, so it
// must survive all the way up.

type AtsAdapter = {
  platform: string
  url: (slug: string) => string
  parse: (body: unknown) => RawPosting[] | null
}

const ATS: AtsAdapter[] = [
  {
    platform: 'greenhouse',
    /* content=true is not optional. Without it the response is titles only,
       and the JD body is the entire point of this scout. */
    url: (slug) =>
      `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`,
    parse: (body: any) => {
      if (!body || !Array.isArray(body.jobs)) return null
      return body.jobs.map((job: any) => ({
        title: String(job?.title ?? ''),
        body: stripHtml(String(job?.content ?? '')),
        url: String(job?.absolute_url ?? ''),
        postedAt: job?.first_published ?? job?.updated_at ?? undefined,
        location: job?.location?.name ?? undefined,
      }))
    },
  },
  {
    platform: 'lever',
    url: (slug) => `https://api.lever.co/v0/postings/${slug}?mode=json`,
    parse: (body: any) => {
      if (!Array.isArray(body)) return null
      return body.map((post: any) => ({
        title: String(post?.text ?? ''),
        body: String(post?.descriptionPlain ?? post?.description ?? ''),
        url: String(post?.hostedUrl ?? post?.applyUrl ?? ''),
        postedAt: post?.createdAt
          ? new Date(post.createdAt).toISOString()
          : undefined,
        location: post?.categories?.location ?? undefined,
      }))
    },
  },
  {
    platform: 'ashby',
    url: (slug) => `https://api.ashbyhq.com/posting-api/job-board/${slug}`,
    parse: (body: any) => {
      if (!body || !Array.isArray(body.jobs)) return null
      return body.jobs
        .filter((job: any) => job?.isListed !== false)
        .map((job: any) => ({
          title: String(job?.title ?? ''),
          body: String(
            job?.descriptionPlain ??
              stripHtml(String(job?.descriptionHtml ?? '')),
          ),
          url: String(job?.jobUrl ?? job?.applyUrl ?? ''),
          postedAt: job?.publishedAt ?? undefined,
          location: job?.location ?? undefined,
        }))
    },
  },
  {
    platform: 'workable',
    url: (slug) => `https://apply.workable.com/api/v1/widget/accounts/${slug}`,
    /* The envelope — {name, description, jobs} — is verified; every Workable
       account reachable from here had an empty `jobs`, so the per-job field
       names are read defensively rather than from a sampled response. A wrong
       guess here degrades to a miss, never to a fabricated posting. */
    parse: (body: any) => {
      if (!body || !Array.isArray(body.jobs)) return null
      return body.jobs.map((job: any) => ({
        title: String(job?.title ?? job?.name ?? ''),
        body: stripHtml(
          String(job?.description ?? job?.full_description ?? ''),
        ),
        url: String(job?.url ?? job?.shortlink ?? job?.application_url ?? ''),
        postedAt: job?.published_on ?? job?.created_at ?? undefined,
        location:
          job?.location?.city ??
          job?.location?.location_str ??
          job?.city ??
          undefined,
      }))
    },
  },
  {
    platform: 'recruitee',
    /* Trailing slash matters — without it the endpoint 404s even for a real
       board. */
    url: (slug) => `https://${slug}.recruitee.com/api/offers/`,
    parse: (body: any) => {
      if (!body || !Array.isArray(body.offers)) return null
      return body.offers.map((offer: any) => ({
        title: String(offer?.title ?? ''),
        body: stripHtml(String(offer?.description ?? '')),
        url: String(offer?.careers_url ?? ''),
        postedAt: offer?.published_at ?? undefined,
        location: offer?.locations?.[0]?.name ?? undefined,
      }))
    },
  },
]

/* Personio publishes XML rather than JSON, so it sits outside the JSON adapter
   list. Parsed with a tag scan, not a DOM: the feed is flat and adding an XML
   dependency to read six fields is not worth it. */
const PERSONIO_TIMEOUT_MS = ATS_TIMEOUT_MS

function personioUrl(slug: string): string {
  return `https://${slug}.jobs.personio.de/xml`
}

function tagValue(block: string, tag: string): string | undefined {
  /* Plain index scan rather than a built regex. The tags are our own literals,
     but constructing a pattern per field per position is both slower and the
     kind of thing that quietly becomes user-controlled later. */
  const open = `<${tag}>`
  const close = `</${tag}>`
  const start = block.indexOf(open)
  if (start === -1) return undefined
  const end = block.indexOf(close, start + open.length)
  if (end === -1) return undefined

  const value = stripHtml(
    block
      .slice(start + open.length, end)
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'),
  )
  return value === '' ? undefined : value
}

function parsePersonio(xml: string, slug: string): RawPosting[] | null {
  if (typeof xml !== 'string' || !xml.includes('<workzag-jobs')) return null
  const blocks = xml.match(/<position>[\s\S]*?<\/position>/g) ?? []
  return blocks.map((block) => ({
    title: tagValue(block, 'name') ?? '',
    body: [
      tagValue(block, 'jobDescriptions'),
      tagValue(block, 'jobDescription'),
    ]
      .filter(Boolean)
      .join(' '),
    url: `https://${slug}.jobs.personio.de/job/${tagValue(block, 'id') ?? ''}`,
    postedAt: tagValue(block, 'createdAt'),
    location: tagValue(block, 'office'),
  }))
}

type BoardHit = { postings: RawPosting[]; platform: string; slug: string }

/* Every candidate against every platform, all at once. Most combinations 404,
   which is expected and cheap — these are free public endpoints and the whole
   fan-out finishes in one round trip's worth of wall time.
   `Promise.allSettled`, so one platform being down cannot take the sweep with
   it. */
async function runL1(
  slugs: string[],
  attempts: SourceAttempt[],
): Promise<BoardHit[]> {
  const probes: Promise<BoardHit | null>[] = []

  for (const slug of slugs) {
    for (const adapter of ATS) {
      probes.push(
        (async () => {
          const startedAt = Date.now()
          const body = await fetchJson(adapter.url(slug))
          const postings = body === null ? null : adapter.parse(body)
          attempts.push({
            source: `${adapter.platform}:${slug}`,
            outcome: postings === null ? 'miss' : 'hit',
            ms: Date.now() - startedAt,
          })
          return postings === null
            ? null
            : { postings, platform: adapter.platform, slug }
        })(),
      )
    }

    probes.push(
      (async () => {
        const startedAt = Date.now()
        let xml: string | null = null
        try {
          const response = await fetch(personioUrl(slug), {
            signal: AbortSignal.timeout(PERSONIO_TIMEOUT_MS),
          })
          xml = response.ok ? await response.text() : null
        } catch {
          xml = null
        }
        const postings = xml === null ? null : parsePersonio(xml, slug)
        attempts.push({
          source: `personio:${slug}`,
          outcome: postings === null ? 'miss' : 'hit',
          ms: Date.now() - startedAt,
        })
        return postings === null
          ? null
          : { postings, platform: 'personio', slug }
      })(),
    )
  }

  const settled = await Promise.allSettled(probes)
  return settled
    .filter(
      (r): r is PromiseFulfilledResult<BoardHit> =>
        r.status === 'fulfilled' && r.value !== null,
    )
    .map((r) => r.value)
}

/* L1.5 — ask where the jobs are instead of guessing.
   Everything discovered is fetched through the shared artifact cache, so a page
   another scout already read costs nothing, and a page that blocks a plain
   request still gets one Firecrawl attempt.

   `rankHits` has already dropped LinkedIn, the scraped-content aggregators, and
   any host that cannot be tied to this company — so nothing unattributable can
   reach the fetch below. */
async function runDiscovery(
  domain: string,
  vertical: string | undefined,
  attempts: SourceAttempt[],
  companyName?: string,
  canonicalDomain?: string,
): Promise<RawPosting[]> {
  const startedAt = Date.now()
  const query = discoveryQuery(domain, vertical, companyName)

  let hits: Awaited<ReturnType<typeof webSearch>> = []
  try {
    hits = await webSearch(query)
  } catch {
    hits = []
  }

  const ranked = rankHits(
    hits,
    domain,
    MAX_DISCOVERED_PAGES,
    canonicalDomain ? [canonicalDomain] : [],
  )
  attempts.push({
    source: 'search',
    outcome: ranked.length > 0 ? 'hit' : 'miss',
    ms: Date.now() - startedAt,
  })
  if (ranked.length === 0) return []

  const pages = await Promise.all(
    ranked.map(async (hit) => {
      const fetchedAt = Date.now()
      const artifact = await getArtifact(hit.url)
      const text = artifact ? stripHtml(artifact.content) : ''
      const usable = text.length > 400
      attempts.push({
        source: `search:${new URL(hit.url).hostname}`,
        outcome: usable ? 'hit' : 'miss',
        ms: Date.now() - fetchedAt,
      })
      /* The search result's own title is a far better label than "Careers
         page" — it is usually the role or the board name. */
      return usable
        ? {
            page: {
              kind: 'page',
              title: hit.title || 'Vacancies',
              body: text,
              url: hit.url,
            },
            links: jobLinksFrom(artifact.content, hit.url, MAX_JOB_LINKS),
          }
        : null
    }),
  )

  const found = pages.filter(Boolean) as {
    page: RawPosting
    links: string[]
  }[]

  /* Follow the listing through to the individual roles. A board index names
     the jobs; only the detail pages describe the work, and the work is the
     entire point of this scout. */
  const detailUrls = [...new Set(found.flatMap((f) => f.links))].slice(
    0,
    MAX_JOB_LINKS,
  )
  const details = await Promise.all(
    detailUrls.map(async (url) => {
      const startedDetail = Date.now()
      const artifact = await getArtifact(url)
      const text = artifact ? stripHtml(artifact.content) : ''
      const usable = text.length > 200
      attempts.push({
        source: 'job-detail',
        outcome: usable ? 'hit' : 'miss',
        ms: Date.now() - startedDetail,
      })
      return usable ? { title: titleFromUrl(url), body: text, url } : null
    }),
  )
  const realPostings = details.filter(Boolean) as RawPosting[]

  /* Prefer real roles. Fall back to the listing pages only when following them
     produced nothing, so a firm whose board we could read is never reported as
     having no postings at all. */
  return realPostings.length > 0 ? realPostings : found.map((f) => f.page)
}

/* `/en/uae/jobs/legal-assistant-1100020087` → "Legal Assistant". The slug is
   the only title available before extraction runs, and it beats a generic
   label for anything that later quotes the role. */
function titleFromUrl(url: string): string {
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop() ?? ''
    const words = last
      .replace(/[-_]+/g, ' ')
      .replace(/\b\d{4,}\b/g, '')
      .trim()
    return words === ''
      ? 'Vacancy'
      : words.replace(/\b[a-z]/g, (c) => c.toUpperCase())
  } catch {
    return 'Vacancy'
  }
}

/* L2 — the tier that matters more than L1 for our actual customers. Most law
   and accountancy firms don't run Greenhouse; they have a careers page with
   three roles in plain HTML. This catches exactly the firms L1 misses, and it
   works identically in the GCC where ATS adoption is thinnest.
   Routed through the shared artifact cache, so a page S1 or S3 already read
   costs nothing here. */
async function runL2(
  domain: string,
  attempts: SourceAttempt[],
): Promise<{ text: string; url: string } | null> {
  /* Sequential, so a firm whose /careers works never costs five fetches — but
     bounded, because sequential and unbounded is how one company took 153
     seconds in the first live run. Paths are tried in priority order until the
     budget is gone, and running out is recorded as a miss rather than passed
     off as "no careers page". */
  const deadline = Date.now() + L2_BUDGET_MS

  for (const path of CAREERS_PATHS) {
    const url = `https://${domain}${path}`
    const startedAt = Date.now()

    if (startedAt >= deadline) {
      attempts.push({ source: `careers${path}`, outcome: 'error', ms: 0 })
    } else {
      const artifact = await getArtifact(url)
      const text = artifact ? stripHtml(artifact.content) : ''

      /* A careers page that renders but says almost nothing is a page we read,
         not a page we found jobs on. The threshold keeps a nav-only shell or a
         soft-404 from being mistaken for content. */
      const usable = text.length > 400
      attempts.push({
        source: `careers${path}`,
        outcome: artifact ? (usable ? 'hit' : 'miss') : 'miss',
        ms: Date.now() - startedAt,
      })
      if (usable) return { text, url }
    }
  }
  return null
}

// ── Extraction ───────────────────────────────────────────────────────────────
// Raw JD bodies never travel downstream. A cheap model turns each posting into
// typed fields — this runs once per posting per company, so a frontier model
// here would be indefensible.

const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  /* Every property must appear in `required`. OpenAI's structured-output mode
     rejects a schema with `additionalProperties: false` and an optional key —
     it returns "'required' is required to be supplied and to be an array
     including every key in properties", and the call fails outright. An
     optional field is therefore expressed as a nullable required one, which is
     the shape OpenAI documents for exactly this case.
     This was not theoretical: with `seniority` merely absent from `required`,
     every extraction call in the first live run failed and every company came
     back with no task verbs at all. */
  required: [
    'taskVerbs',
    'namedSystems',
    'statedVolumes',
    'excerpt',
    'seniority',
  ],
  properties: {
    seniority: {
      type: ['string', 'null'],
      description:
        'Seniority if the posting states one, otherwise null. Never inferred from the title alone.',
    },
    excerpt: {
      type: 'string',
      description:
        'Up to 200 characters copied VERBATIM from the posting, choosing the span that best describes concrete day-to-day duties. Never paraphrase.',
    },
    taskVerbs: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Lowercase base-form verbs (chase, not chasing; reconcile, not reconciling) for REPETITIVE CLERICAL work the posting names as a duty. A verb qualifies only if it describes moving, checking, re-entering or pursuing information — work a system could plausibly do over and over. Examples that qualify: reconcile, chase, collate, re-key, extract, verify, file, schedule, follow up. Examples that NEVER qualify, because every job description contains them and they describe judgement or seniority rather than repetition: manage, support, assist, collaborate, lead, own, drive, build, partner, deliver, evolve, contribute, engage. Empty array if the posting names no repetitive clerical work at all — which is the correct answer for most senior and creative roles.',
    },
    namedSystems: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'category'],
        properties: { name: { type: 'string' }, category: { type: 'string' } },
      },
      description:
        'Named software the posting mentions, e.g. {name: "3E", category: "practice management"}. Empty array if none named.',
    },
    statedVolumes: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Verbatim volume statements, e.g. "200+ invoices weekly". Empty array if the posting states none.',
    },
  },
} as const

const EXTRACTION_SYSTEM = [
  'You extract structured facts from a single job posting.',
  '',
  'Copy, never infer. Every value you return must be traceable to words in the',
  'posting. If the posting does not name a system, return an empty array — do',
  'not supply the system such a firm probably uses. If it states no volumes,',
  'return an empty array. An empty array is a correct and useful answer, and is',
  'always better than a plausible guess.',
  '',
  'taskVerbs is the load-bearing field. It exists to surface repetitive clerical',
  'work — the kind a system could take over — so that a later reader can say',
  '"your last three postings all start with chasing documents". Apply one test',
  'to every candidate verb: could a computer do this same action a hundred times',
  'a day? "Reconcile", "chase", "collate", "re-key" pass. "Lead", "own", "drive",',
  '"build", "partner", "manage", "support" fail — they appear in every job',
  'description ever written and say nothing about how the work is done.',
  '',
  'Return base forms, not gerunds: "chase", never "chasing".',
  '',
  'Returning an empty array is correct and expected for senior, creative and',
  'strategic roles. A list of generic verbs is worse than no list at all,',
  'because it will be quoted back to the company as if it meant something.',
  '',
  'excerpt must be copied verbatim from the posting, at most 200 characters.',
].join('\n')

async function extractPosting(
  raw: RawPosting,
  verifiedUrl: SourceUrl,
): Promise<JobPostingFact | null> {
  /* A posting with no body still counts as a posting — the title and date are
     real and quotable — it just yields no verbs. Skipping the model call here
     is both cheaper and more honest than asking it to read nothing. */
  const body = raw.body.slice(0, 12_000)
  if (body.length < 80) {
    return {
      title: raw.title,
      kind: raw.kind ?? 'posting',
      ...(raw.postedAt ? { postedAt: raw.postedAt } : {}),
      ...(raw.location ? { location: raw.location } : {}),
      sourceUrl: verifiedUrl,
      excerpt: raw.title.slice(0, EXCERPT_MAX),
      taskVerbs: [],
      namedSystems: [],
      statedVolumes: [],
    }
  }

  try {
    const result = await generateObject({
      model: getFastModel(),
      schema: jsonSchema(EXTRACTION_SCHEMA as object),
      system: EXTRACTION_SYSTEM,
      prompt: `Job title: ${raw.title}\n\nPosting:\n${body}`,
    })
    const out = result.object as {
      seniority?: string | null
      excerpt?: string
      taskVerbs?: string[]
      namedSystems?: { name: string; category: string }[]
      statedVolumes?: string[]
    }

    /* The excerpt is only worth having if it is genuinely verbatim, so it is
       checked against the body rather than trusted. A model that paraphrased
       loses the quote and keeps the posting. */
    const claimed = (out.excerpt ?? '').trim()
    const verbatim =
      claimed !== '' && body.includes(claimed) ? claimed : raw.title
    return {
      title: raw.title,
      kind: raw.kind ?? 'posting',
      ...(raw.postedAt ? { postedAt: raw.postedAt } : {}),
      ...(raw.location ? { location: raw.location } : {}),
      ...(typeof out.seniority === 'string' && out.seniority !== ''
        ? { seniority: out.seniority }
        : {}),
      sourceUrl: verifiedUrl,
      excerpt: verbatim.slice(0, EXCERPT_MAX),
      taskVerbs: filterTaskVerbs(out.taskVerbs),
      namedSystems: Array.isArray(out.namedSystems) ? out.namedSystems : [],
      statedVolumes: Array.isArray(out.statedVolumes) ? out.statedVolumes : [],
    }
  } catch (error) {
    /* Extraction failing loses the verbs, not the posting. Logged under
       ROI_DEBUG because a silent fallback here looks identical to a company
       whose postings genuinely describe no manual work, and those two need to
       be distinguishable when the coverage test says verbs are thin. */
    if (process.env.ROI_DEBUG) {
      console.error(
        `[S2] extraction failed for "${raw.title}": ${error?.message ?? error}`,
      )
    }
    return {
      title: raw.title,
      kind: raw.kind ?? 'posting',
      ...(raw.postedAt ? { postedAt: raw.postedAt } : {}),
      ...(raw.location ? { location: raw.location } : {}),
      sourceUrl: verifiedUrl,
      excerpt: raw.title.slice(0, EXCERPT_MAX),
      taskVerbs: [],
      namedSystems: [],
      statedVolumes: [],
    }
  }
}

function newestFirst(a: RawPosting, b: RawPosting): number {
  const at = a.postedAt ? Date.parse(a.postedAt) : 0
  const bt = b.postedAt ? Date.parse(b.postedAt) : 0
  return (Number.isFinite(bt) ? bt : 0) - (Number.isFinite(at) ? at : 0)
}

function buildFacts(postings: JobPostingFact[], boardUrl: SourceUrl): S2Facts {
  const retrievedAt = new Date().toISOString()

  /* Rankings are Facts in their own right, and their source is the board they
     were counted from — a reader can open it and count again. */
  const topTaskVerbs = rankTaskVerbs(postings)
    .map(({ verb }) =>
      fact(verb, {
        sourceUrl: boardUrl,
        sourceType: 'ats',
        retrievedAt,
        confidence: 'high',
      }),
    )
    .filter(Boolean) as Fact<string>[]

  const namedSystems = rankNamedSystems(postings)
    .map(({ name, category }) =>
      fact(
        { name, category },
        {
          sourceUrl: boardUrl,
          sourceType: 'ats',
          retrievedAt,
          confidence: 'high',
        },
      ),
    )
    .filter(Boolean) as Fact<{ name: string; category: string }>[]

  return {
    postings,
    topTaskVerbs,
    namedSystems,
    repeatPostings: repeatPostings(postings),
    functionDistribution: functionDistribution(postings),
  }
}

/* The scout's entire public surface. `region` is accepted because S1 gates on
   it and a later tier (Ever Jobs, Bayt, Naukri) will route on it; the current
   cascade is region-independent, and pretending otherwise would be worse than
   taking the argument and saying so. */
export async function getJobPostings(
  domainInput: string,
  region?: Region,
  vertical?: string,
  /* Both from S1, both optional — see `runDiscovery`. Absent means this scout
     behaves exactly as it did before LYR-221. */
  companyName?: string,
  canonicalDomain?: string,
): Promise<ScoutResult<S2Facts>> {
  const startedAt = Date.now()
  const sourcesAttempted: SourceAttempt[] = []
  const notes: string[] = []

  const domain = normalizeDomain(domainInput)
  if (!domain) {
    return {
      scout: 'S2',
      status: 'ERROR',
      facts: EMPTY_FACTS,
      sourcesAttempted,
      durationMs: Date.now() - startedAt,
      costUsd: 0,
      notes: `"${domainInput}" is not a usable domain`,
    }
  }

  const slugs = slugCandidates(domain)
  let raw: RawPosting[] = []
  let boardUrl: string | null = null

  const hits = await runL1(slugs, sourcesAttempted)
  const withRoles = hits.filter((hit) => hit.postings.length > 0)

  if (withRoles.length > 0) {
    /* Several boards can answer for one firm — an old Lever board alongside a
       live Greenhouse one. Take the richest rather than the first to reply. */
    const best = withRoles.sort(
      (a, b) => b.postings.length - a.postings.length,
    )[0]
    raw = best.postings
    boardUrl =
      ATS.find((a) => a.platform === best.platform)?.url(best.slug) ??
      personioUrl(best.slug)
  } else if (hits.length > 0) {
    /* A board exists and is empty. That is the company telling us it isn't
       hiring, which is a finding — and the one case the old system turned into
       invention. */
    notes.push(
      `${hits.map((h) => h.platform).join(', ')} board found with no open roles`,
    )
  }

  if (raw.length === 0) {
    raw = await runDiscovery(
      domain,
      vertical,
      sourcesAttempted,
      companyName,
      canonicalDomain,
    )
    if (raw.length > 0) boardUrl = raw[0].url
  }

  if (raw.length === 0) {
    const careers = await runL2(domain, sourcesAttempted)
    if (careers) {
      /* One page, many roles: the page becomes a single pseudo-posting and the
         extraction model reads the duties off it. Less precise than an ATS
         record, and marked as such by carrying the page's own URL. */
      raw = [
        {
          kind: 'page',
          title: 'Careers page',
          body: careers.text,
          url: careers.url,
        },
      ]
      boardUrl = careers.url
    }
  }

  const verifiedBoard = boardUrl ? sourceUrl(boardUrl) : null

  if (raw.length === 0 || !verifiedBoard) {
    /* Nothing anywhere. NONE when we successfully looked and the company has
       no postings; ERROR only when every attempt failed to complete. */
    const looked = sourcesAttempted.some((a) => a.outcome !== 'error')
    return {
      scout: 'S2',
      status: looked ? 'NONE' : 'ERROR',
      facts: EMPTY_FACTS,
      sourcesAttempted,
      durationMs: Date.now() - startedAt,
      costUsd: 0,
      ...(notes.length ? { notes: notes.join('; ') } : {}),
    }
  }

  const selected = [...raw].sort(newestFirst).slice(0, MAX_POSTINGS_EXTRACTED)
  if (raw.length > selected.length) {
    notes.push(
      `${raw.length} postings found, newest ${selected.length} extracted`,
    )
  }

  const extracted = await Promise.all(
    selected.map(async (posting) => {
      const verified = sourceUrl(posting.url) ?? verifiedBoard
      return extractPosting(posting, verified)
    }),
  )
  const postings = extracted.filter(Boolean) as JobPostingFact[]

  if (postings.length === 0) {
    return {
      scout: 'S2',
      status: 'NONE',
      facts: EMPTY_FACTS,
      sourcesAttempted,
      durationMs: Date.now() - startedAt,
      costUsd: 0,
      ...(notes.length ? { notes: notes.join('; ') } : {}),
    }
  }

  const facts = buildFacts(postings, verifiedBoard)

  /* FULL means we got postings with real duty signal out of them. PARTIAL
     means postings exist but the verbs didn't survive — a title-only board, or
     extraction that came back empty. Both are honest; only the first supports
     a quoted observation. */
  const status: ScoutStatus =
    facts.topTaskVerbs.length > 0 || facts.namedSystems.length > 0
      ? 'FULL'
      : 'PARTIAL'

  return {
    scout: 'S2',
    status,
    facts,
    sourcesAttempted,
    durationMs: Date.now() - startedAt,
    /* gpt-4o-mini, one call per extracted posting. Priced by the caller's
       usage tracker rather than guessed at here. */
    costUsd: 0,
    ...(notes.length ? { notes: notes.join('; ') } : {}),
  }
}
