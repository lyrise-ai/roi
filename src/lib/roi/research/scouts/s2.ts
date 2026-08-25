// ─────────────────────────────────────────────────────────────────────────────
// S2 — job postings (LYR-187 R3 / LYR-196). The best source we have.
//
// A job advert is the only place a company describes its own work, in its own
// words, with a date on it. It lists the actual tasks: "reconcile 200+ invoices
// weekly", "chase outstanding documents from clients", "maintain matter records
// in 3E". Those are a direct read on what is being done by hand. Everything
// else the research system collects is us working things out. This is the
// company telling us.
//
// We try four ways to find postings, in order, all inside this file:
//
//   L0   guess the name   domain -> up to 3 guesses at their board name
//   L1   hiring platforms 6 of them, public, no login needed, all at once
//   L1.5 search           ask a search engine where the jobs are, then fetch
//   L2   careers page     /careers, /jobs, ... through the shared page cache
//   ->   NONE
//
// L1.5 exists because L0, L1 and L2 are all guesses. We measured them across
// 22 real professional-services firms and they found usable postings for ONE.
// Most law and accountancy careers pages are marketing text with no vacancy
// list and no links to individual jobs, and the hiring platforms that do exist
// sit on addresses nobody could guess
// (`{tenant}.wd5.myworkdayjobs.com`). Searching first found a real vacancy URL
// for 20 of the same 22.
//
// `getJobPostings(domain, region)` is the only thing this file exports.
// Keeping the four steps private is what will let Ever Jobs — an open-source
// aggregator covering Bayt and Naukri, put off until after the POC because it
// needs a container — drop in as another step with no change anywhere else.
//
// Two rules that everything rests on:
//
//   Finding nothing is a SUCCESS. A firm that genuinely is not hiring gives
//   back NONE — not an error, and never invented postings. Everything
//   downstream then leans on what the user tells us instead. This is the exact
//   rule the old system broke, and why nobody could trust its output.
//
//   The difference is visible in the responses themselves: a Greenhouse board
//   that answers with an empty list means "not hiring". A board that answers
//   404 means we guessed the wrong name.
//
//   We never call LinkedIn, by any route. Proxycurl was shut down in July 2025
//   after LinkedIn sued them in federal court over scraping. We sell to law
//   firms. No amount of extra coverage is worth that risk.
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

       'posting' — one real, dated job. Quotable, countable, and what
                   everything downstream assumes it is getting.
       'page'    — a careers or vacancy LIST we could read but could not split
                   into individual jobs. One web page, not one job.

     We keep them apart because treating them the same overstates what we know.
     In the coverage run, 13 of 22 target firms reported exactly one "posting"
     that was really a marketing page, and 11 of those listed no tasks at all.
     A panel saying "1 job posting" off the back of that is showing a prospect
     something we cannot point at. Anything that counts or ranks jobs must use
     only 'posting'. */
  kind: 'posting' | 'page'
  postedAt?: string
  location?: string
  seniority?: string
  sourceUrl: SourceUrl
  /* 200 characters or fewer, word for word. This is what lets us quote instead
     of rephrase — the difference between "your postings mention document
     review" and "your posting from 3 March lists 'chasing outstanding client
     documents' as the first duty". */
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

/* Every hiring platform's response is cut down to this shape first, so each
   platform's oddities stay inside its own small adapter. `body` is the advert
   text itself — the whole value of this scout — and it never leaves this file
   without being read first. */
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

/* Limit the work, not the truth. A firm really can have 400 open roles, but
   reading all of them costs 400 model calls for something we already know
   after a dozen. Newest first, so the limit keeps the most useful ones. */
const MAX_POSTINGS_EXTRACTED = 12

/* A hard time limit for the whole careers-page sweep. A full research run is
   capped at about 30 seconds, so one fallback step inside one scout cannot be
   allowed to eat more than a slice of that. */
const L2_BUDGET_MS = 20_000

/* How many found pages we fetch and read per company. Each one costs a page
   fetch plus one model call, so this is the dial that sets what this step
   costs. */
