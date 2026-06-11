/* eslint-disable no-restricted-syntax */
/* eslint-disable no-continue */
// ─────────────────────────────────────────────────────────────────────────────
// Unified ROI Report Agent
// Single streamText agent handles both generation and chat-based editing.
// Tools mutate ReportState in-place; onReportUpdate fires on every assembled change.
// Single sources of truth: state.company, state.globals, state.workflows, state.copy
// Everything else (calcOutput, assembled, renderedHtml) is derived on demand.
// ─────────────────────────────────────────────────────────────────────────────

import {
  streamText,
  generateObject,
  jsonSchema,
  tool,
  stepCountIs,
  type ModelMessage,
} from 'ai'
import { z } from 'zod'

import { researchModel, fastModel } from '@/src/lib/roi/llm'
import { UsageTracker } from '@/src/lib/roi/services/usageTracker'
import { webSearch } from '@/src/lib/roi/tools/webSearch'
import { fetchPage } from '@/src/lib/roi/tools/fetchPage'
import { roiCalculator } from '@/src/lib/roi/pipeline/roiCalculator'
import { assembleReport } from '@/src/lib/roi/pipeline/assembleReport'
import { renderTemplate } from '@/src/lib/roi/pipeline/renderTemplate'
import { roiLog, roiWarn } from '@/src/lib/roi/debug'
import {
  ROI_MODELER_SYSTEM_PROMPT,
  ROI_MODELER_SCHEMA,
} from '@/src/lib/roi/prompts/roiModeler'

import type {
  ReportState,
  AgentCallbacks,
  WorkflowInput,
  GlobalInputs,
  ReportCopy,
  ProfitLever,
  ResilienceRow,
  RiskRow,
  CostOfDelayData,
} from '@/src/lib/roi/types'

// ── Modeler LLM output type (local — not exported) ────────────────────────────

interface ModelerResult {
  currency: { code: string; symbol: string; name: string }
  costs: { implementationCost: number; monthlyToolingCost: number }
  labor: { fullyLoadedHourlyCost: number; workWeeksPerYear: number }
  realizationFactor: number
  profitMultiplier: number
  workflowAssumptions: Array<{
    workflowName: string
    monthlyVolume: number
    minutesPerItemBefore: number
    minutesPerItemAfter: number
    exceptionRate: number
    exceptionMinutes: number
    adoption_base: number
    rationale: string
    fullyLoadedHourlyCostOverride: number
    seniorityLevel?: string
    rateSource?: string
    rateSourceUrl?: string | null
  }>
}

export { PIPELINE_LOG_TOOL_NAMES } from '@/src/lib/roi/constants'

// Map a salary-source URL hostname to a clean display label. We trust the URL
// over the modeler's free-text rateSource — if the URL is real, derive the
// label from it so the Provenance table never says "Bayt" for a glassdoor.com
// link or "Glassdoor" for a generic linkedin.com link.
function deriveRateSourceFromUrl(
  url: string | null | undefined,
): string | null {
  if (!url) return null
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
  const KNOWN: Array<[RegExp, string]> = [
    [/(^|\.)glassdoor\./, 'Glassdoor'],
    [/(^|\.)bayt\./, 'Bayt.com'],
    [/(^|\.)gulftalent\./, 'Gulf Talent'],
    [/(^|\.)roberthalf\./, 'Robert Half'],
    [/(^|\.)levels\.fyi$/, 'Levels.fyi'],
    [/(^|\.)payscale\./, 'PayScale'],
    [/(^|\.)indeed\./, 'Indeed'],
    [/(^|\.)linkedin\./, 'LinkedIn Salary Insights'],
    [/(^|\.)salary\.com$/, 'Salary.com'],
    [/(^|\.)salaryexpert\./, 'SalaryExpert'],
    [/(^|\.)talent\.com$/, 'Talent.com'],
    [/(^|\.)naukrigulf\./, 'NaukriGulf'],
    [/(^|\.)wuzzuf\./, 'Wuzzuf'],
    [/(^|\.)comparably\./, 'Comparably'],
    [/(^|\.)builtin\./, 'Built In'],
  ]
  for (const [re, label] of KNOWN) {
    if (re.test(host)) return label
  }
  // Fall back to a tidied hostname (drop trailing TLD, capitalise).
  const stem = host.split('.').slice(0, -1).join('.') || host
  return stem.charAt(0).toUpperCase() + stem.slice(1)
}

