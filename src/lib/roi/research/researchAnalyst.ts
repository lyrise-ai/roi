// ─────────────────────────────────────────────────────────────────────────────
// researchAnalyst — the agent that reads everything the scouts found and works
// out what it means, WHILE the interview is still happening (LYR-187).
//
// There are two agents in this product and they are easy to confuse:
//
//   researchAnalyst (this file)  runs during the interview, ~3-20s
//                                input:  research only
//                                output: human-readable findings for the
//                                        sidebar, as they are found
//
//   the report writer            runs after the interview
//                                input:  this agent's output PLUS every
//                                        interview answer
//                                output: the observation and the report
//
// They cannot be one agent: when the sidebar paints, the interview answers do
// not exist yet. This one's output becomes the writer's input.
//
// This replaces a hardcoded `MANUAL_WORK_VERBS` set that used to decide which
// task verbs implied automatable work. That approach was wrong on its face and
// wrong in measurement: written a priori from a back-office picture —
// reconcile, re-key, chase invoices — it matched NOTHING across 22 real
// professional-services firms, and widening it until the number moved is
// tuning a knob, not taking a measurement.
//
// The deeper problem is that the question is not lexical. `review` is document
// review at a law firm and performance review at a consultancy. `liaise` is
// chasing missing paperwork at one firm and stakeholder management at another.
// A bare verb, stripped of the posting it came from, cannot carry that — so no
// list of verbs can ever be right.
//
// So the judgement moves to an agent with the whole picture in front of it:
// every posting, its excerpt, its named systems, what each scout attempted and
// what it failed to reach. It reasons the way a person would — read the
// research, then say what it means — rather than pattern-matching strings.
//
// ── What keeps it honest ─────────────────────────────────────────────────────
//
// Reasoning freely is the point; inventing is still not allowed. Two rules,
// both enforced in code after the model returns rather than requested in the
// prompt:
//
//   1. Every finding must cite a `sourceUrl` that appears in the fact store.
//      A citation the store does not contain is dropped, not published. This is
//      what makes a human-readable sidebar safe to put in front of a prospect —
//      every line on it can be clicked and checked.
//
//   2. A claim about a company we could not reach is unreachable by
//      construction, because there are no sources to cite.
//
// Numbers from this file are NOT reproducible run to run. That is a deliberate,
// accepted trade: an agent that reasons about what the research means is worth
// more than a constant that produces the same wrong answer every time.
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
   This is what the scan panel renders — not a URL dump. */
export type ResearchFinding = {
  /* A short human sentence. "You're hiring a paralegal whose first listed duty
     is chasing outstanding client documents" — not "job_posting: paralegal". */
  headline: string
  /* Which scout's territory this came from, for panel grouping and dedupe. */
  kind: string
  sourceUrl: SourceUrl
  /* Verbatim from the source where one exists, so a writer can quote rather
     than paraphrase. */
  excerpt?: string
  /* Carried through from the cited fact's own provenance, never from the
     model — neither field is in the schema and the agent never sees them.
     Enrichment data is a monthly-refreshed cache, so the panel dates those
     rows: a six-month-old headcount presented as current is precisely the
     credibility damage this product exists to avoid (LYR-199). */
  sourceType?: SourceType
  retrievedAt?: string
}

/* What a cited URL is allowed to carry into the finding that cites it. Absent
   for a job posting, which is its own source and has no separate provenance
   record; present for anything that arrived as a `Fact`. */
type FindingProvenance = { sourceType?: SourceType; retrievedAt?: string }

/* Every URL the research actually retrieved, which is both the grounding
   whitelist and the provenance lookup. It used to be a bare `Set` of URLs;
   making it a Map is what lets a verified finding inherit the age of the fact
   it cites without the model ever being asked for a date. */
type SourceIndex = Map<string, FindingProvenance>

