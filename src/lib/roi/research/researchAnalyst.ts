// ─────────────────────────────────────────────────────────────────────────────
// researchAnalyst — the agent that reads everything the scouts found and works
// out what it means, WHILE the user is still answering questions (LYR-187).
//
// ("Scouts" are the small workers that go and fetch things about a company:
// job postings, company size, and so on. They are in ./scouts/.)
//
// There are two agents in this product and they are easy to mix up:
//
//   researchAnalyst (this file)  runs while the user answers, takes 3-20s
//                                gets:  the research only
//                                gives: short readable findings for the side
//                                       panel, one at a time as it finds them
//
//   the report writer            runs after the questions are done
//                                gets:  this agent's findings PLUS every
//                                       answer the user gave
//                                gives: the report
//
// They cannot be one agent, because when the side panel first draws, the user
// has not answered anything yet. What this agent produces becomes the writer's
// input.
//
// ── Why an agent and not a word list ─────────────────────────────────────────
//
// This replaced a fixed list of verbs (`MANUAL_WORK_VERBS`) that decided which
// job duties meant "done by hand". That idea was wrong twice over. It was
// written from imagination — reconcile, re-key, chase invoices — and when we
// measured it against 22 real professional-services firms it matched NOTHING.
// Widening the list until the number improves is fiddling with a dial, not
// measuring anything.
//
// The real problem is that a single word cannot answer the question. "Review"
// is document review at a law firm and performance review at a consultancy.
// "Liaise" is chasing missing paperwork at one company and managing
// stakeholders at another. Pull the verb out of the job posting it came from
// and the meaning is gone with it. No list of verbs can ever be right.
//
// So the judgement goes to an agent that sees the whole picture: every job
// posting, the quoted text, the systems named in it, what each scout tried and
// what it failed to reach. It works the way a person would — read the
// research, then say what it means — instead of matching strings.
//
// ── What keeps it honest ─────────────────────────────────────────────────────
//
// Free reasoning is the point. Making things up is still not allowed. Two
// rules, both enforced in our own code AFTER the model answers, not merely
// asked for in the prompt:
//
//   1. Every finding must name a source URL that we actually fetched during
//      this run. If we did not fetch it, the finding is thrown away rather
//      than shown. That is what makes the side panel safe to put in front of a
//      prospect: every line on it can be clicked and checked.
//
//   2. A claim about a company we could not reach is impossible to make,
//      because there are no sources to point at.
//
// The output of this file is NOT the same on every run. That is a trade we
// chose on purpose: an agent that actually reasons about the research is worth
// more than a fixed rule that gives the same wrong answer every time.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'crypto'

import { jsonSchema, streamObject } from 'ai'

import { getAnalystModel } from '@/src/lib/roi/llm'
import type { Coverage, ConfidenceTier } from './aggregate'
import {
  type SourceType,
  type SourceUrl,
  type ScoutId,
  type ScoutResult,
  type ScoutStatus,
  sourceUrl,
} from './types'

/* One thing we can tell the prospect, in words, with a link they can open.
   This is what the side panel shows — not a list of URLs. */
export type ResearchFinding = {
  /* A short sentence a person would say. "You're hiring a paralegal whose
     first listed duty is chasing outstanding client documents" — never
     "job_posting: paralegal". */
  headline: string
  /* Which scout's area this came from. Used to group rows in the panel and to
     spot duplicates. */
  kind: string
  sourceUrl: SourceUrl
  /* The exact words from the source, when there are any, so the report can
     quote instead of rephrase. */
  excerpt?: string
  /* Copied from the record of where we got the fact, never from the model —
     we do not ask the agent for these and it never sees them.
     Some facts come from a bought data set that is only refreshed monthly, so
     the panel shows a date next to those. Telling a prospect a staff count as
     if it were current when it is six months old is exactly the kind of thing
     that destroys trust (LYR-199). */
  sourceType?: SourceType
  retrievedAt?: string
}

/* What a source URL is allowed to pass on to the finding that cites it.
   A job posting has none of this, because the posting IS the source. Anything
   that came in as a `Fact` does have it. */
type FindingProvenance = { sourceType?: SourceType; retrievedAt?: string }