const MAX_DISCOVERED_PAGES = 4

/* How many individual job pages we follow from a list page. Each one costs a
   page fetch plus one model call, so this is the other half of the cost
   dial. */
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

/* Strips HTML tags from platforms that send us markup. The model reads text,
   and paying to send it tags is paying for nothing. */
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

// -- The six hiring platforms ------------------------------------------------
// Every field name below was read off a real live response, not from a
// documentation page. All six can be read publicly, with no login.
//
// Each one gives back null for "no such board here" and an empty list for
// "the board exists and has no open jobs". That difference is the whole
// point — "not hiring" versus "we guessed wrong" — so it has to survive all
// the way to the top.

type AtsAdapter = {
  platform: string
  url: (slug: string) => string
  parse: (body: unknown) => RawPosting[] | null
}

const ATS: AtsAdapter[] = [
  {
    platform: 'greenhouse',
    /* content=true is not optional. Without it we get job titles only, and
       the advert text is the entire point of this scout. */
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
    /* The outer shape — {name, description, jobs} — is confirmed. But every
       Workable account we could reach had an empty `jobs` list, so the field
       names inside each job are read carefully rather than copied from a real
       response. If we guessed one wrong we simply find nothing; we never
       invent a posting. */
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
    /* The trailing slash matters. Without it we get a 404 even for a real
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

/* Personio publishes XML rather than JSON, so it sits outside the list above.
   We read it by scanning for tags rather than parsing it properly: the feed is
   flat, and adding an XML library to read six fields is not worth it. */
const PERSONIO_TIMEOUT_MS = ATS_TIMEOUT_MS

function personioUrl(slug: string): string {
  return `https://${slug}.jobs.personio.de/xml`
}

function tagValue(block: string, tag: string): string | undefined {
  /* A plain search rather than a built-up pattern. The tag names are our own
     text, but building a pattern per field per position is slower, and it is
     the kind of code that quietly starts taking user input later on. */
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

/* Try every guessed name against every platform, all at the same time. Most
   combinations come back 404, which is expected and costs nothing — these are
   free public endpoints, and the whole spread finishes in about the time of one
   request. We wait for all of them to settle either way, so one platform being
   down cannot take the whole sweep with it. */
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

/* L1.5 — ask a search engine where the jobs are, instead of guessing.
   Everything we find is fetched through the shared page cache, so a page
   another scout already read costs nothing, and a page that blocks a plain
   request still gets one attempt through Firecrawl.

   `rankHits` has already thrown out LinkedIn, the sites that just republish
   other people's listings, and any domain we cannot tie to this company. So
   nothing we cannot attribute reaches the fetch below. */
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
      /* The search result's own title is a much better label than "Careers
         page" — it is usually the job title or the board name. */
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

  /* Follow the list through to the individual jobs. A list page only names
     them; only the job pages describe the actual work, and the work is the
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

  /* Prefer real jobs. Fall back to the list pages only if following them found
     nothing, so a firm whose board we could read is never reported as having no
     postings at all. */
  return realPostings.length > 0 ? realPostings : found.map((f) => f.page)
}

/* Turns `/en/uae/jobs/legal-assistant-1100020087` into "Legal Assistant". The
   URL is the only job title we have before the model reads the page, and it
   beats a generic label for anything that quotes the role later. */
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

/* L2 — the step that matters more than L1 for our actual customers. Most law
   and accountancy firms do not use Greenhouse; they have a careers page with
   three jobs in plain HTML. This catches exactly the firms L1 misses, and it
   works just as well in the Gulf, where hiring platforms are least used.
   It goes through the shared page cache, so a page another scout already read
   costs nothing here. */
async function runL2(
  domain: string,
  attempts: SourceAttempt[],
): Promise<{ text: string; url: string } | null> {
  /* One at a time, so a firm whose /careers page works never costs five
     fetches. But with a time limit, because one at a time with no limit is how
     a single company took 153 seconds in the first live run. We try the paths
     in order until the time is gone, and running out is recorded as "we did not
     get to look", never as "they have no careers page". */
  const deadline = Date.now() + L2_BUDGET_MS

  for (const path of CAREERS_PATHS) {
    const url = `https://${domain}${path}`
    const startedAt = Date.now()

    if (startedAt >= deadline) {
      attempts.push({ source: `careers${path}`, outcome: 'error', ms: 0 })
    } else {
      const artifact = await getArtifact(url)
      const text = artifact ? stripHtml(artifact.content) : ''

      /* A careers page that loads but says almost nothing is a page we read,
         not a page we found jobs on. This length check stops a menu-only shell,
         or a "not found" page that returns 200, from being mistaken for real
         content. */
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

// -- Reading the adverts -----------------------------------------------------
// The raw advert text never goes any further than this file. A cheap model
// turns each posting into a few clean fields. This runs once per posting per
// company, so using an expensive model here would be impossible to justify.

const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  /* Every field has to be listed as required. OpenAI's structured-answer mode
     refuses a shape that forbids extra fields but leaves one optional — it
     answers "'required' is required to be supplied and to be an array
     including every key in properties" and the call fails outright. So a field
     that may be missing is written as required-but-allowed-to-be-null, which is
     the form OpenAI documents for exactly this case.
     This is not theory: with `seniority` simply left out of the required list,
     every single call in the first live run failed, and every company came back
     with no tasks at all. */
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
  /* A posting with no text still counts as a posting: the title and date are
     real and quotable. It just tells us nothing about the tasks. Skipping the
     model call is cheaper and more honest than asking it to read an empty
     page. */
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

    /* A quote is only worth having if it really is word for word, so we check
       it against the original text rather than trusting it. If the model
       rephrased, we drop the quote and keep the posting. */
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
    /* If reading the advert fails we lose the task list, not the posting. We
       log it under ROI_DEBUG, because failing quietly here looks exactly like a
       company whose adverts genuinely describe no manual work — and we need to
       tell those two apart when the coverage test says the tasks look thin. */
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

  /* A ranking is a fact in its own right, and its source is the board we
     counted it from — a reader can open it and count again. */
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

/* The only function this file exports. It takes `region` because S1 uses it,
   and because a later step (Ever Jobs, Bayt, Naukri) will need it. Nothing in
   the current steps looks at it. Taking the argument and saying so plainly
   beats pretending otherwise. */
export async function getJobPostings(
  domainInput: string,
  region?: Region,
  vertical?: string,
  /* Both come from S1 and both may be missing — see `runDiscovery`. Without
     them this scout behaves exactly as it did before LYR-221. */
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
    /* More than one board can answer for the same firm — an abandoned Lever
       board next to a live Greenhouse one. Take the one with the most on it,
       not the one that replied first. */
    const best = withRoles.sort(
      (a, b) => b.postings.length - a.postings.length,
    )[0]
    raw = best.postings
    boardUrl =
      ATS.find((a) => a.platform === best.platform)?.url(best.slug) ??
      personioUrl(best.slug)
  } else if (hits.length > 0) {
    /* The board exists and is empty. That is the company telling us it is not
       hiring, which is a real finding — and it is the exact case the old system
       used to turn into invented postings. */
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
      /* One page holding many jobs: we treat the page as a single stand-in
         posting and let the model read the duties off it. Less precise than a
         real record from a hiring platform, and marked as such by carrying the
         page's own URL. */
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
    /* Nothing anywhere. That is NONE when we managed to look and the company
       has no postings, and ERROR only when every single attempt failed to
       finish. */
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

  /* FULL means we got postings and could read real duties out of them.
     PARTIAL means the postings exist but the duties did not survive — a board
     with titles only, or a read that came back empty. Both are honest answers;
     only the first lets us quote anything back to the prospect. */
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
    /* gpt-4o-mini, one call per posting read. The caller's usage tracker works
       out what it cost; we do not guess at it here. */
    costUsd: 0,
    ...(notes.length ? { notes: notes.join('; ') } : {}),
  }
}