export type ResearchAssessment = {
  findings: ResearchFinding[]
  /* What this specific company appears to do by hand, in the agent's words and
     grounded in its own postings — the replacement for the verb set. */
  manualWorkSignals: string[]
  confidenceTier: ConfidenceTier
  /* Why it landed on that tier. Not shown to a prospect; it is what makes a
     surprising coverage result debuggable. */
  reasoning: string
  /* What we could not establish. Stated so a thin result reads as a gap in our
     looking rather than as an empty company. */
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

/* Everything the agent is allowed to reason over, flattened to text. Passing
   the raw scout objects would spend most of the context on machinery; this
   keeps the postings, their excerpts and the coverage picture, which is what
   the judgement actually turns on. */
function renderResearch(
  domain: string,
  results: Partial<Record<ScoutId, ScoutResult<unknown>>>,
): { prompt: string; sources: SourceIndex } {
  const sources: SourceIndex = new Map()
  const lines: string[] = [`Company domain: ${domain}`, '']

  /* First writer wins, unless the later one actually carries provenance: one
     URL can back both a posting (which has none of its own) and an S1 fact
     (which does), and only the latter can date the row. */
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

    /* S2 postings — the richest material, and the only dated testimony. */
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

    /* Everything else that arrived as a Fact — S1's firmographics today, S3+
       later — without this file needing to know each scout's shape. */
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

    /* Stated so the agent can tell "this company has nothing" apart from "we
       could not reach it" — the distinction the whole subsystem turns on. */
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

/* Verifies one finding, or returns null. A citation the fact store does not
   contain is dropped, not published — enforced here rather than asked for in
   the prompt, because a prompt can be talked past and a filter cannot.

   Per-finding rather than per-batch specifically so the streaming path cannot
   become a hole in the grounding rule: a finding is checked before it is
   emitted, whether it arrives in a stream or all at once. */
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

// ── Assessment cache ─────────────────────────────────────────────────────────
// Keyed on a hash of the rendered research rather than on the domain, so a
// cached assessment is only reused when the research behind it is byte-for-byte
// the same. Keying on domain would serve stale reasoning after the scouts found
// something new, and would collapse the partial assessment made when only S1
// has landed with the full one made after S2.
//
// It also does double duty on the incremental path: a scout that lands without
// adding a single new source renders the same prompt, so the re-assessment it
// triggers is a cache hit rather than a second bill.
//
// Two layers and both best-effort, mirroring `artifactCache`: memory collapses
// repeats inside one lambda, Supabase carries across invocations, and an
// unreachable database degrades to no cache rather than to a failed run.

export const ASSESSMENT_TTL_MS = 24 * 60 * 60 * 1000

const memory = new Map<
  string,
  { assessment: ResearchAssessment; expiresAt: number }
>()

/* For tests, and for `npm run dev` where a stale assessment would otherwise
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
  /* The deterministic coverage snapshot. Given to the agent as evidence rather
     than as an instruction — it is a cheap, already-tested summary of which
     scouts got anywhere, and the agent is free to disagree with what it
     implies. */
  coverage?: Coverage
  /* Called once per finding, the moment it has streamed in and its citation has
     been checked — NOT at the end. The sidebar paints while the prospect is
     still typing, so a finding that arrives at second 4 must be renderable at
     second 4. A cache hit replays through this too, so a cached run paints the
     same way a live one does. */
  onFinding?: (finding: ResearchFinding) => void
}

export async function assessResearch(
  domain: string,
  results: Partial<Record<ScoutId, ScoutResult<unknown>>>,
  options: AssessOptions = {},
): Promise<ResearchAssessment> {
  const { prompt: research, sources } = renderResearch(domain, results)

  if (sources.size === 0) {
    /* Nothing was retrieved, so nothing can be cited, so there is nothing to
       reason about. Skipping the call is both cheaper and more honest than
       asking a model to find meaning in an empty page. */
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
    /* `partialObjectStream` is documented as unvalidated, and an error that
       stops the stream does not necessarily surface as a rejection there — the
       loop can simply end early. Without this flag a truncated assessment
       would look like a complete one and get CACHED for a day, which is the
       silent-failure shape this codebase is explicitly built against. */
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

    /* Emit each finding as it completes rather than after the whole object
       parses. A finding is only structurally complete once a LATER one has
       started — until then the JSON parser is still filling it in, and its
       `excerpt` (last in the schema) may not have arrived. So everything
       before the tail is safe to emit, and the tail is flushed from the final
       object below.

       The citation check runs here, per finding, before anything is emitted.
       Streaming must not become a hole in the grounding rule. */
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

    /* Before the tail is flushed, not after: the tail is the one element the
       parser had not finished, so on a broken stream its headline may be half
       a sentence. Everything before it was already emitted and stays. */
    if (streamFailed) throw streamFailed

    flushTo(
      Array.isArray(last.findings)
        ? (last.findings as Record<string, unknown>[])
        : [],
      Array.isArray(last.findings) ? (last.findings as unknown[]).length : 0,
    )

    /* If every finding was dropped for a bad citation, the tier cannot be RICH
       whatever the model said — there is, by then, nothing to be specific
       about. */
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
    /* Never throws. Research that cannot be assessed degrades to "we know
       nothing", which is the safe direction — it makes downstream writers
       quieter, not louder.

       Deliberately NOT cached: a failure is a fact about this moment, not about
       this research, and caching it would keep a company thin for a day over a
       transient error. Findings that already streamed are kept — they were
       verified individually, and a stream that died halfway still told the
       truth about the part that arrived. */
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

// ── The incremental analyst ──────────────────────────────────────────────────
// The sidebar has about three seconds to first paint, and the research run it
// sits on takes 5-20s. S1 lands in ~1s; there is no reason the panel is empty
// until S2 finishes. So the analyst assesses what has landed SO FAR each time a
// scout resolves, rather than once at the end.
//
// This does not orchestrate the run — the orchestrator stays free of any LLM
// import, and its tests stay free of a model stub. The caller wires the two
// together:
//
//   const analyst = createResearchAnalyst(domain, { onFinding: send })
//   const run = await runResearch(domain, {
//     onScoutResolved: analyst.onScoutResolved,
//   })
//   const assessment = await analyst.settled()
//
// Re-assessment is cheap when it is pointless: a scout that lands without
// contributing a single new source renders an identical prompt, so the
// re-assessment it triggers is a cache hit rather than a second bill. Nothing
// here needs to reason about which scouts "matter".

export type ResearchAnalyst = {
  /* Pass straight to `runResearch`. Fire-and-forget — it returns immediately
     and queues the work, because the orchestrator must not wait on a model
     call to land the next scout. */
  onScoutResolved: (result: ScoutResult<unknown>) => void
  /* Resolves once every queued assessment has finished, with the union of
     everything that was emitted. */
  settled: () => Promise<ResearchAssessment>
}

export function createResearchAnalyst(
  domain: string,
  options: { onFinding?: (finding: ResearchFinding) => void } = {},
): ResearchAnalyst {
  const results: Partial<Record<ScoutId, ScoutResult<unknown>>> = {}
  /* Findings survive across assessments, so a finding the S1-only pass already
     showed the prospect does not appear a second time when S2 lands. Keyed on
     source plus headline: the same URL supports more than one finding. */
  const seen = new Set<string>()
  const findings: ResearchFinding[] = []
  let latest: ResearchAssessment = EMPTY_ASSESSMENT

  /* One assessment at a time. Two concurrent calls over overlapping research
     would duplicate work and interleave findings into the panel out of order,
     and serialising costs nothing — the queued run reads the fact store at the
     moment it STARTS, so it sees everything that landed while it waited. */
  let chain: Promise<void> = Promise.resolve()

  const emit = (finding: ResearchFinding) => {
    const key = `${finding.sourceUrl}\n${finding.headline}`
    if (seen.has(key)) return
    seen.add(key)
    findings.push(finding)
    try {
      options.onFinding?.(finding)
    } catch {
      /* A consumer's callback throwing is the consumer's problem, not a reason
         to fail the assessment. Same contract as `onScoutResolved`. */
    }
  }

  return {
    onScoutResolved(result) {
      if (!result?.scout) return
      results[result.scout] = result
      chain = chain.then(async () => {
        /* Snapshot at execution time, not at schedule time: if S2 landed while
           the S1 pass was in flight, this run should see both rather than
           re-running the assessment we just did. */
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
        /* The union can only be empty if every pass produced nothing citable,
           and nothing citable cannot support an external claim whatever the
           last pass reported. */
        confidenceTier: findings.length === 0 ? 'THIN' : latest.confidenceTier,
      }
    },
  }
}