/* Every URL this run actually fetched. It does two jobs: it is the list of
   sources a finding is allowed to cite, and it is where we look up how old
   each source is. It used to be a plain set of URLs. Making it a lookup table
   is what lets a checked finding pick up the date of the fact it cites,
   without ever asking the model for a date. */
type SourceIndex = Map<string, FindingProvenance>

export type ResearchAssessment = {
  findings: ResearchFinding[]
  /* What this particular company seems to do by hand, in the agent's own
     words, based on their own job postings. This is what replaced the fixed
     verb list. */
  manualWorkSignals: string[]
  confidenceTier: ConfidenceTier
  /* Why it judged the research this rich or this thin. Never shown to a
     prospect. It is there so a surprising result can be traced. */
  reasoning: string
  /* What we could not find out. Saying it out loud means a thin result reads
     as "we did not manage to look here", not as "this company does nothing". */
  gaps: string[]
}

export const EMPTY_ASSESSMENT: ResearchAssessment = {
  findings: [],
  manualWorkSignals: [],
  confidenceTier: 'THIN',
  reasoning: 'No research was available to assess.',
  gaps: [],
}

const ASSESSMENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'findings',
    'manualWorkSignals',
    'confidenceTier',
    'reasoning',
    'gaps',
  ],
  properties: {
    findings: {
      type: 'array',
      description:
        'Everything we can tell this company about itself that the research actually supports — as many or as few as there are. Each is one plain sentence a person would say out loud, citing a sourceUrl copied EXACTLY from the research provided. Do not pad to reach a number and do not stop early if there is more.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['headline', 'kind', 'sourceUrl', 'excerpt'],
        properties: {
          headline: { type: 'string' },
          kind: {
            type: 'string',
            description:
              'A short label for what this is about: hiring, systems, location, size, services, turnover.',
          },
          sourceUrl: {
            type: 'string',
            description:
              'Copied exactly from the research. Never construct, shorten or guess a URL.',
          },
          excerpt: {
            type: ['string', 'null'],
            description:
              'Verbatim from the source if the research contains a quotable span, otherwise null.',
          },
        },
      },
    },
    manualWorkSignals: {
      type: 'array',
      items: { type: 'string' },
      description:
        'What this company appears to do by hand that a system could take over, in your own words, each grounded in something the research actually shows. Empty if the research does not support any.',
    },
    confidenceTier: {
      type: 'string',
      enum: ['RICH', 'MODERATE', 'THIN'],
      description:
        'RICH: enough specific dated evidence to say something only this company would recognise. MODERATE: real but thin — hedge and lean on the interview. THIN: too little to make any external claim.',
    },
    reasoning: { type: 'string' },
    gaps: {
      type: 'array',
      items: { type: 'string' },
      description: 'What we could not establish, and why.',
    },
  },
} as const

const ANALYST_SYSTEM = [
  'You are the research analyst for a diagnostic that shows professional-services',
  'firms where AI could return hours. You are given everything the research',
  'system found about one company. Your job is to work out what it means.',
  '',
  'Read it the way an analyst would: what does this firm actually do by hand?',
  'What does it keep hiring for? What systems does it name? What has it',
  'published about how it works? Then say so in plain sentences.',
  '',
  'GROUNDING — the only hard rule.',
  'Every finding must cite a sourceUrl copied EXACTLY from the research below.',
  'Never construct, shorten, or guess a URL. If you cannot cite something, do',
  'not say it. A finding whose citation is not in the research is discarded',
  'before anyone sees it, so inventing one costs you the finding.',
  '',
  'JUDGE MANUAL WORK IN CONTEXT, not by vocabulary.',
  'The same word means different work at different firms. "Review" is document',
  'review at a law firm and performance review at a consultancy. "Liaise" is',
  'chasing missing paperwork at one firm and stakeholder management at another.',
  'Decide from the posting it appears in, not from the word. Irreducibly',
  'professional judgement — negotiating, advising, advocating, representing —',
  'is not manual work however often it appears.',
  '',
  'AN EMPTY ANSWER IS A REAL ANSWER.',
  'If the research is thin, say THIN and return few findings. Do not pad. The',
  'reader is a prospect who knows their own business, and a generic sentence',
  'tells them we learned nothing. Saying less is how this stays credible.',
  '',
  'A company that is genuinely not hiring is information, not a gap. A company',
  'we could not reach is a gap, and you must not describe it as if we had.',
].join('\n')