// Map free-text seniority strings (from modeler) to the three calculator tiers.
function classifySeniority(s?: string | null): 'junior' | 'mid' | 'senior' {
  if (!s) return 'mid'
  const l = s.toLowerCase()
  if (/(senior|director|manager|partner|head|chief|vp|principal|lead)/.test(l))
    return 'senior'
  if (/(junior|admin|assistant|entry|coordinator|clerk|intern)/.test(l))
    return 'junior'
  return 'mid'
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function reAssemble(
  state: ReportState,
  execTemplateHtml: string,
  fullTemplateHtml: string,
  callbacks: AgentCallbacks,
  changedSections?: string[],
) {
  if (!state.workflows || !state.globals || !state.company) return
  state.calcOutput = roiCalculator(
    state.workflows,
    state.globals,
    state.company,
  )
  if (!state.copy || !state.normInput) return
  callbacks.onPipelineLog?.('Rendering financial tables and report layout…')
  state.assembled = assembleReport(state)
  state.renderedHtml = renderTemplate(execTemplateHtml, state.assembled)
  state.renderedFullHtml = renderTemplate(fullTemplateHtml, state.assembled)
  callbacks.onReportUpdate(state, changedSections)
}

function ensureEvidenceItems(state: ReportState) {
  if (!Array.isArray(state.evidenceItems)) {
    state.evidenceItems = []
  }
  return state.evidenceItems
}

function mapWorkflowSourceTypeToEvidenceSource(
  sourceType: WorkflowInput['sourceType'],
): 'scraped' | 'benchmarked' | 'assumed' {
  if (sourceType === 'research_derived') return 'scraped'
  if (sourceType === 'user_stated') return 'assumed'
  return 'benchmarked'
}

function addEvidence(
  state: ReportState,
  item: {
    kind:
      | 'search_result'
      | 'search_answer'
      | 'page_content'
      | 'research_summary'
      | 'workflow_signal'
      | 'company_fact'
      | 'unknown'
    url?: string | null
    title?: string | null
    query?: string | null
    snippet?: string | null
    content?: string | null
    sourceType?: 'scraped' | 'benchmarked' | 'assumed' | null
    confidence?: 'high' | 'medium' | 'low' | null
    facts?: Record<string, unknown>
    usedInSections?: string[]
  },
) {
  const evidenceItems = ensureEvidenceItems(state)
  evidenceItems.push({
    ...item,
    createdAt: new Date().toISOString(),
  })
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const COMPANY_SEARCH_POOL = [
  'Profiling company from public sources…',
  'Looking up company intelligence…',
  'Estimating headcount and revenue…',
  'Checking company footprint…',
]

const SALARY_SEARCH_POOL = [
  'Sourcing salary benchmarks…',
  'Querying role-based pay rates…',
  'Checking regional compensation data…',
  'Cross-referencing wage market data…',
  'Collecting salary evidence…',
]

const SALARY_SEARCH_RE =
  /salary|hourly rate|compensation|glassdoor|bayt\.com|gulftalent|payscale|naukrigulf|wuzzuf|comparably|talent\.com/i

function buildTools(
  state: ReportState,
  execTemplateHtml: string,
  fullTemplateHtml: string,
  callbacks: AgentCallbacks,
  tracker?: UsageTracker,
) {
  let companySearchCount = 0
  let salarySearchCount = 0

  return {
    // ── Research tools ──────────────────────────────────────────────────────
    web_search: tool({
      description:
        'Search the web for company intelligence, industry benchmarks, or financial data.',
      inputSchema: z.object({
        query: z.string().describe('The search query'),
        maxResults: z
          .number()
          .optional()
          .describe('Max results to return (default 5)'),
      }),
      execute: async ({
        query,
        maxResults,
      }: {
        query: string
        maxResults?: number
      }) => {
        roiLog('tool:web_search', `query: "${query}"`, {
          maxResults: maxResults ?? 3,
        })
        if (SALARY_SEARCH_RE.test(query)) {
          // eslint-disable-next-line security/detect-object-injection
          callbacks.onPipelineLog?.(SALARY_SEARCH_POOL[salarySearchCount % SALARY_SEARCH_POOL.length])
          salarySearchCount++
        } else {
          // eslint-disable-next-line security/detect-object-injection
          callbacks.onPipelineLog?.(COMPANY_SEARCH_POOL[companySearchCount % COMPANY_SEARCH_POOL.length])
          companySearchCount++
        }
        const response = await webSearch(query, maxResults ?? 3)
        roiLog(
          'tool:web_search',
          `→ ${response.results?.length ?? 0} results, answer=${
            response.answer ? 'yes' : 'no'
          }`,
          (response.results ?? []).slice(0, 3).map((r) => r.url),
        )

        if (response.answer) {
          addEvidence(state, {
            kind: 'search_answer',
            query,
            snippet: response.answer,
            sourceType: 'benchmarked',
            usedInSections: ['research'],
          })
        }

        ;(response.results ?? []).forEach((result) => {
          addEvidence(state, {
            kind: 'search_result',
            query,
            url: result.url,
            title: result.title,
            snippet: result.content,
            sourceType: result.url ? 'scraped' : 'benchmarked',
            usedInSections: ['research'],
          })
        })

        return response
      },
    }),

    fetch_page: tool({
      description:
        'Fetch and read the content of a web page (company website, LinkedIn, Apollo, etc.).',
      inputSchema: z.object({
        url: z.string().describe('The URL to fetch'),
      }),
      execute: async ({ url }: { url: string }) => {
        roiLog('tool:fetch_page', `fetching: ${url}`)
        callbacks.onPipelineLog?.('Reading company website…')
        const content = await fetchPage(url)
        roiLog(
          'tool:fetch_page',
          `→ ${content.length} chars from ${url.slice(0, 80)}`,
        )
        addEvidence(state, {
          kind: 'page_content',
          url,
          title: url,
          content,
          snippet: content.slice(0, 1200),
          sourceType: 'scraped',
          usedInSections: ['research'],
        })
        return content
      },
    }),

    // ── Evidence lookup tool (chat mode) ────────────────────────────────────
    search_evidence: tool({
      description:
        'Search the evidence gathered during report generation. Use this when the user asks where a figure came from, why a value was chosen, or what sources back a claim. Check here before calling web_search.',
      inputSchema: z.object({
        query: z
          .string()
          .describe(
            'Keywords to match, e.g. "labor rate", "revenue", "employee count"',
          ),
      }),
      execute: async ({ query }: { query: string }) => {
        const items = state.evidenceItems ?? []
        if (items.length === 0)
          return {
            results: [],
            note: 'No evidence recorded for this report.',
          }
        const q = query.toLowerCase()
        const matches = items
          .filter((e) =>
            [e.snippet, e.title, e.query, e.url].some((f) =>
              f?.toLowerCase().includes(q),
            ),
          )
          .slice(0, 8)
          .map((e) => ({
            source: e.url ?? (e.query ? `search: "${e.query}"` : 'internal'),
            snippet: (e.snippet ?? '').slice(0, 400),
            sourceType: e.sourceType,
            confidence: e.confidence,
          }))
        return {
          results: matches,
          total_evidence_items: items.length,
          note:
            matches.length === 0
              ? 'No matching evidence — try broader keywords or web_search for new data.'
              : undefined,
        }
      },
    }),

    // ── Generation tools (sequenced during initial generation) ──────────────
    set_research_output: tool({
      description:
        'Lock in the research findings: company profile, pain points, and workflows. Call this after completing all research.',
      inputSchema: z.object({
        company_profile: z.object({
          company: z.string(),
          industry: z.string(),
          country: z.string().nullable(),
          primaryFocus: z.string().nullable(),
          keyPriorities: z.array(z.string()),
          employees: z.number().nullable(),
          revenueEstimateM: z.number().nullable(),
        }),
        pain_points: z.array(
          z.object({
            title: z.string(),
            description: z.string(),
            confidence: z.enum(['high', 'medium', 'low']),
            source: z.enum(['user_stated', 'inferred', 'research_derived']),
          }),
        ),
        workflows: z
          .array(
            z.object({
              name: z.string(),
              function: z.string(),
              owner: z.string(),
              whyItMatters: z.string(),
              agentName: z.string(),
              expectedOutcome: z.string(),
              sourceType: z.enum([
                'user_stated',
                'inferred',
                'research_derived',
              ]),
              monthlyVolume: z
                .number()
                .optional()
                .describe('Monthly volume — must provide a positive number'),
              minutesPerItemBefore: z
                .number()
                .optional()
                .describe(
                  'Minutes per task before AI — must provide a positive number',
                ),
              minutesPerItemAfter: z
                .number()
                .optional()
                .describe(
                  'Minutes per task after AI — must provide a positive number',
                ),
              volumeRationale: z.string().optional(),
            }),
          )
          .length(4)
          .describe(
            'Exactly 4 workflows required (template instructions v3.2 — Phase 5). Infer from industry benchmarks if not found online.',
          ),
        salary_evidence: z
          .array(
            z.object({
              workflowName: z
                .string()
                .describe(
                  'Must exactly match a workflow.name above so the modeler can join.',
                ),
              roleQueried: z
                .string()
                .describe(
                  'The role + region you searched for, e.g. "Senior sales executive in UAE"',
                ),
              sourceUrls: z
                .array(z.string())
                .describe(
                  'URLs of the salary search results you used (Glassdoor, Bayt, Gulf Talent, Robert Half, Levels.fyi, Payscale, etc.)',
                ),
              rawSnippets: z
                .array(z.string())
                .describe(
                  'Verbatim snippets from search results that contain the actual salary numbers.',
                ),
              parsedAnnualLow: z
                .number()
                .nullable()
                .describe(
                  'Best-effort lower bound of annual salary parsed from snippets. Null if you could not parse a number.',
                ),
              parsedAnnualHigh: z
                .number()
                .nullable()
                .describe(
                  'Best-effort upper bound of annual salary parsed from snippets. Null if you could not parse a number.',
                ),
              evidenceCurrency: z
                .string()
                .nullable()
                .describe(
                  'ISO currency code of the parsed numbers (e.g. "USD", "AED", "EGP"). Null if unknown.',
                ),
            }),
          )
          .optional()
          .describe(
            'One entry per workflow. Required whenever web research is enabled — the modeler uses these to set rates from real sources instead of guessing. Skip only in estimates-only mode.',
          ),
        researchSummary: z.string().optional(),
        confidenceLevel: z.enum(['high', 'low']),
        coreThesis: z.string(),
      }),
      execute: async (input) => {
        const cp = input.company_profile
        callbacks.onPipelineLog?.(`Research complete — ${input.workflows.length} workflows identified…`)
        roiLog('tool:set_research', `locking research for ${cp.company}`, {
          industry: cp.industry,
          country: cp.country,
          employees: cp.employees,
          revenueM: cp.revenueEstimateM,
          confidence: input.confidenceLevel,
          workflowCount: input.workflows.length,
          painPointCount: input.pain_points.length,
          salaryEvidenceCount: input.salary_evidence?.length ?? 0,
        })
        if (!input.salary_evidence || input.salary_evidence.length === 0) {
          roiWarn(
            'tool:set_research',
            'no salary_evidence provided — modeler will fall back to regional benchmark table for ALL workflows',
          )
        } else {
          input.salary_evidence.forEach((ev) => {
            roiLog(
              'tool:set_research',
              `  evidence[${ev.workflowName}]: role="${ev.roleQueried}" urls=${
                ev.sourceUrls.length
              } parsed=${ev.parsedAnnualLow ?? '?'}–${
                ev.parsedAnnualHigh ?? '?'
              } ${ev.evidenceCurrency ?? ''}`,
            )
          })
        }
        state.company = {
          company: cp.company,
          industry: cp.industry,
          country: cp.country ?? null,
          primaryFocus: cp.primaryFocus ?? null,
          keyPriorities: cp.keyPriorities,
          employees: cp.employees ?? null,
          revenueEstimateM: cp.revenueEstimateM ?? null,
        }
        state.workflows = input.workflows.map((w) => ({
          name: w.name,
          agentName: w.agentName,
          function: w.function,
          owner: w.owner,
          whyItMatters: w.whyItMatters,
          expectedOutcome: w.expectedOutcome,
          sourceType: w.sourceType,
          monthlyVolume:
            w.monthlyVolume && w.monthlyVolume > 0 ? w.monthlyVolume : 100,
          minutesPerItemBefore:
            w.minutesPerItemBefore && w.minutesPerItemBefore > 0
              ? w.minutesPerItemBefore
              : 60,
          minutesPerItemAfter:
            w.minutesPerItemAfter && w.minutesPerItemAfter > 0
              ? w.minutesPerItemAfter
              : 12,
          adoptionRate: 0.7,
          exceptionRate: 0.08,
          exceptionMinutes: 12,
          rateOverride: null,
          seniorityLevel: null,
          rateSource: null,
          rateSourceUrl: null,
          rationale: w.volumeRationale ?? '',
        }))
        state.painPoints = input.pain_points
        state.researchSummary = input.researchSummary ?? null
        state.confidenceLevel = input.confidenceLevel
        state.coreThesis = input.coreThesis
        state.salaryEvidence = input.salary_evidence ?? []

        // Surface salary evidence in the evidence panel so it shows up in the UI
        ;(input.salary_evidence ?? []).forEach((ev) => {
          ev.sourceUrls.forEach((url, idx) => {
            addEvidence(state, {
              kind: 'search_result',
              query: `salary: ${ev.roleQueried}`,
              url,
              title: `Salary evidence for ${ev.workflowName}`,
              snippet: ev.rawSnippets[idx] ?? ev.rawSnippets[0] ?? '',
              sourceType: 'scraped',
              usedInSections: ['research', 'financials'],
            })
          })
        })

        if (input.researchSummary) {
          addEvidence(state, {
            kind: 'research_summary',
            snippet: input.researchSummary,
            sourceType:
              input.confidenceLevel === 'high' ? 'scraped' : 'benchmarked',
            confidence: input.confidenceLevel,
            usedInSections: ['research', 'thesis'],
          })
        }

        ;[
          cp.primaryFocus
            ? { title: 'Primary focus', value: cp.primaryFocus }
            : null,
          cp.employees != null
            ? { title: 'Employee count', value: cp.employees }
            : null,
          cp.revenueEstimateM != null
            ? { title: 'Revenue estimate (M)', value: cp.revenueEstimateM }
            : null,
          cp.country ? { title: 'Country', value: cp.country } : null,
        ]
          .filter(Boolean)
          .forEach((fact) => {
            addEvidence(state, {
              kind: 'company_fact',
              title: fact!.title,
              snippet: String(fact!.value),
              sourceType:
                input.confidenceLevel === 'high' ? 'scraped' : 'benchmarked',
              confidence: input.confidenceLevel,
              facts: { key: fact!.title, value: fact!.value },
              usedInSections: ['research'],
            })
          })

        input.workflows.forEach((workflow) => {
          addEvidence(state, {
            kind: 'workflow_signal',
            title: workflow.name,
            snippet: workflow.whyItMatters,
            sourceType: mapWorkflowSourceTypeToEvidenceSource(
              workflow.sourceType,
            ),
            confidence: input.confidenceLevel,
            facts: {
              monthlyVolume: workflow.monthlyVolume ?? null,
              minutesPerItemBefore: workflow.minutesPerItemBefore ?? null,
              minutesPerItemAfter: workflow.minutesPerItemAfter ?? null,
              rationale: workflow.volumeRationale ?? '',
            },
            usedInSections: ['workflows', 'financials'],
          })
        })

        return { ok: true, workflows: state.workflows.map((w) => w.name) }
      },
    }),

    run_financial_model: tool({
      description:
        'Run the financial model: calls the ROI modeler LLM, then the pure-TS calculator. Includes sanity checks (Rules 6B, 6D, 6E). Call after set_research_output.',
      inputSchema: z.object({}),
      execute: async () => {
        if (!state.workflows || !state.company || !state.normInput) {
          return {
            error: 'run_financial_model called before set_research_output',
          }
        }

        // Fix 1: surface scraped rate/salary signals to the modeler
        const rateSignals = (state.evidenceItems ?? [])
          .filter(
            (item) =>
              item.kind === 'search_result' ||
              item.kind === 'search_answer' ||
              item.kind === 'page_content',
          )
          .slice(0, 12)
          .map((item) => ({
            query: item.query ?? null,
            snippet: (item.snippet ?? '').slice(0, 400),
            url: item.url ?? null,
          }))

        // Pre-compute TFG target band so the modeler hits Rule 6B on the first try
        const revenueU = (state.company.revenueEstimateM ?? 0) * 1e6
        const tfgTargetRange =
          revenueU > 0 && state.confidenceLevel !== 'low'
            ? {
                min: Math.round(revenueU * 0.05),
                max: Math.round(revenueU * 0.2),
              }
            : null

        // Currencies whose official symbols are non-Latin script — built once outside the loop
        const SCRIPT_SYMBOL_CODES = new Set([
          'SAR',
          'AED',
          'QAR',
          'KWD',
          'BHD',
          'OMR',
          'EGP',
          'JOD',
          'IQD',
          'LBP',
          'IRR',
          'YER',
        ])

        const modelerUserContent = JSON.stringify({
          company_profile: state.company,
          // Fix 3: include owner so modeler can differentiate by seniority
          workflows: state.workflows.map((w) => ({
            name: w.name,
            function: w.function,
            owner: w.owner,
            monthlyVolume: w.monthlyVolume,
            minutesPerItemBefore: w.minutesPerItemBefore,
            minutesPerItemAfter: w.minutesPerItemAfter,
            volumeRationale: w.rationale,
          })),
          // Salary evidence collected during research — modeler MUST use this to set
          // fullyLoadedHourlyCostOverride per workflow instead of guessing.
          salary_evidence: state.salaryEvidence ?? [],
          processes: state.normInput.processes,
          selectedCurrency: state.normInput.selectedCurrency,
          country: state.normInput.country,
          teamSize: state.normInput.teamSize,
          revenueRange: state.normInput.revenueRange,
          researchSummary: state.researchSummary ?? undefined,
          researchEvidence: rateSignals.length > 0 ? rateSignals : undefined,
          ...(tfgTargetRange && { tfg_target_range: tfgTargetRange }),
        })

        let globals: GlobalInputs | null = null
        let updatedWorkflows: WorkflowInput[] | null = null
        let lastError = ''

        callbacks.onPipelineLog?.('Calibrating ROI model inputs…')
        roiLog('modeler', 'starting financial model', {
          workflowCount: state.workflows.length,
          salaryEvidenceCount: state.salaryEvidence?.length ?? 0,
          country: state.normInput.country,
          revenueRangeFromForm: state.normInput.revenueRange,
          revenueEstimateM: state.company?.revenueEstimateM,
        })

        for (let attempt = 0; attempt < 3; attempt++) {
          let retryHint = ''
          if (attempt > 0) {
            let prescription = ''
            if (lastError.includes('Rule 6B')) {
              prescription =
                ' Increase monthlyVolume for all workflows to raise Total Financial Gain into the required band.'
            } else if (lastError.includes('Rule 6E')) {
              prescription =
                ' Set profitMultiplier ≥ 1.8 to satisfy the Profit Uplift / Operational Dividend ratio requirement.'
            }
            retryHint = `\n\nPREVIOUS ATTEMPT FAILED: ${lastError}.${prescription}`
          }

          if (attempt > 0) callbacks.onPipelineLog?.('Refining model assumptions…')
          roiLog(
            'modeler',
            `attempt ${attempt + 1}/3${attempt > 0 ? ' (retry)' : ''}`,
          )

          const result = await generateObject({
            model: fastModel,
            schema: jsonSchema(ROI_MODELER_SCHEMA as object),
            system: ROI_MODELER_SYSTEM_PROMPT,
            prompt: retryHint
              ? modelerUserContent + retryHint
              : modelerUserContent,
          })
          const callLabel = attempt > 0 ? `modeler_retry${attempt}` : 'modeler'
          tracker?.record({
            call: callLabel,
            model: 'gpt-4o-mini',
            ...result.usage,
          })

          const modelerOut = result.object as ModelerResult

          const rawCurrencySym = modelerOut.currency.symbol
          // eslint-disable-next-line no-control-regex
          const hasNonAscii = /[^\x00-\x7F]/.test(rawCurrencySym)
          const cleanSym =
            SCRIPT_SYMBOL_CODES.has(modelerOut.currency.code) || hasNonAscii
              ? modelerOut.currency.code
              : rawCurrencySym
          globals = {
            laborRate: modelerOut.labor.fullyLoadedHourlyCost,
            implementationCost: modelerOut.costs.implementationCost,
            monthlyToolingCost: modelerOut.costs.monthlyToolingCost,
            profitMultiplier: Math.max(
              1.8,
              Math.min(4.0, modelerOut.profitMultiplier),
            ),
            realizationFactor: modelerOut.realizationFactor,
            workWeeksPerYear: modelerOut.labor.workWeeksPerYear,
            currency: {
              ...modelerOut.currency,
              symbol:
                cleanSym.length > 1 && !cleanSym.endsWith(' ')
                  ? cleanSym + ' '
                  : cleanSym,
            },
          }

          // Merge per-workflow assumptions from modeler into state.workflows.
          // Fuzzy match: exact → contains → starts-with, so minor LLM name drift
          // (e.g. "Proposal Drafting" vs "Proposal Drafting and Tailoring") still
          // gets the right assumptions instead of silently falling back to defaults.
          updatedWorkflows = state.workflows!.map((wf) => {
            const assump = modelerOut.workflowAssumptions.find(
              (a) => a.workflowName.toLowerCase() === wf.name.toLowerCase(),
            )
            if (!assump) {
              roiWarn(
                'modeler',
                `no assumption found for workflow "${wf.name}" — keeping defaults`,
              )
              return wf
            }
            const seniority = classifySeniority(assump.seniorityLevel)
            const rawRateSource = assump.rateSource ?? null
            const rateSourceUrl = assump.rateSourceUrl ?? null
            // Trust the URL over the modeler's free-text label. If a real URL
            // is present, derive the source name from its hostname so the
            // Provenance table never disagrees with the link it points to.
            const urlDerived = deriveRateSourceFromUrl(rateSourceUrl)
            const rateSource =
              urlDerived ??
              (rawRateSource === 'benchmark_fallback'
                ? 'benchmark_fallback'
                : rawRateSource)
            roiLog(
              'modeler',
              `  ${wf.name}: rate=${
                assump.fullyLoadedHourlyCostOverride
              }/hr seniority=${seniority} source="${
                rateSource ?? 'NULL'
              }" url=${
                rateSourceUrl ? rateSourceUrl.slice(0, 60) + '…' : 'null'
              }`,
            )
            if (rateSource === 'benchmark_fallback' || !rateSource) {
              roiWarn(
                'modeler',
                `  ↳ workflow "${wf.name}" used FALLBACK rate (no salary evidence consumed)`,
              )
            }
            return {
              ...wf,
              monthlyVolume:
                assump.monthlyVolume > 0
                  ? assump.monthlyVolume
                  : wf.monthlyVolume,
              minutesPerItemBefore:
                assump.minutesPerItemBefore > 0
                  ? assump.minutesPerItemBefore
                  : wf.minutesPerItemBefore,
              minutesPerItemAfter:
                assump.minutesPerItemAfter > 0
                  ? assump.minutesPerItemAfter
                  : wf.minutesPerItemAfter,
              adoptionRate: assump.adoption_base,
              exceptionRate: assump.exceptionRate,
              exceptionMinutes: assump.exceptionMinutes,
              rateOverride: assump.fullyLoadedHourlyCostOverride,
              seniorityLevel: seniority,
              rateSource,
              rateSourceUrl,
              rationale: assump.rationale,
            }
          })

          const calcOut = roiCalculator(
            updatedWorkflows,
            globals,
            state.company!,
          )
          const s = calcOut.summary
          const od = s.operationalDividend12mo
          const pu = s.profitUplift12mo

          // Rule 6B: 5–20% revenue band — enforced mechanically inside roiCalculator
          // via proportional scaling (silent), so no LLM retry needed here.

          roiLog(
            'modeler',
            `attempt ${attempt + 1} calc result: OD=${od} PU=${pu} TFG=${
              s.totalFinancialGain12mo
            } hrs/yr=${s.totalAnnualHours}`,
          )

          // Rule 6E: OD/PU ratio 0.8–3×
          if (od > 0) {
            const puRatio = pu / od
            if (puRatio > 3.0) {
              lastError = `Rule 6E: Profit uplift (${pu}) is ${puRatio.toFixed(
                1,
              )}× the OD (${od}). Cap at 3×.`
              roiWarn('modeler', `retrying: ${lastError}`)
              continue
            }
            if (puRatio < 0.8) {
              lastError = `Rule 6E: Profit uplift (${pu}) is only ${puRatio.toFixed(
                1,
              )}× the OD (${od}). Need ≥0.8×.`
              roiWarn('modeler', `retrying: ${lastError}`)
              continue
            }
          }

          lastError = ''
          state.workflows = updatedWorkflows
          state.globals = globals
          state.calcOutput = calcOut
          roiLog('modeler', `✅ accepted on attempt ${attempt + 1}`)
          callbacks.onPipelineLog?.('3-year financial projections validated…')
          break
        }

        if (!globals || !updatedWorkflows) {
          return { error: 'Financial model failed after retries: ' + lastError }
        }

        const s = state.calcOutput!.summary
        return {
          ok: true,
          currency: globals.currency,
          total_monthly_hours: state.calcOutput!.totalMonthlyHours,
          od12: s.operationalDividend12mo,
          pu12: s.profitUplift12mo,
          tf12: s.totalFinancialGain12mo,
          payback_months: s.paybackMonths,
          figures: state.calcOutput!.figures,
          sanity_note: lastError || 'All checks passed',
        }
      },
    }),

    set_report_copy: tool({
      description:
        'Write and lock in all report copy (9 fields). Call after run_financial_model. This triggers the first report_update event.',
      inputSchema: z.object({
        unified_pattern_thesis: z
          .string()
          .describe('KR-16: 2-3 sentences naming single operating pattern'),
        company_snapshot: z
          .array(
            z.object({
              text: z.string(),
              sourceType: z.enum(['scraped', 'benchmarked', 'assumed']),
            }),
          )
          .describe('3-5 bullets with source tags'),
        cta_paragraph: z
          .string()
          .describe('NS-1: criteria-based CTA paragraph'),
        profit_levers: z
          .array(
            z.object({
              lever_name: z.string(),
              derived_from: z.string(),
              baseline_data: z.string(),
              ai_agent_action: z
                .string()
                .describe(
                  'The specific named action the AI agent takes, e.g. "AI drafts and routes contract renewal notices". No vague efficiency language.',
                ),
              rationale: z.string(),
              rationale_with_arithmetic: z
                .string()
                .optional()
                .describe(
                  'OPTIONAL — leave empty. The arithmetic chain (hrs × rate × redirect %) is built deterministically by assembleReport from the calculator output, so anything written here is overwritten.',
                ),
            }),
          )
          .length(4)
          .describe(
            'Exactly 4 levers — one per workflow, in the same order as the workflow list. Author the prose fields (lever_name, rationale) only; the per-lever arithmetic is generated by the pipeline.',
          ),
        cost_of_delay: z.object({
          narrative: z
            .string()
            .describe(
              'Company-specific reason for urgency. Do NOT embed a dollar figure — the monthly cost is computed by the calculator and shown separately. Must end with: "Delay is not neutral — it carries a monthly price."',
            ),
        }),
        resilience_rows: z
          .array(
            z.object({
              dimension: z.string(),
              act_now: z.string(),
              defer: z.string(),
            }),
          )
          .length(4),
        pilot_recommendation: z.string(),
        risks: z
          .array(
            z.object({
              risk: z.string(),
              detail: z
                .string()
                .describe('2-3 sentences specific to this company'),
              mitigation: z.string(),
            }),
          )
          .min(3),
      }),
      execute: async (copy: ReportCopy) => {
        state.copy = copy
        callbacks.onPipelineLog?.('Writing profit levers and executive summary…')
        reAssemble(state, execTemplateHtml, fullTemplateHtml, callbacks, [
          'thesis',
          'workflows',
          'profit_levers',
          'cost_of_delay',
          'cta',
        ])
        return { ok: true }
      },
    }),

    // ── Copy editing tool ────────────────────────────────────────────────────
    update_copy: tool({
      description:
        'Update one or more report copy sections in a single call. All fields are optional — include only what you want to change.',
      inputSchema: z.object({
        thesis: z
          .string()
          .optional()
          .describe(
            'KR-16: 2-3 sentences identifying the single operating pattern',
          ),
        cta: z
          .string()
          .optional()
          .describe('NS-1: criteria-based CTA, not marketing language'),
        pilot: z
          .string()
          .optional()
          .describe(
            'WD-1: pilot recommendation referencing specific company characteristics',
          ),
        profit_levers: z
          .array(
            z.object({
              lever_name: z.string(),
              derived_from: z.string(),
              baseline_data: z.string(),
              ai_agent_action: z
                .string()
                .describe(
                  'The specific named action the AI agent takes. No vague efficiency language.',
                ),
              rationale: z.string(),
              rationale_with_arithmetic: z
                .string()
                .optional()
                .describe(
                  'OPTIONAL — leave empty. Per-lever arithmetic is regenerated deterministically by assembleReport from current workflow figures.',
                ),
            }),
          )
          .length(4)
          .optional()
          .describe(
            'Exactly 4 levers — one per workflow, in workflow order. Author prose only; arithmetic is pipeline-generated.',
          ),
        resilience_rows: z
          .array(
            z.object({
              dimension: z.string(),
              act_now: z.string(),
              defer: z.string(),
            }),
          )
          .length(4)
          .optional()
          .describe('KR-17: exactly 4 rows'),
        cost_of_delay: z
          .object({
            narrative: z
              .string()
              .describe(
                'KR-18: company-specific urgency prose. Do NOT embed a dollar figure. Must end with "Delay is not neutral — it carries a monthly price."',
              ),
          })
          .optional(),
        risks: z
          .array(
            z.object({
              risk: z.string(),
              detail: z
                .string()
                .describe('2-3 sentences specific to this company'),
              mitigation: z.string(),
            }),
          )
          .min(3)
          .optional(),
      }),
      execute: async (patches: {
        thesis?: string
        cta?: string
        pilot?: string
        profit_levers?: ProfitLever[]
        resilience_rows?: ResilienceRow[]
        cost_of_delay?: CostOfDelayData
        risks?: RiskRow[]
      }) => {
        if (!state.copy) return { error: 'No report copy to update' }
        state.copy = {
          ...state.copy,
          ...(patches.thesis !== undefined && {
            unified_pattern_thesis: patches.thesis,
          }),
          ...(patches.cta !== undefined && { cta_paragraph: patches.cta }),
          ...(patches.pilot !== undefined && {
            pilot_recommendation: patches.pilot,
          }),
          ...(patches.profit_levers !== undefined && {
            profit_levers: patches.profit_levers,
          }),
          ...(patches.resilience_rows !== undefined && {
            resilience_rows: patches.resilience_rows,
          }),
          ...(patches.cost_of_delay !== undefined && {
            cost_of_delay: patches.cost_of_delay,
          }),
          ...(patches.risks !== undefined && { risks: patches.risks }),
        }
        const COPY_TO_SECTION: Record<string, string> = {
          thesis: 'thesis',
          cta: 'cta',
          pilot: 'pilot',
          profit_levers: 'profit_levers',
          resilience_rows: 'resilience_rows',
          cost_of_delay: 'cost_of_delay',
          risks: 'risks',
        }
        const changedSections = Object.keys(patches)
          .filter((k) => patches[k as keyof typeof patches] !== undefined)
          .map((k) => COPY_TO_SECTION[k])
          .filter(Boolean)
        reAssemble(
          state,
          execTemplateHtml,
          fullTemplateHtml,
          callbacks,
          changedSections,
        )
        return { ok: true, updated_sections: changedSections }
      },
    }),

    // ── Workflow assumption tool (instant recalc) ────────────────────────────
    update_workflow: tool({
      description:
        'Update numeric parameters for a specific workflow. Instantly recalculates all financial figures.',
      inputSchema: z.object({
        workflowName: z.string().describe('Must match a workflow name exactly'),
        patches: z.object({
          monthlyVolume: z.number().optional(),
          minutesPerItemBefore: z.number().optional(),
          minutesPerItemAfter: z.number().optional(),
          rateOverride: z
            .number()
            .optional()
            .describe('Override fully loaded hourly cost for this workflow'),
          adoptionRate: z
            .number()
            .min(0)
            .max(1)
            .optional()
            .describe('Base adoption rate 0–1'),
        }),
      }),
      execute: async ({
        workflowName,
        patches,
      }: {
        workflowName: string
        patches: {
          monthlyVolume?: number
          minutesPerItemBefore?: number
          minutesPerItemAfter?: number
          rateOverride?: number
          adoptionRate?: number
        }
      }) => {
        if (!state.workflows) return { error: 'No workflows to patch' }
        const idx = state.workflows.findIndex(
          (w) => w.name.toLowerCase() === workflowName.toLowerCase(),
        )
        if (idx === -1) {
          return {
            error: `Workflow "${workflowName}" not found. Available: ${state.workflows
              .map((w) => w.name)
              .join(', ')}`,
          }
        }
        state.workflows = state.workflows.map((w, i) =>
          i !== idx
            ? w
            : {
                ...w,
                ...(patches.monthlyVolume !== undefined && {
                  monthlyVolume: patches.monthlyVolume,
                }),
                ...(patches.minutesPerItemBefore !== undefined && {
                  minutesPerItemBefore: patches.minutesPerItemBefore,
                }),
                ...(patches.minutesPerItemAfter !== undefined && {
                  minutesPerItemAfter: patches.minutesPerItemAfter,
                }),
                ...(patches.rateOverride !== undefined && {
                  rateOverride: patches.rateOverride,
                }),
                ...(patches.adoptionRate !== undefined && {
                  adoptionRate: patches.adoptionRate,
                }),
              },
        )
        reAssemble(state, execTemplateHtml, fullTemplateHtml, callbacks, [
          'workflows',
          'financials',
        ])
        const s = state.calcOutput?.summary
        return {
          ok: true,
          new_od12: s?.operationalDividend12mo,
          new_tf12: s?.totalFinancialGain12mo,
        }
      },
    }),

    // ── Workflow structure tools ─────────────────────────────────────────────
    add_workflow: tool({
      description:
        'Add a new workflow to the report. Only call this for workflows NOT already in the current workflow list.',
      inputSchema: z.object({
        workflow: z.object({
          name: z.string(),
          function: z.string(),
          owner: z.string(),
          whyItMatters: z.string(),
          agentName: z.string(),
          expectedOutcome: z.string(),
          sourceType: z.enum(['user_stated', 'inferred', 'research_derived']),
          monthlyVolume: z.number().optional(),
          minutesPerItemBefore: z.number().optional(),
          minutesPerItemAfter: z.number().optional(),
        }),
      }),
      execute: async ({
        workflow,
      }: {
        workflow: Omit<
          WorkflowInput,
          | 'adoptionRate'
          | 'exceptionRate'
          | 'exceptionMinutes'
          | 'rateOverride'
          | 'rationale'
        > & {
          monthlyVolume?: number
          minutesPerItemBefore?: number
          minutesPerItemAfter?: number
        }
      }) => {
        if (!state.workflows) return { error: 'No workflows to add to' }

        const alreadyExists = state.workflows.some(
          (w) => w.name.toLowerCase() === workflow.name.toLowerCase(),
        )
        if (alreadyExists) {
          return {
            error: `Workflow "${workflow.name}" already exists. Use update_workflow to change its parameters.`,
          }
        }

        const avgRate =
          state.globals && state.workflows.length > 0
            ? state.workflows.reduce(
                (s, w) => s + (w.rateOverride ?? state.globals!.laborRate),
                0,
              ) / state.workflows.length
            : state.globals?.laborRate ?? 45

        const newWorkflow: WorkflowInput = {
          name: workflow.name,
          agentName: workflow.agentName ?? '',
          function: workflow.function ?? '',
          owner: workflow.owner ?? '',
          whyItMatters: workflow.whyItMatters ?? '',
          expectedOutcome: workflow.expectedOutcome ?? '',
          sourceType: workflow.sourceType ?? 'inferred',
          monthlyVolume: workflow.monthlyVolume ?? 100,
          minutesPerItemBefore: workflow.minutesPerItemBefore ?? 60,
          minutesPerItemAfter: workflow.minutesPerItemAfter ?? 12,
          adoptionRate: 0.7,
          exceptionRate: 0.08,
          exceptionMinutes: 12,
          rateOverride: Math.round(avgRate),
          seniorityLevel: null,
          rateSource: null,
          rateSourceUrl: null,
          rationale:
            'Added via chat — defaults applied. Use update_workflow to refine.',
        }
        state.workflows = [...state.workflows, newWorkflow]
        reAssemble(state, execTemplateHtml, fullTemplateHtml, callbacks, [
          'workflows',
          'financials',
        ])
        return { ok: true, workflow_count: state.workflows.length }
      },
    }),

    remove_workflow: tool({
      description:
        'Remove a workflow from the report. Recalculates figures without an LLM call.',
      inputSchema: z.object({ workflowName: z.string() }),
      execute: async ({ workflowName }: { workflowName: string }) => {
        if (!state.workflows) return { error: 'No workflows' }
        state.workflows = state.workflows.filter((w) => w.name !== workflowName)
        reAssemble(state, execTemplateHtml, fullTemplateHtml, callbacks, [
          'workflows',
          'financials',
        ])
        return { ok: true, workflow_count: state.workflows.length }
      },
    }),

    // ── Currency & global financial tools ───────────────────────────────────
    scale_rates: tool({
      description:
        'Multiply ALL monetary raw inputs (hourly rates and costs) by a given factor. Use for currency conversion (e.g. scale_rates(3.67) for USD→AED). Only touches monetary fields; hours and volumes are unchanged.',
      inputSchema: z.object({
        multiplier: z
          .number()
          .positive()
          .describe('Factor to apply, e.g. 3.67 to convert USD to AED'),
      }),
      execute: async ({ multiplier }: { multiplier: number }) => {
        if (!state.globals) return { error: 'No globals to scale' }
        state.globals = {
          ...state.globals,
          laborRate: Math.round(state.globals.laborRate * multiplier),
          implementationCost: Math.round(
            state.globals.implementationCost * multiplier,
          ),
          monthlyToolingCost: Math.round(
            state.globals.monthlyToolingCost * multiplier,
          ),
        }
        if (state.workflows) {
          state.workflows = state.workflows.map((w) => ({
            ...w,
            rateOverride:
              w.rateOverride != null
                ? Math.round(w.rateOverride * multiplier)
                : null,
          }))
        }
        // Scale revenue so the roiCalculator revenue guardrail stays proportional
        if (
          state.company?.revenueEstimateM != null &&
          state.company.revenueEstimateM > 0
        ) {
          state.company = {
            ...state.company,
            revenueEstimateM: state.company.revenueEstimateM * multiplier,
          }
        }
        reAssemble(state, execTemplateHtml, fullTemplateHtml, callbacks, [
          'financials',
        ])
        return { ok: true, multiplier }
      },
    }),

    set_currency: tool({
      description:
        'Change the currency symbol and code displayed on all figures. DISPLAY CHANGE ONLY — values are not converted. Pair with scale_rates(multiplier) when actual value conversion is needed.',
      inputSchema: z.object({
        currencyCode: z
          .string()
          .describe(
            'ISO 4217 code: USD, EUR, GBP, AED, SAR, QAR, KWD, BHD, OMR, EGP, NGN, ZAR, JPY, CAD, AUD, CHF, INR',
          ),
      }),
      execute: async ({ currencyCode }: { currencyCode: string }) => {
        const CURRENCIES: Record<
          string,
          { code: string; symbol: string; name: string }
        > = {
          USD: { code: 'USD', symbol: '$', name: 'US Dollar' },
          EUR: { code: 'EUR', symbol: '€', name: 'Euro' },
          GBP: { code: 'GBP', symbol: '£', name: 'British Pound' },
          SAR: { code: 'SAR', symbol: 'SAR ', name: 'Saudi Riyal' },
          AED: { code: 'AED', symbol: 'AED ', name: 'UAE Dirham' },
          QAR: { code: 'QAR', symbol: 'QAR ', name: 'Qatari Riyal' },
          KWD: { code: 'KWD', symbol: 'KWD ', name: 'Kuwaiti Dinar' },
          BHD: { code: 'BHD', symbol: 'BHD ', name: 'Bahraini Dinar' },
          OMR: { code: 'OMR', symbol: 'OMR ', name: 'Omani Rial' },
          EGP: { code: 'EGP', symbol: 'EGP ', name: 'Egyptian Pound' },
          NGN: { code: 'NGN', symbol: '₦', name: 'Nigerian Naira' },
          ZAR: { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
          JPY: { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
          CAD: { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar' },
          AUD: { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
          CHF: { code: 'CHF', symbol: 'CHF ', name: 'Swiss Franc' },
          INR: { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
        }
        const code = currencyCode.toUpperCase().trim()
        const currency = CURRENCIES[code] ?? {
          code,
          symbol: code + ' ',
          name: code,
        }
        if (state.globals) state.globals = { ...state.globals, currency }
        if (state.normInput)
          state.normInput = { ...state.normInput, selectedCurrency: code }
        reAssemble(state, execTemplateHtml, fullTemplateHtml, callbacks, [
          'financials',
        ])
        return { ok: true, currency }
      },
    }),

    update_globals: tool({
      description:
        'Update global financial model parameters. laborRate is the fallback/default rate; set applyToWorkflowOverrides to also rewrite existing workflow rates.',
      inputSchema: z.object({
        laborRate: z
          .number()
          .optional()
          .describe('Global fallback fully loaded hourly cost'),
        applyToWorkflowOverrides: z
          .boolean()
          .optional()
          .describe(
            'When changing laborRate, also set every current workflow rateOverride to that value. Use this for whole-report rate changes.',
          ),
        implCost: z
          .number()
          .optional()
          .describe('One-time implementation cost'),
        toolingCostMonthly: z
          .number()
          .optional()
          .describe('Monthly tooling/licensing cost'),
        profitMultiplier: z
          .number()
          .optional()
          .describe('Multiplier applied to freed hours for profit uplift'),
        realizationFactor: z
          .number()
          .optional()
          .describe('Fraction of theoretical hours actually recovered (0–1)'),
      }),
      execute: async (patches: {
        laborRate?: number
        applyToWorkflowOverrides?: boolean
        implCost?: number
        toolingCostMonthly?: number
        profitMultiplier?: number
        realizationFactor?: number
      }) => {
        if (!state.globals) return { error: 'No globals to update' }
        const everyWorkflowHasOverride =
          Boolean(state.workflows?.length) &&
          state.workflows!.every((w) => w.rateOverride != null)
        const shouldSyncWorkflowRates =
          patches.laborRate !== undefined &&
          (patches.applyToWorkflowOverrides ?? everyWorkflowHasOverride)

        state.globals = {
          ...state.globals,
          ...(patches.laborRate !== undefined && {
            laborRate: patches.laborRate,
          }),
          ...(patches.implCost !== undefined && {
            implementationCost: patches.implCost,
          }),
          ...(patches.toolingCostMonthly !== undefined && {
            monthlyToolingCost: patches.toolingCostMonthly,
          }),
          ...(patches.profitMultiplier !== undefined && {
            profitMultiplier: patches.profitMultiplier,
          }),
          ...(patches.realizationFactor !== undefined && {
            realizationFactor: patches.realizationFactor,
          }),
        }
        if (shouldSyncWorkflowRates && state.workflows) {
          state.workflows = state.workflows.map((w) => ({
            ...w,
            rateOverride: patches.laborRate ?? w.rateOverride,
          }))
        }
        reAssemble(
          state,
          execTemplateHtml,
          fullTemplateHtml,
          callbacks,
          shouldSyncWorkflowRates
            ? ['workflows', 'financials']
            : ['financials'],
        )
        const s = state.calcOutput?.summary
        return {
          ok: true,
          labor_rate_scope: shouldSyncWorkflowRates
            ? 'all_workflows_and_global'
            : 'global_fallback_only',
          updated_workflow_rates: shouldSyncWorkflowRates
            ? state.workflows?.length ?? 0
            : 0,
          new_od12: s?.operationalDividend12mo,
          new_tf12: s?.totalFinancialGain12mo,
        }
      },
    }),
  }
}

// ── System prompts ────────────────────────────────────────────────────────────

function buildGenerationSystemPrompt(
  companyName: string,
  estimatesOnly = false,
): string {
  if (estimatesOnly) {
    return `You are the LyRise ROI Report Agent. Generate an estimate-based report for ${companyName}.

WEB RESEARCH IS DISABLED for this request. Do NOT call web_search or fetch_page.
Use ONLY the questionnaire inputs and standard industry benchmarks.

YOUR FIRST ACTION: call set_research_output immediately with:
- All workflows inferred from company description + industry (sourceType: 'inferred')
- confidenceLevel: 'low'
- A clear coreThesis based on the company description

Then: run_financial_model() → set_report_copy(…)

Do not write any text before calling set_research_output. Act immediately.

MANDATORY for set_report_copy:
• unified_pattern_thesis (KR-16): 2-3 sentences naming SINGLE operating pattern
• profit_levers: exactly 4 levers — ONE PER WORKFLOW, in the same order as the workflow list. For each lever:
  - Set derived_from to the workflow name (verbatim) the lever maps to
  - Author lever_name, baseline_data, assumption, and rationale (the mechanism in plain English — "Faster triage → higher member retention")
  - Do NOT write rationale_with_arithmetic — leave it empty. The per-lever arithmetic chain (hrs × rate × redirect % = $/mo) is regenerated deterministically by the pipeline from the post-floor, post-scaling calculator output, so anything you write here gets overwritten
• derived_from: workflow name(s) each lever originates from
• cost_of_delay (KR-18): narrative only — company-specific urgency prose, no dollar figures, MUST end with "Delay is not neutral — it carries a monthly price."
• resilience_rows (KR-17): exactly 4 rows; dimensions: Cost per unit, Delivery speed, Error rate, Strategic capacity
• pilot_recommendation (WD-1): MUST reference specific company characteristics
• cta_paragraph (NS-1): criteria-based — "If [conditions] describe your situation, a 30-min call with elena@lyrise.ai would be worthwhile."

TERMINOLOGY: "Operational Dividend" · "Total Financial Gain" · "Hours Returned"`
  }

  return `You are the LyRise ROI Report Agent. Your job is to produce a high-quality, credible AI ROI report for ${companyName}.

GROUND TRUTH FROM THE QUESTIONNAIRE (never override these):
The user's submitted form values for industry, country, currency, team size, and revenue range are authoritative. Do not contradict them in company_profile, report copy, or any narrative — even if a website or third-party listing suggests a different value. Use research only to enrich (e.g. specific practice area, geography within country, products) without overwriting form fields. If research disagrees with the form, treat the form as correct and silently drop the conflicting research signal.

COGNITIVE WORKFLOW (silent internal reasoning — never show phase names to user):

PHASE 1 — Intelligence Vectoring: define 3–5 Key Intelligence Questions across Executive, Corporate, and Industry vectors.

PHASE 2 — Multi-Vector Intelligence Gathering. Research in this sequence:
1. Fetch the company website directly using fetch_page
2. Search data aggregators: web_search("{company} site:apollo.io OR site:clodura.ai OR site:zoominfo.com") then fetch_page the best result
3. Search LinkedIn: web_search("{company} site:linkedin.com/company") then fetch_page for headcount + industry
4. If a recipient name is provided: web_search("{name} {company} site:linkedin.com/in") and fetch_page their profile
5. Search for financial/industry signals: web_search("{company} {industry} revenue employees {year}")
6. Search for salary/rate benchmarks for the roles that will own each workflow in this country and industry. MANDATORY — run at least 2 targeted searches:
   web_search("{industry} {country} operations manager hourly rate site:gulftalent.com OR site:bayt.com")
   web_search("{industry} {country} average salary {role} {year} glassdoor OR linkedin")
   web_search("Robert Half salary guide {year} {country} {industry} {role}")
   Extract every specific figure (hourly, monthly, or annual) — the financial model will use them to set per-workflow seniority-differentiated rates. Without this data the modeler falls back to generic ranges.
Narrate your findings to the user as you go. Flag confidence levels.
If you find any concrete company signal (practice area, product line, geography, client type, transaction volume, headcount, tool stack, or regulatory context), you MUST use it to shape workflow selection and workflow rationales.

PHASE 3 — Confidence Assessment: declare "high" (most data scraped) or "low" (mostly benchmarked/assumed). Derive revenue from headcount × industry avg if not found directly.

PHASE 4 — Critical Thinking Nexus: produce ONE Core Operational Thesis: "[Main bottleneck] + [Highest-value automation opportunity]"

PHASE 5 — Thesis-Driven Workflow Prioritization: select 4 workflows.
At least 2 workflows MUST be research-derived whenever public company signals are available. Avoid generic back-office workflows unless they are clearly tied to observed company operations.

PHASE 5B — SALARY EVIDENCE GATHERING (MANDATORY — Rule 6A):
For EACH of the 4 workflows, before calling set_research_output, run a targeted web_search to find the actual annual salary for the role that performs that workflow. Use a SIMPLE query — chained site: operators tend to return zero hits. Recommended pattern:
  web_search('"{owner role}" salary {country}', maxResults=4)
If the first attempt returns no usable salary numbers, retry ONCE with a single named source, e.g.:
  web_search('"{owner role}" salary {country} glassdoor', maxResults=4)
Pick the source domain (glassdoor / payscale / levels.fyi / bayt / gulftalent / roberthalf / linkedin / indeed) most appropriate for the country.
Capture the snippets that contain salary numbers verbatim. You will pass them into set_research_output as salary_evidence[] — one entry per workflow with workflowName, roleQueried, sourceUrls, rawSnippets, and a best-effort parsed annual range. The ROI Modeler uses this evidence (not its own training data) to set the per-workflow hourly rate. If both searches return nothing for a role, still emit an evidence entry with empty arrays and null parsed values so the modeler knows to fall back to the regional benchmark table.

PHASE 6 — Quantitative Dossier: baseline + automation impact + source type for each workflow.

In set_research_output, every workflow's whyItMatters must mention a concrete company or industry signal, and every workflow's volumeRationale must explain where the volume came from.

NO BOILERPLATE — REJECT FILLER PROSE:
Every text field you emit (whyItMatters, volumeRationale, expectedOutcome, researchSummary, coreThesis, pain_points.description) must be specific to this company. The following phrases (or close paraphrases) are BANNED — re-write any sentence that contains them:
  • "leverage AI to streamline operations"
  • "improve operational efficiency"
  • "enhance productivity across the organization"
  • "drive digital transformation"
  • "unlock value through automation"
  • "[Company] is a leading provider of …" (generic vendor description)
  • Any sentence that would read identically with the company name swapped out
Each sentence must reference at least one of: the company's actual product/service, its industry sub-vertical, its country/region, an observed tool/system, a stated client type, a regulatory or competitive context surfaced from research, or a numeric signal (headcount, transaction volume, geographic footprint). If you cannot tie a sentence to a concrete signal, delete it rather than pad.

After phases 1–6, call tools in order:
  set_research_output(…) → run_financial_model() → set_report_copy(…)

MANDATORY for set_report_copy:
• unified_pattern_thesis (KR-16): 2-3 sentences naming SINGLE operating pattern, no workflow lists
• profit_levers: exactly 4 levers — ONE PER WORKFLOW, in the same order as the workflow list. For each lever:
  - Set derived_from to the workflow name (verbatim) the lever maps to
  - Author lever_name, baseline_data, assumption, and rationale (the mechanism in plain English — "Faster triage → higher member retention")
  - Do NOT write rationale_with_arithmetic — leave it empty. The per-lever arithmetic chain (hrs × rate × redirect % = $/mo) is regenerated deterministically by the pipeline from the post-floor, post-scaling calculator output, so anything you write here gets overwritten
• derived_from: workflow name(s) each lever originates from
• cost_of_delay (KR-18): narrative only — company-specific urgency prose, no dollar figures, MUST end with "Delay is not neutral — it carries a monthly price."
• resilience_rows (KR-17): exactly 4 rows; dimensions: Cost per unit, Delivery speed, Error rate, Strategic capacity
• pilot_recommendation (WD-1): MUST reference specific company characteristics (employees, volume)
• cta_paragraph (NS-1): criteria-based — "If [conditions] describe your situation, a 30-min call with elena@lyrise.ai would be worthwhile."

TERMINOLOGY (mandatory):
• "Operational Dividend" — never "cost savings"
• "Total Financial Gain" — never "ROI"
• "Hours Returned" — never "time saved"

ABSOLUTE PIPELINE REQUIREMENT:
You MUST call set_research_output → run_financial_model → set_report_copy in sequence, without exception.
If all web searches fail or return no useful data: STOP researching and call set_research_output IMMEDIATELY using the questionnaire inputs and industry benchmarks, with confidenceLevel: 'low' and sourceType: 'inferred' for all workflows.
NEVER end generation with only text. NEVER explain why you couldn't research. If stuck: call set_research_output NOW.

WORKFLOWS REQUIREMENT (critical):
• set_research_output.workflows MUST contain EXACTLY 4 workflows — not 3, not 5
• Every workflow MUST have monthlyVolume > 0 (use industry benchmarks if unknown — e.g. 200/mo for a 50-person firm)
• Every workflow MUST have minutesPerItemBefore > 0 and minutesPerItemAfter > 0
• Infer realistic volumes from team size and industry — do NOT submit 0 or omit these fields`
}

function buildChatSystemPrompt(state: ReportState): string {
  const calc = state.calcOutput!
  const copy = state.copy!
  const company = state.company!
  const globals = state.globals!
  // Fall back to ISO code if symbol contains non-ASCII characters (e.g. Arabic script)
  // eslint-disable-next-line no-control-regex
  const sym = /[^\x00-\x7F]/.test(globals.currency.symbol)
    ? globals.currency.code + ' '
    : globals.currency.symbol
  const s = calc.summary

  // Merge WorkflowInput (raw) with WorkflowCalc (derived) by name
  const merged = calc.workflows.map((wc) => {
    const inp =
      state.workflows!.find((w) => w.name === wc.name) ?? state.workflows![0]
    return { ...inp, ...wc }
  })

  const workflowSection = merged
    .map((w) => {
      const hrsBefore = Math.round(
        (w.monthlyVolume * w.minutesPerItemBefore) / 60,
      )
      const hrsAfter = Math.round(hrsBefore - w.monthlyHours)
      const rawRate = w.rateOverride ?? globals.laborRate
      const flooredNote =
        w.effectiveRate !== rawRate
          ? ` (auto-lifted from ${sym}${rawRate} by regional floor)`
          : ''
      const sourceNote = w.rateSource
        ? ` · source=${w.rateSource}${
            w.rateSource === 'benchmark_fallback' ? ' (no live evidence)' : ''
          }`
        : ''
      return `[${w.name}]
  Displayed: ${hrsBefore}→${hrsAfter} hrs/mo | ${
        w.monthlyHours
      } hrs saved | ${sym}${w.monthlyValue}/mo recaptured | ${sym}${
        w.monthlyProfitUplift
      }/mo profit uplift
  Raw inputs (update_workflow): volume=${w.monthlyVolume}/mo | before=${
        w.minutesPerItemBefore
      }min | after=${w.minutesPerItemAfter}min | rate=${sym}${
        w.effectiveRate
      }/hr [${
        w.seniorityLevel ?? 'mid'
      }]${flooredNote}${sourceNote} | adoption=${w.adoptionRate}`
    })
    .join('\n\n')

  // Show the deterministic per-lever arithmetic the renderer actually
  // displays — NOT the empty rationale_with_arithmetic field, which is
  // overwritten in assembleReport. Otherwise the chat agent may "fix"
  // arithmetic that isn't actually shown.
  const redirectionPct = Math.max(0, globals.profitMultiplier - 1)
  const leverLines = (copy.profit_levers ?? [])
    .map((l, i) => {
      const wf =
        merged.find(
          (w) => w.name.toLowerCase() === (l.derived_from ?? '').toLowerCase(),
        ) ?? merged[i]
      const rendered = wf
        ? `${wf.monthlyHours} hrs/mo × ${sym}${
            wf.effectiveRate
          }/hr × ${redirectionPct.toFixed(2)} redirected = ${sym}${
            wf.monthlyProfitUplift
          }/mo`
        : '(no matching workflow)'
      return `  [${i + 1}] lever_name="${l.lever_name}" | derived_from="${
        l.derived_from
      }"\n       rendered_arithmetic="${rendered}"  (auto-generated; not editable via update_copy)`
    })
    .join('\n')

  const resilienceLines = (copy.resilience_rows ?? [])
    .map(
      (r) => `  • ${r.dimension}: act_now="${r.act_now}" | defer="${r.defer}"`,
    )
    .join('\n')

  const riskLines = (copy.risks ?? [])
    .map(
      (r, i) =>
        `  [${i + 1}] "${r.risk}"\n       Detail: ${
          r.detail
        }\n       Mitigation: ${r.mitigation}`,
    )
    .join('\n')

  const snapshotLines = (copy.company_snapshot ?? [])
    .map((b) => `  • [${b.sourceType}] ${b.text}`)
    .join('\n')

  const painPointLines = (state.painPoints ?? [])
    .map(
      (p) => `  • ${p.title} (${p.confidence}, ${p.source}): ${p.description}`,
    )
    .join('\n')

  return `You are the LyRise ROI Report Editor for ${company.company}.

HOW THIS WORKS: every displayed figure has a raw input behind it. You see both below.
Edit the raw input with a tool → the pipeline recalculates and re-renders everything automatically.
Never compute derived values yourself. Never do arithmetic on report numbers.

INTENT INFERENCE — resolve the user's goal before acting:
• "where did X come from" / "why is X this value" → call search_evidence("X") first, then explain using the results and workflow rationale below
• "X seems too high / too low / wrong" → call search_evidence("X") to surface the source, then offer to research alternatives or update
• "change [thing] to [value]" → map to the exact tool+field (see COMPOSITION EXAMPLES); ask only if truly ambiguous
• "the rate / salary / hourly cost" for one named workflow → update_workflow rateOverride
• "the rate / salary / hourly cost" for the whole report / no workflow named → update_globals({ laborRate: X, applyToWorkflowOverrides: true }) so the displayed workflow rates actually change
• "the volume / frequency / how many per month" → update_workflow monthlyVolume
• "time / duration / minutes" → update_workflow minutesPerItemBefore or minutesPerItemAfter
• "add [process/workflow]" → add_workflow (must not already exist in the WORKFLOWS list)
• "rewrite / update / fix [copy section]" → update_copy with the relevant field(s)
• Before re-searching for a rate or benchmark, check RESEARCH EVIDENCE — it may already be there

═══ COMPANY ════════════════════════════════════════════
${company.company} | ${company.industry} | ${company.country ?? 'unknown'} | ${
    company.employees ?? '?'
  } employees
Revenue: ${
    company.revenueEstimateM ? sym + company.revenueEstimateM + 'M' : 'unknown'
  } | Confidence: ${state.confidenceLevel ?? 'low'}
Thesis: ${state.coreThesis ?? ''}
Research summary: ${state.researchSummary ?? '(none)'}

COMPANY SNAPSHOT (displayed in report):
${snapshotLines || '  (none)'}

PAIN POINTS IDENTIFIED:
${painPointLines || '  (none)'}

═══ WORKFLOWS ══════════════════════════════════════════
${workflowSection}

TOTALS (displayed): ${calc.figures.totalAnnualHours} hrs/yr | OD ${sym}${
    s.operationalDividend12mo
  } | PU ${sym}${s.profitUplift12mo} | TFG ${sym}${s.totalFinancialGain12mo}

═══ GLOBAL INPUTS ═══════════════════════════════════════
Edit with update_globals. NOTE: globals.laborRate is a FALLBACK only — every workflow above already has its own rate (set by the modeler from real salary evidence + regional floor). Editing globals.laborRate alone WILL NOT change any displayed number. To change rates, edit per-workflow rateOverride instead, or use scale_rates for proportional shifts.
  laborRate=${sym}${
    globals.laborRate
  }/hr (fallback — unused while overrides exist)
  implCost=${sym}${globals.implementationCost} | toolingCostMonthly=${sym}${
    globals.monthlyToolingCost
  }/mo
  profitMultiplier=${
    globals.profitMultiplier
  } (drives Profit Uplift = OD × (multiplier − 1))
  realizationFactor=${
    globals.realizationFactor
  } (fraction of theoretical hours actually recovered)

═══ AUTOMATIC GUARDRAILS (silent — calculator does these on every edit) ═══
1) REGIONAL RATE FLOOR — country=${
    company.country ?? 'unknown'
  }. Each workflow's rate is silently lifted to the regional minimum for its seniority tier (e.g. mid-tier Egypt floor ≈ ${sym}32/hr USD). Setting rateOverride below the floor has no effect — the calculator clamps it. Tell the user this if their requested rate is below the floor.
2) REVENUE BAND — Total Financial Gain is constrained to 5–20% of estimated annual revenue (${
    company.revenueEstimateM ? sym + company.revenueEstimateM + 'M' : 'unknown'
  }). If a rate or volume edit pushes TFG outside the band, ALL workflows are scaled proportionally so the totals reconcile but per-workflow numbers may shift slightly even for workflows you didn't touch. Mention this when relevant.

═══ SECTION MAP — what the user sees → what to edit ═════
The rendered report has these visible section headings. Use this to translate user requests:

EXEC ONE-PAGER:
  "The Pattern Underneath"                         → update_copy({ thesis })
  "Where the Operational Dividend Comes From"      → update_workflow(...) [the workflow table]
  "Where the Profit Uplift Comes From"             → update_workflow(...) [arithmetic auto-regenerates]
  "Cost of Delay"                                  → update_copy({ cost_of_delay })
  "What Happens Next"                              → update_copy({ cta })

FULL REPORT:
  "Executive Summary" / KPI bar                    → recalculated automatically when workflows change
  "Company Snapshot"                               → update_company / update_copy({ company_snapshot })
  "Proposed AI Workflows"                          → update_workflow(...)  [unified workflow table — replaces the old Before/After AI table]
  "Profit Uplift Analysis"                         → update_workflow(...) — arithmetic is auto-generated, not editable via update_copy
  "Cost of Delay"                                  → update_copy({ cost_of_delay })
  "Resilience Positioning"                         → update_copy({ resilience_rows })
  "Recommended Starting Point"                     → update_copy({ pilot })
  "Data Provenance"                                → driven by workflows + company; no direct edit
  "Risks & Mitigations"                            → update_copy({ risks })
  "Implementation Roadmap"                         → not editable from chat
  "Next Steps"                                     → update_copy({ cta, next_steps })

LEGACY NAMES the user might use (don't exist anymore):
  "Before AI vs After AI table" / "before/after table" → it's now part of "Proposed AI Workflows" / "Where the Operational Dividend Comes From". Edit via update_workflow.
  "global hourly rate" / "the rate"                → there's no single rate — every workflow has its own. Ask which workflow, or use scale_rates for a bulk shift.
  "Function Roll-Up"                               → removed; do not try to edit.

═══ COPY SECTIONS ═══════════════════════════════════════
Edit with update_copy(patches). Field names shown after →.

THE PATTERN UNDERNEATH → thesis
"${copy.unified_pattern_thesis ?? ''}"

WHAT HAPPENS NEXT (CTA) → cta
"${copy.cta_paragraph ?? ''}"

PILOT RECOMMENDATION → pilot
"${copy.pilot_recommendation ?? ''}"

WHERE PROFIT UPLIFT COMES FROM → profit_levers (exactly 4 — one per workflow; arithmetic is pipeline-generated)
${leverLines}

COST OF DELAY → cost_of_delay
  monthly_cost is computed by the calculator (tf12/12 = ${sym}${Math.round(
    s.totalFinancialGain12mo / 12,
  ).toLocaleString()}) — do not set this
  narrative="${copy.cost_of_delay?.narrative ?? ''}"

RESILIENCE TABLE → resilience_rows (exactly 4)
${resilienceLines}

RISKS → risks (min 3)
${riskLines}

═══ YOUR TOOLS ══════════════════════════════════════════
NUMBERS   update_workflow(name, patches)   — set volume, timeBefore, timeAfter, rateOverride, adoptionRate
          update_globals(patches)          — set laborRate, implCost, toolingCostMonthly, profitMultiplier, realizationFactor; for whole-report rate changes set applyToWorkflowOverrides: true
          scale_rates(multiplier)          — multiply ALL monetary inputs by a factor; use for currency conversion, no arithmetic needed
CURRENCY  set_currency(code)              — change display symbol/code only; pair with scale_rates when converting values
COPY      update_copy(patches)            — update any combination of copy sections in one call
STRUCTURE add_workflow | remove_workflow
RESEARCH  search_evidence(query)        — look up sources for any figure already found during generation
          web_search | fetch_page       — search/scrape new data not in evidence
  When asked about sources: call search_evidence first. Only call web_search if evidence returns no match.
  Query patterns:
    • "{industry} {country} {role} hourly rate site:gulftalent.com OR site:bayt.com"
    • "{industry} {country} average salary {role} {year} glassdoor OR linkedin"
    • "Robert Half salary guide {year} {industry} {country}"
  Convert to fully-loaded hourly: annual ÷ (${
    globals.workWeeksPerYear
  } × 40) × 1.30
  Then call update_workflow(name, { rateOverride: <computed> }) or update_globals({ laborRate: <blended>, applyToWorkflowOverrides: true }) if the user means one rate across the whole report.

COMPOSITION EXAMPLES (use the real workflow names from the WORKFLOWS section above):
  "Convert to AED at 3.67"                  → set_currency("AED") then scale_rates(3.67)
  "${
    merged[0]?.name ?? 'Workflow A'
  } rate should be ${sym}80/hr" → update_workflow("${
    merged[0]?.name ?? 'Workflow A'
  }", { rateOverride: 80 })
  "${
    merged[1]?.name ?? 'Workflow B'
  } volume is 200/mo"            → update_workflow("${
    merged[1]?.name ?? 'Workflow B'
  }", { monthlyVolume: 200 })
  "Bump every rate by 10%"                  → scale_rates(1.10)
  "Rewrite the thesis"                      → update_copy({ thesis: "..." })
  "Update the Cost of Delay paragraph"      → update_copy({ cost_of_delay: { narrative: "..." } })

DO NOT DO:
  ✗ "Fix the profit lever arithmetic"       — arithmetic is auto-regenerated from workflow rate × hours; just edit the workflow.
  ✗ "Change the global hourly rate to $50"  — no single rate exists; ask which workflow, or call scale_rates.
  ✗ "Update the Before vs After AI table"   — that table no longer exists; edit workflows directly.

STRICT RULES:
- NEVER describe a change without calling the tool that makes it.
- NEVER do arithmetic on report values — use scale_rates for relative scaling.
- set_currency only changes the symbol; always also call scale_rates if values need converting.
- If every workflow above shows a rate override, changing only global laborRate will not change the displayed workflow rates. Use applyToWorkflowOverrides: true for whole-report rate edits.
- NEVER call add_workflow for a workflow already listed above — the tool will reject it.
- set_report_copy: only call if the user explicitly asks to regenerate the full report copy.
- For a single-section edit, use a targeted update_* tool — never set_report_copy.
- profit_levers.rationale_with_arithmetic is regenerated by the pipeline on every recalculation. Never patch it via update_copy — it gets overwritten. To change a lever's arithmetic, edit the underlying workflow's rate or hours.
- If a user requests a rate below the regional floor, make the edit but warn them the calculator will auto-lift it back to the floor.
- If asked about a section that no longer exists (Before/After AI table, global rate, Function Roll-Up), translate to the correct current name using the SECTION MAP above before acting.
- KR-18: cost_of_delay narrative MUST end with "Delay is not neutral — it carries a monthly price."
- KR-17: resilience_rows always exactly 4 rows.
- Narrate what you're doing before calling tools.
- If you cannot satisfy a request with the available tools, say so explicitly.`
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function runReportAgent(params: {
  mode: 'generate' | 'chat'
  state: ReportState
  message?: string
  chatHistory?: ModelMessage[]
  callbacks: AgentCallbacks
  templateHtml: string
  fullTemplateHtml: string
  estimatesOnly?: boolean
  // Aborts the streamText loop when the caller (e.g. an HTTP client) goes away,
  // so we stop burning tokens on a report nobody is waiting on.
  abortSignal?: AbortSignal
}): Promise<void> {
  const {
    mode,
    state,
    message,
    chatHistory,
    callbacks,
    templateHtml,
    fullTemplateHtml,
    estimatesOnly = false,
    abortSignal,
  } = params

  const company = state.normInput?.companyName ?? 'unknown'
  roiLog('agent', `▶ runReportAgent mode=${mode} company="${company}"`, {
    estimatesOnly,
    country: state.normInput?.country,
    industry: state.normInput?.industry,
    teamSize: state.normInput?.teamSize,
    revenueRange: state.normInput?.revenueRange,
    selectedCurrency: state.normInput?.selectedCurrency,
  })
  if (estimatesOnly) {
    roiWarn(
      'agent',
      '⚠️  ESTIMATES-ONLY MODE — web research is DISABLED. No salary searches, no company website, no LinkedIn. Modeler will use regional benchmark fallbacks for ALL workflow rates. If you want real evidence-backed rates, do NOT click "Use Estimates"; let normal research run.',
    )
  }
  const tracker = new UsageTracker({ company, mode })
  const tools = buildTools(
    state,
    templateHtml,
    fullTemplateHtml,
    callbacks,
    tracker,
  )

  let system: string
  let messages: ModelMessage[]

  if (mode === 'generate') {
    const companyName = state.normInput.companyName
    const website = state.normInput.website
    const desc = state.normInput.businessDescription
    const recip = state.normInput.recipientName
      ? `${state.normInput.recipientName}${
          state.normInput.recipientTitle
            ? ', ' + state.normInput.recipientTitle
            : ''
        }`
      : ''

    system = buildGenerationSystemPrompt(companyName, estimatesOnly)
    messages = [
      {
        role: 'user',
        content: `Generate a complete ROI report for ${companyName}.
Website: ${website}
Description: ${desc}
${recip ? 'Recipient: ' + recip : ''}
Industry: ${state.normInput.industry}
Country: ${state.normInput.country}
Currency: ${state.normInput.selectedCurrency}
Team size: ${state.normInput.teamSize}
Revenue range: ${state.normInput.revenueRange}
Key priorities: ${state.normInput.keyPriorities.join(', ')}
${
  state.normInput.workContext ? 'Context: ' + state.normInput.workContext : ''
}`,
      },
    ]
  } else {
    // Chat mode — state must have calcOutput + copy
    if (!state.calcOutput || !state.copy) {
      callbacks.onError(
        new Error('Chat mode requires a fully generated report state'),
      )
      return
    }
    system = buildChatSystemPrompt(state)
    messages = [
      ...(chatHistory ?? []),
      { role: 'user', content: message ?? '' },
    ]
  }

  const result = streamText({
    model: researchModel,
    system,
    messages,
    tools,
    stopWhen: stepCountIs(mode === 'generate' ? 24 : 8),
    abortSignal,
  })

  try {
    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        callbacks.onTextDelta(part.text)
      } else if (part.type === 'tool-call') {
        callbacks.onToolStart(part.toolName, part.input as Record<string, unknown>)
      } else if (part.type === 'error') {
        // An abort surfaces here as an error part — treat it as a clean stop,
        // not a generation failure, so the caller doesn't persist/email it.
        if (abortSignal?.aborted) {
          roiWarn('agent', '⏹ runReportAgent aborted — caller disconnected')
          return
        }
        callbacks.onError(
          part.error instanceof Error
            ? part.error
            : new Error(String(part.error)),
        )
        return
      }
    }
  } catch (err) {
    if (abortSignal?.aborted) {
      roiWarn('agent', '⏹ runReportAgent aborted — caller disconnected')
      return
    }
    throw err
  }

  const response = await result.response

  // Track main agent loop usage and flush summary
  try {
    const usage = await result.usage
    tracker.record({ call: 'main_agent', model: 'gpt-4o', ...usage })
  } catch {
    /* usage not available — skip */
  }
  tracker.flush()

  if (mode === 'generate' && !state.assembled) {
    const done =
      [
        state.company ? 'research' : null,
        state.globals ? 'model' : null,
        state.calcOutput ? 'calc' : null,
        state.copy ? 'writer' : null,
      ]
        .filter(Boolean)
        .join(', ') || 'none'
    const assistantText = response.messages
      .filter((m) => m.role === 'assistant')
      .flatMap((m) => {
        if (typeof m.content === 'string') return [m.content]
        if (!Array.isArray(m.content)) return []
        return m.content.flatMap((part) =>
          part.type === 'text' ? [part.text] : [],
        )
      })
      .join('\n')
      .trim()
    callbacks.onError(
      new Error(
        `Generation completed but no assembled report. Stages done: ${done}${
          assistantText
            ? ` | Assistant said: ${assistantText.slice(0, 300)}`
            : ''
        }`,
      ),
    )
    return
  }

  callbacks.onDone(response.messages)
}
