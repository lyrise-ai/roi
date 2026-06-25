import { assembleReport } from '@/src/lib/roi/pipeline/assembleReport'
import { roiCalculator } from '@/src/lib/roi/pipeline/roiCalculator'
import { renderTemplate } from '@/src/lib/roi/pipeline/renderTemplate'

import type {
  Currency,
  NormalizedInput,
  ReportState,
  WorkflowInput,
  GlobalInputs,
  CompanyProfile,
  ReportCopy,
} from '@/src/lib/roi/types'

const CURRENCY_MAP: Record<string, Currency> = {
  USD: { code: 'USD', symbol: '$', name: 'US Dollar' },
  EUR: { code: 'EUR', symbol: 'EUR ', name: 'Euro' },
  GBP: { code: 'GBP', symbol: 'GBP ', name: 'British Pound' },
  SAR: { code: 'SAR', symbol: 'ر.س', name: 'Saudi Riyal' },
  AED: { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
  QAR: { code: 'QAR', symbol: 'QAR ', name: 'Qatari Riyal' },
  KWD: { code: 'KWD', symbol: 'KWD ', name: 'Kuwaiti Dinar' },
  BHD: { code: 'BHD', symbol: 'BHD ', name: 'Bahraini Dinar' },
  OMR: { code: 'OMR', symbol: 'OMR ', name: 'Omani Rial' },
  EGP: { code: 'EGP', symbol: 'EGP ', name: 'Egyptian Pound' },
  NGN: { code: 'NGN', symbol: 'NGN ', name: 'Nigerian Naira' },
  ZAR: { code: 'ZAR', symbol: 'ZAR ', name: 'South African Rand' },
}

export function getCurrency(code: string): Currency {
  return CURRENCY_MAP[code] ?? CURRENCY_MAP.USD
}

function buildCompany(normInput: NormalizedInput): CompanyProfile {
  return {
    company: normInput.companyName || 'LyRise',
    industry: normInput.industry || 'Technology / SaaS',
    country: normInput.country || 'United Arab Emirates',
    primaryFocus:
      normInput.businessDescription || 'Selling AI solutions for businesses',
    keyPriorities:
      normInput.keyPriorities.length > 0
        ? normInput.keyPriorities
        : [
            'Scale delivery without adding headcount',
            'Shorten sales cycles',
            'Reduce manual ops work',
          ],
    employees: 35,
    revenueEstimateM: 6,
  }
}

function buildWorkflows(company: CompanyProfile): WorkflowInput[] {
  return [
    {
      name: 'Inbound lead qualification',
      agentName: 'Lead Qualification Agent',
      function: 'Revenue Operations',
      owner: 'COO',
      whyItMatters:
        'Quicker qualification increases response speed and prevents strong inbound interest from going cold.',
      expectedOutcome:
        'Qualified inbound opportunities routed with context in minutes instead of hours.',
      sourceType: 'research_derived',
      monthlyVolume: 180,
      minutesPerItemBefore: 35,
      minutesPerItemAfter: 8,
      adoptionRate: 0.72,
      exceptionRate: 0.08,
      exceptionMinutes: 12,
      rateOverride: 42,
      seniorityLevel: 'mid',
      rateSource: 'LinkedIn Salary Insights',
      rateSourceUrl: 'https://www.linkedin.com/salary/',
      rationale: `Assumes a healthy inbound mix for a growing AI services firm. Source: LinkedIn Salary Insights blended RevOps benchmark.`,
    },
    {
      name: 'Proposal drafting and tailoring',
      agentName: 'Proposal Drafting Agent',
      function: 'Sales',
      owner: 'COO',
      whyItMatters:
        "Proposal turnaround speed directly affects close rates and the team's ability to run more active deals in parallel.",
      expectedOutcome:
        'High-quality first drafts generated from discovery notes and reusable proof points.',
      sourceType: 'inferred',
      monthlyVolume: 24,
      minutesPerItemBefore: 180,
      minutesPerItemAfter: 45,
      adoptionRate: 0.72,
      exceptionRate: 0.08,
      exceptionMinutes: 20,
      rateOverride: 68,
      seniorityLevel: 'senior',
      rateSource: 'Robert Half',
      rateSourceUrl: 'https://www.roberthalf.com/us/en/insights/salary-guide',
      rationale: `Assumes a mid-market deal flow where custom proposals still require leadership review. Source: Robert Half US solutions consultant benchmark.`,
    },
    {
      name: 'Discovery recap and follow-up emails',
      agentName: 'Follow-Up Agent',
      function: 'Client Success',
      owner: 'COO',
      whyItMatters:
        'Fast follow-up keeps deals moving and reduces leakage between meetings and next actions.',
      expectedOutcome:
        'Recaps, action lists, and next-step emails produced automatically after calls.',
      sourceType: 'inferred',
      monthlyVolume: 70,
      minutesPerItemBefore: 50,
      minutesPerItemAfter: 10,
      adoptionRate: 0.72,
      exceptionRate: 0.08,
      exceptionMinutes: 12,
      rateOverride: 48,
      seniorityLevel: 'mid',
      rateSource: 'LinkedIn Salary Insights',
      rateSourceUrl: 'https://www.linkedin.com/salary/',
      rationale: `Assumes multiple discovery and check-in calls per week across pipeline and active prospects. Source: LinkedIn Salary Insights mid-market AE benchmark.`,
    },
    {
      name: 'CRM updates and meeting prep',
      agentName: 'CRM Ops Agent',
      function: 'Operations',
      owner: 'Revenue Ops Lead',
      whyItMatters:
        'Manual CRM hygiene is expensive, error-prone, and frequently delayed until after customer-facing work.',
      expectedOutcome:
        'Deal records, notes, and meeting briefs updated automatically before and after calls.',
      sourceType: 'research_derived',
      monthlyVolume: 220,
      minutesPerItemBefore: 18,
      minutesPerItemAfter: 4,
      adoptionRate: 0.72,
      exceptionRate: 0.08,
      exceptionMinutes: 12,
      rateOverride: 34,
      seniorityLevel: 'junior',
      rateSource: 'Glassdoor',
      rateSourceUrl: 'https://www.glassdoor.com/Salaries/index.htm',
      rationale: `Assumes a high count of touchpoints across leads, opportunities, and delivery stakeholders. Source: Glassdoor operations coordinator benchmark.`,
    },
  ]
}

function buildGlobals(normInput: NormalizedInput): GlobalInputs {
  const currency = getCurrency(normInput.selectedCurrency || 'USD')
  const workWeeksPerYear = ['USD', 'EUR', 'GBP'].includes(currency.code)
    ? 50
    : 48
  return {
    laborRate: 52,
    implementationCost: 28000,
    monthlyToolingCost: 950,
    profitMultiplier: 2.4,
    realizationFactor: 0.8,
    workWeeksPerYear,
    currency,
  }
}

function buildCopy(state: ReportState): ReportCopy {
  const calc = state.calcOutput!
  const summary = calc.summary
  const workflows = calc.workflows
  const company = state.company!
  const globals = state.globals!
  const sym = globals.currency.symbol
  const recipient = state.normInput?.recipientName || 'Yousef'
  const recipientTitle = state.normInput?.recipientTitle || 'COO'

  const [wf1, wf2, wf3, wf4] = workflows
  const lever1 = Math.round(summary.profitUplift12mo * 0.45)
  const lever2 = Math.round(summary.profitUplift12mo * 0.3)

  // Get raw inputs from state.workflows for display
  const inp = state.workflows ?? []
  const inp2 = inp.find((w) => w.name === wf2?.name)
  const inp1 = inp.find((w) => w.name === wf1?.name)
  const inp3 = inp.find((w) => w.name === wf3?.name)

  return {
    unified_pattern_thesis: `${company.company} is selling complex AI services into live business problems, which creates a repeatable coordination burden across lead handling, proposal assembly, and follow-up. That pattern — high-value commercial work slowed by manual orchestration — is where AI delivers its fastest return.`,
    company_snapshot: [
      {
        text: `${company.company} sells AI solutions for businesses.`,
        sourceType: 'scraped',
      },
      {
        text: `Testing fixture assumes a ${
          company.employees ?? 35
        }-person commercial and delivery team.`,
        sourceType: 'assumed',
      },
      {
        text: `The business likely balances inbound demand capture with custom scoping and proposal work.`,
        sourceType: 'benchmarked',
      },
    ],
    cta_paragraph: `If your team is handling fast-moving inbound demand, manually drafting custom proposals, and still spending ${calc.figures.totalMonthlyHours} Hours Returned per month on repetitive coordination work, a 30-minute discovery call with LyRise (elena@lyrise.ai) would be worthwhile. This report models ${calc.figures.operationalDividend12mo} in Operational Dividend using only targeted workflow automation.`,
    profit_levers: [
      {
        lever_name: 'More proposals shipped without founder bottlenecks',
        derived_from: wf2?.name ?? '',
        baseline_data: `${wf2?.name} currently returns ${wf2?.monthlyHours} hrs/mo according to the calculator output.`,
        ai_agent_action:
          'Redirect 35% of those recovered commercial hours into additional proposal capacity and pipeline progression.',
        rationale:
          'Proposal throughput improves because leadership can review and send more qualified opportunities each month.',
        rationale_with_arithmetic: `${wf2?.monthlyHours} hrs/mo × ${sym}${
          inp2?.rateOverride ?? globals.laborRate
        }/hr × 0.35 = ${sym}${Math.round(
          (wf2?.monthlyHours ?? 0) *
            (inp2?.rateOverride ?? globals.laborRate) *
            0.35,
        )}/mo → ${sym}${lever1}/yr`,
      },
      {
        lever_name: 'Faster follow-up lifts conversion efficiency',
        derived_from: `${wf1?.name ?? ''}, ${wf3?.name ?? ''}`,
        baseline_data: `${wf1?.name} and ${wf3?.name} together remove delay from qualification and post-call follow-up.`,
        ai_agent_action:
          'Convert 25% of recovered customer-facing hours into faster response and reduced drop-off across active deals.',
        rationale:
          'Deals advance more consistently because prospects get qualification decisions and next steps while intent is still high.',
        rationale_with_arithmetic: `${
          (wf1?.monthlyHours ?? 0) + (wf3?.monthlyHours ?? 0)
        } hrs/mo × ${sym}${Math.round(
          ((inp1?.rateOverride ?? globals.laborRate) +
            (inp3?.rateOverride ?? globals.laborRate)) /
            2,
        )}/hr × 0.25 = ${sym}${Math.round(
          ((wf1?.monthlyHours ?? 0) + (wf3?.monthlyHours ?? 0)) *
            Math.round(
              ((inp1?.rateOverride ?? globals.laborRate) +
                (inp3?.rateOverride ?? globals.laborRate)) /
                2,
            ) *
            0.25,
        )}/mo → ${sym}${lever2}/yr`,
      },
      {
        lever_name: 'Leadership capacity shifts into higher-value selling',
        derived_from: `${wf1?.name ?? ''}, ${wf2?.name ?? ''}, ${
          wf4?.name ?? ''
        }`,
        baseline_data: `${company.company} can redeploy operational and sales coordination time into client conversations, partnerships, and delivery oversight.`,
        ai_agent_action:
          'Apply the residual recovered capacity to strategic selling, stakeholder management, and expansion work.',
        rationale:
          'Profit rises because senior time moves from admin orchestration into revenue-bearing and client-retention activity.',
        rationale_with_arithmetic: `See total profit uplift — residual after levers 1 and 2`,
      },
    ],
    cost_of_delay: {
      monthly_cost: Math.round(summary.totalFinancialGain12mo / 12),
      narrative: `Each month without automation leaves ${company.company} paying for manual lead handling, proposal assembly, and CRM coordination that do not require senior judgment. Delay is not neutral — it carries a monthly price.`,
    },
    resilience_rows: [
      {
        dimension: 'Cost per unit',
        act_now:
          'More opportunities are processed with the same commercial team, lowering effort per qualified deal.',
        defer:
          'Manual handling keeps proposal and qualification cost tied directly to headcount growth.',
      },
      {
        dimension: 'Delivery speed',
        act_now:
          'Qualification, recap, and proposal cycles move in hours instead of waiting for founder bandwidth.',
        defer:
          'High-intent prospects sit in queues between meetings, summaries, and tailored follow-up.',
      },
      {
        dimension: 'Error rate',
        act_now:
          'CRM updates and meeting briefs become more consistent because the workflow is systematized.',
        defer:
          'Commercial context continues to be lost in handoffs, notes, and incomplete record keeping.',
      },
      {
        dimension: 'Strategic capacity',
        act_now: `${recipientTitle} time is redirected into pricing, partnerships, and closing work.`,
        defer:
          'Leadership stays trapped in repetitive revenue operations and coordination loops.',
      },
    ],
    pilot_recommendation: `Given ${company.company}'s ${
      company.employees ?? 35
    } employees and ${
      inp2?.monthlyVolume ?? 24
    }/month equivalent proposal workload, the fastest path to measurable ROI is automating ${
      wf2?.name ?? 'Proposal drafting'
    } in Phase 1, targeting faster turnaround on tailored commercial offers and cleaner handoff into follow-up.`,
    risks: [
      {
        risk: 'Messy source data',
        detail: `${company.company} likely stores qualification notes, call context, and commercial assets across multiple tools. If those inputs are inconsistent, the agent output will still need manual review early on.`,
        mitigation:
          'Start with one system of record, define mandatory fields, and add human approval before external sending.',
      },
      {
        risk: 'Over-automation of nuanced sales work',
        detail:
          'Some proposal and scoping decisions still require senior judgment, especially for bespoke AI engagements. Pushing too much automation too early could flatten quality.',
        mitigation:
          'Keep pricing, final scope, and edge-case approvals with the COO until confidence is proven.',
      },
      {
        risk: 'Workflow adoption stalls',
        detail: `${recipient} and the broader team will only realize value if AI-generated drafts actually replace manual work. Partial adoption would slow the payback profile materially.`,
        mitigation:
          'Choose one high-volume workflow first, instrument usage weekly, and tie rollout to explicit process ownership.',
      },
    ],
  }
}

export function buildDevMockReportState(params: {
  normInput: NormalizedInput
  execTemplateHtml: string
  fullTemplateHtml: string
}): ReportState {
  const { normInput, execTemplateHtml, fullTemplateHtml } = params

  const company = buildCompany(normInput)
  const globals = buildGlobals(normInput)
  const workflows = buildWorkflows(company)

  const state: ReportState = {
    normInput,
    company,
    globals,
    workflows,
    copy: null,
    calcOutput: roiCalculator(workflows, globals, company),
    assembled: null,
    renderedHtml: null,
    renderedFullHtml: null,
    confidenceLevel: 'high',
    coreThesis:
      'High-value revenue work is slowed by repetitive orchestration that can be automated safely.',
  }

  state.copy = buildCopy(state)
  state.assembled = assembleReport(state)
  state.renderedHtml = renderTemplate(execTemplateHtml, state.assembled)
  state.renderedFullHtml = renderTemplate(fullTemplateHtml, state.assembled)

  return state
}