/* Turns everything the agent is allowed to look at into plain text. Handing
   over the raw scout objects would fill most of the model's reading budget
   with plumbing. This keeps the job postings, the quoted text and the picture
   of what we did and did not reach — which is what the judgement rests on. */
function renderResearch(
  domain: string,
  results: Partial<Record<ScoutId, ScoutResult<unknown>>>,
): { prompt: string; sources: SourceIndex } {
  const sources: SourceIndex = new Map()
  const lines: string[] = [`Company domain: ${domain}`, '']

  /* The first entry wins, unless a later one actually knows where it came
     from. The same URL can back both a job posting (which carries no separate
     record) and an S1 fact (which does), and only the second can give the row
     a date. */
  const addSource = (url: string, provenance?: FindingProvenance) => {
    if (!url) return
    const existing = sources.get(url)
    if (!existing || (!existing.sourceType && provenance?.sourceType)) {
      sources.set(url, provenance ?? {})
    }
  }

  const entries = Object.entries(results) as [ScoutId, ScoutResult<unknown>][]

  for (const [scout, result] of entries.filter(([, r]) => Boolean(r))) {
    lines.push(`## ${scout} — status ${result.status}`)
    if (result.notes) lines.push(`note: ${result.notes}`)

    const facts = result.facts as Record<string, unknown> | null

    /* Job postings from scout S2 — the richest material we get, and the only
       thing that comes with a date on it. */
    const postings = (facts?.postings ?? []) as Record<string, unknown>[]
    for (const posting of postings) {
      const url = String(posting?.sourceUrl ?? '')
      addSource(url)
      const shape =
        posting?.kind === 'page' ? 'LISTING PAGE (not a role)' : 'role'
      const verbs = Array.isArray(posting?.taskVerbs)
        ? (posting.taskVerbs as string[])
        : []
      const systems = Array.isArray(posting?.namedSystems)
        ? (posting.namedSystems as { name?: string }[])
            .map((sys) => sys?.name)
            .filter(Boolean)
        : []

      lines.push(
        [
          `- [${shape}] ${String(posting?.title ?? 'untitled')}`,
          posting?.postedAt ? ` posted ${String(posting.postedAt)}` : '',
          posting?.location ? ` in ${String(posting.location)}` : '',
          `\n  source: ${url}`,
          posting?.excerpt ? `\n  excerpt: "${String(posting.excerpt)}"` : '',
          verbs.length ? `\n  duties named: ${verbs.join(', ')}` : '',
          systems.length ? `\n  systems named: ${systems.join(', ')}` : '',
        ].join(''),
      )
    }

    /* Everything else that arrived as a Fact — today that is S1's company
       details, later it will include more scouts — without this file having to
       know the shape of each scout's output. */
    for (const [field, value] of Object.entries(facts ?? {})) {
      const fact = value as {
        value?: unknown
        provenance?: {
          sourceUrl?: string
          excerpt?: string
          sourceType?: SourceType
          retrievedAt?: string
        }
      }
      const src = fact?.provenance?.sourceUrl
      if (src) {
        addSource(src, {
          sourceType: fact.provenance?.sourceType,
          retrievedAt: fact.provenance?.retrievedAt,
        })
        lines.push(
          `- ${field}: ${JSON.stringify(fact.value)}\n  source: ${src}` +
            (fact.provenance?.excerpt
              ? `\n  excerpt: "${fact.provenance.excerpt}"`
              : ''),
        )
      }
    }

    /* We say this out loud so the agent can tell "this company has nothing"
       apart from "we could not get to it". That difference is what this whole
       subsystem turns on. */
    const failed = (result.sourcesAttempted ?? []).filter(
      (a) => a.outcome === 'error' || a.outcome === 'blocked',
    )
    if (failed.length) {
      lines.push(`could not reach: ${failed.map((a) => a.source).join(', ')}`)
    }
    lines.push('')
  }

  if (sources.size === 0) {
    lines.push('No sources were retrieved for this company.')
  }
  return { prompt: lines.join('\n'), sources }
}

/* Checks one finding and returns it, or returns null. If it cites a URL we did
   not fetch, we drop it instead of showing it. This check lives in our code,
   not in the prompt, because a model can be talked past a prompt but not past
   an if statement.

   We check one finding at a time, not the whole batch at the end, so that
   sending findings out as they arrive cannot become a hole in the rule. Every
   finding is checked before it leaves this file, whichever way it arrived. */
function verifyFinding(
  item: Record<string, unknown>,
  sources: SourceIndex,
): ResearchFinding | null {
  const claimed = String(item?.sourceUrl ?? '')
  const provenance = sources.get(claimed)
  const verified = provenance ? sourceUrl(claimed) : null
  const headline = String(item?.headline ?? '').trim()
  if (!verified || headline === '') return null

  const excerpt =
    typeof item?.excerpt === 'string' && item.excerpt.trim() !== ''
      ? item.excerpt.trim().slice(0, 200)
      : undefined

  return {
    headline,
    kind: String(item?.kind ?? 'finding'),
    sourceUrl: verified,
    ...(excerpt ? { excerpt } : {}),
    ...provenance,
  }
}

// -- Saving past assessments ------------------------------------------------
// We file each saved assessment under a fingerprint of the research text
// itself, not under the company's domain. So we only reuse a saved answer when
// the research behind it is identical, character for character.
//
// Filing by domain would be wrong twice: it would hand back old reasoning
// after the scouts found something new, and it would mix up the early
// assessment made when only S1 had landed with the fuller one made after S2.
//
// It pays off a second time while a run is still going. A scout that finishes
// without adding a single new source produces the same research text, so the
// re-assessment it triggers costs nothing instead of paying for the model
// twice.
//
// Two layers, both allowed to fail, the same way `artifactCache` works. Memory
// catches repeats inside one server run. Supabase carries answers between
// runs. If the database cannot be reached we simply do not save — we never
// fail the run over it.

export const ASSESSMENT_TTL_MS = 24 * 60 * 60 * 1000

const memory = new Map<
  string,
  { assessment: ResearchAssessment; expiresAt: number }
>()

/* For tests, and for `npm run dev`, where an old assessment would otherwise
   survive a hot reload. Does not touch Supabase. */
export function clearAssessmentCache(): void {
  memory.clear()
}

function cacheKey(prompt: string): string {
  return crypto.createHash('sha256').update(prompt).digest('hex')
}

function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
}

async function readAssessment(key: string): Promise<ResearchAssessment | null> {
  const cached = memory.get(key)
  if (cached) {
    if (cached.expiresAt > Date.now()) return cached.assessment
    memory.delete(key)
  }
  if (!supabaseConfigured()) return null
  try {
    const { getSupabaseAdmin } = await import('../../supabaseAdmin')
    const { data, error } = await getSupabaseAdmin()
      .from('research_assessments')
      .select('assessment, expires_at')
      .eq('cache_key', key)
      .maybeSingle()
    if (error || !data) return null
    const expiresAt = new Date(data.expires_at).getTime()
    if (expiresAt <= Date.now()) return null
    if (!data.assessment || !Array.isArray(data.assessment.findings))
      return null
    memory.set(key, { assessment: data.assessment, expiresAt })
    return data.assessment as ResearchAssessment
  } catch {
    return null
  }
}

async function writeAssessment(
  key: string,
  domain: string,
  assessment: ResearchAssessment,
): Promise<void> {
  memory.set(key, { assessment, expiresAt: Date.now() + ASSESSMENT_TTL_MS })
  if (!supabaseConfigured()) return
  try {
    const { getSupabaseAdmin } = await import('../../supabaseAdmin')
    await getSupabaseAdmin()
      .from('research_assessments')
      .upsert(
        {
          cache_key: key,
          domain,
          assessment,
          expires_at: new Date(Date.now() + ASSESSMENT_TTL_MS).toISOString(),
        },
        { onConflict: 'cache_key' },
      )
  } catch {
    /* best-effort */
  }
}

export type AssessOptions = {
  /* A plain summary of which scouts got anywhere, worked out by ordinary code.
     We hand it to the agent as evidence, not as an order. It is cheap, it is
     already tested, and the agent is free to disagree with what it suggests. */
  coverage?: Coverage
  /* Called once per finding, the moment it arrives and its source has been
     checked — NOT at the end. The side panel is drawing while the prospect is
     still typing, so a finding that arrives at second 4 has to be on screen at
     second 4. A saved assessment is replayed through this too, so a reused run
     looks exactly like a fresh one. */
  onFinding?: (finding: ResearchFinding) => void
}

export async function assessResearch(
  domain: string,
  results: Partial<Record<ScoutId, ScoutResult<unknown>>>,
  options: AssessOptions = {},
): Promise<ResearchAssessment> {
  const { prompt: research, sources } = renderResearch(domain, results)

  if (sources.size === 0) {
    /* We fetched nothing, so nothing can be cited, so there is nothing to
       reason about. Skipping the model call is cheaper and more honest than
       asking it to find meaning in an empty page. */
    return {
      ...EMPTY_ASSESSMENT,
      reasoning: 'No sources were retrieved, so no external claim is possible.',
      gaps: Object.entries(results)
        .filter(([, r]) => r?.status === 'ERROR')
        .map(([scout, r]) => `${scout}: ${r?.notes ?? 'failed to look'}`),
    }
  }

  const prompt = options.coverage
    ? `${research}\n\nScout coverage: ${JSON.stringify(options.coverage)}`
    : research

  const key = cacheKey(prompt)
  const cached = await readAssessment(key)
  if (cached) {
    for (const finding of cached.findings) options.onFinding?.(finding)
    return cached
  }

  const findings: ResearchFinding[] = []

  try {
    /* The library's own docs say the partial stream is not checked, and an
       error that kills the stream does not always come back as a thrown error
       — the loop can just stop early. Without this flag, a half-finished
       assessment would look finished and get SAVED for a day. That is exactly
       the kind of quiet failure this codebase is built to avoid. */
    let streamFailed: Error | null = null

    const stream = streamObject({
      model: getAnalystModel(),
      schema: jsonSchema(ASSESSMENT_SCHEMA as object),
      system: ANALYST_SYSTEM,
      prompt,
      onError: ({ error }) => {
        streamFailed = (error as Error) ?? new Error('stream failed')
      },
    })

    /* Send each finding out as soon as it is finished, rather than waiting for
       the whole answer. A finding is only definitely finished once a LATER one
       has started — before that the parser is still filling it in, and its
       quoted text (the last field) may not have arrived. So everything except
       the last one is safe to send, and the last one is sent from the finished
       answer below.

       The source check runs here, per finding, before anything goes out.
       Sending early must not become a hole in the rule. */
    let emitted = 0
    let last: Record<string, unknown> = {}

    const flushTo = (raw: Record<string, unknown>[], upTo: number) => {
      while (emitted < upTo) {
        const finding = verifyFinding(raw[emitted] ?? {}, sources)
        emitted += 1
        if (finding) {
          findings.push(finding)
          options.onFinding?.(finding)
        }
      }
    }

    for await (const partial of stream.partialObjectStream) {
      last = (partial ?? {}) as Record<string, unknown>
      const raw = Array.isArray(last.findings)
        ? (last.findings as Record<string, unknown>[])
        : []
      flushTo(raw, raw.length - 1)
    }

    /* This runs before the last finding is sent, not after. The last one is
       the one the parser had not finished, so if the stream broke, its
       sentence may be cut in half. Everything before it already went out and
       stays. */
    if (streamFailed) throw streamFailed

    flushTo(
      Array.isArray(last.findings)
        ? (last.findings as Record<string, unknown>[])
        : [],
      Array.isArray(last.findings) ? (last.findings as unknown[]).length : 0,
    )

    /* If every finding was thrown away for citing a source we never fetched,
       the research cannot be called rich, whatever the model claimed. By that
       point there is nothing left to be specific about. */
    const claimedTier = String(last?.confidenceTier ?? 'THIN')
    const tier: ConfidenceTier =
      findings.length === 0
        ? 'THIN'
        : ((['RICH', 'MODERATE', 'THIN'].includes(claimedTier)
            ? claimedTier
            : 'MODERATE') as ConfidenceTier)

    const assessment: ResearchAssessment = {
      findings,
      manualWorkSignals: Array.isArray(last?.manualWorkSignals)
        ? (last.manualWorkSignals as unknown[]).map(String).filter(Boolean)
        : [],
      confidenceTier: tier,
      reasoning: String(last?.reasoning ?? ''),
      gaps: Array.isArray(last?.gaps)
        ? (last.gaps as unknown[]).map(String).filter(Boolean)
        : [],
    }

    await writeAssessment(key, domain, assessment)
    return assessment
  } catch (error) {
    /* This never throws. If the research cannot be assessed we fall back to
       "we know nothing", which is the safe direction: it makes everything
       downstream quieter, not louder.

       We deliberately do NOT save this failure. A failure says something about
       this moment, not about the research, and saving it would keep the
       company looking thin for a whole day because of one bad minute. Findings
       that already went out are kept — each was checked on its own, and a
       stream that died halfway still told the truth about the part that
       arrived. */
    if (process.env.ROI_DEBUG) {
      console.error(`[analyst] assessment failed: ${(error as Error)?.message}`)
    }
    return {
      ...EMPTY_ASSESSMENT,
      findings,
      confidenceTier: 'THIN',
      reasoning: 'The research assessment could not be completed.',
    }
  }
}

// -- Assessing as the research arrives ---------------------------------------
// The side panel has about three seconds before it should show something, and
// the research run under it takes 5 to 20 seconds. Scout S1 lands in about a
// second, so there is no reason for the panel to sit empty until S2 finishes.
// So the analyst assesses whatever has landed SO FAR each time a scout
// finishes, instead of assessing once at the end.
//
// This does not drive the research run. The part that drives it (the
// orchestrator) imports no model code at all, and its tests need no fake
// model. The caller joins the two together:
//
//   const analyst = createResearchAnalyst(domain, { onFinding: send })
//   const run = await runResearch(domain, {
//     onScoutResolved: analyst.onScoutResolved,
//   })
//   const assessment = await analyst.settled()
//
// Re-assessing costs nothing when there is nothing new: a scout that finishes
// without adding a single source produces identical research text, so we reuse
// the saved answer instead of paying for the model again. Nothing here has to
// work out which scouts "matter".

export type ResearchAnalyst = {
  /* Hand this straight to `runResearch`. It returns immediately and queues the
     work in the background, because the research run must never wait on a
     model call before starting the next scout. */
  onScoutResolved: (result: ScoutResult<unknown>) => void
  /* Finishes once every queued assessment is done, and gives back everything
     that was found across all of them. */
  settled: () => Promise<ResearchAssessment>
}

export function createResearchAnalyst(
  domain: string,
  options: { onFinding?: (finding: ResearchFinding) => void } = {},
): ResearchAnalyst {
  const results: Partial<Record<ScoutId, ScoutResult<unknown>>> = {}
  /* We remember findings between passes, so something the prospect already saw
     from the S1 pass does not appear again when S2 lands. We remember them by
     source plus sentence, because one URL can back more than one finding. */
  const seen = new Set<string>()
  const findings: ResearchFinding[] = []
  let latest: ResearchAssessment = EMPTY_ASSESSMENT

  /* One assessment at a time. Two running at once over overlapping research
     would repeat work and drop findings into the panel out of order. Making
     them wait costs nothing, because a queued assessment reads the research at
     the moment it STARTS, so it picks up everything that landed while it was
     waiting. */
  let chain: Promise<void> = Promise.resolve()

  const emit = (finding: ResearchFinding) => {
    const key = `${finding.sourceUrl}\n${finding.headline}`
    if (seen.has(key)) return
    seen.add(key)
    findings.push(finding)
    try {
      options.onFinding?.(finding)
    } catch {
      /* If the caller's own callback throws, that is the caller's problem, not
         a reason to fail the assessment. Same deal as `onScoutResolved`. */
    }
  }

  return {
    onScoutResolved(result) {
      if (!result?.scout) return
      results[result.scout] = result
      chain = chain.then(async () => {
        /* We take the copy when this actually runs, not when it was queued. If
           S2 landed while the S1 pass was still going, this run should see
           both, rather than repeating the assessment we just did. */
        const snapshot = { ...results }
        const coverage: Coverage = {}
        for (const [scout, landed] of Object.entries(snapshot) as [
          ScoutId,
          ScoutResult<unknown>,
        ][]) {
          coverage[scout] = landed.status as ScoutStatus
        }
        latest = await assessResearch(domain, snapshot, {
          coverage,
          onFinding: emit,
        })
      })
    },

    async settled() {
      await chain
      return {
        ...latest,
        findings,
        /* This list can only be empty if every pass produced nothing we could
           cite. And with nothing to cite we cannot claim anything about the
           company, whatever the last pass said. */
        confidenceTier: findings.length === 0 ? 'THIN' : latest.confidenceTier,
      }
    },
  }
}
