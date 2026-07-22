// Test-only fixture builder for assembleReport.
// Bundled on the fly by assembleReport.test.mjs (esbuild) so the `@/` path
// alias and TypeScript are resolved without adding a test-runner dependency.
import { assembleReport } from '@/src/lib/roi/pipeline/assembleReport'
import { roiCalculator } from '@/src/lib/roi/pipeline/roiCalculator'

import type {
  AssembleReportOutput,
  CompanyProfile,
  GlobalInputs,
  NormalizedInput,
  ReportCopy,
  ReportState,
  WorkflowInput,
} from '@/src/lib/roi/types'

const USD = { code: 'USD', symbol: '$', name: 'US Dollar' }

function baseNormInput(over: Partial<NormalizedInput> = {}): NormalizedInput {
  return {
    companyName: 'Acme',
    website: 'https://acme.test',
    email: 'ops@acme.test',
    recipientName: 'Jordan',
    recipientTitle: 'COO',
    selectedCurrency: 'USD',
    businessDescription: 'Sells widgets',
    teamSize: '',
    revenueRange: '',
    industry: 'Technology / SaaS',
    country: '',
    keyPriorities: ['Scale delivery'],
    processes: [],
    primaryProcess: '',
    volumeHint: '',
    primaryTimeHint: '',
    additionalContext: '',
    workContext: '',
    ...over,
  }
}

function baseCompany(over: Partial<CompanyProfile> = {}): CompanyProfile {
  return {
    company: 'Acme',
    industry: 'Technology / SaaS',
    country: 'United States',
    primaryFocus: 'Sells widgets',
    keyPriorities: ['Scale delivery'],
    employees: 35,
    revenueEstimateM: null,
    ...over,
  }
}

function baseGlobals(): GlobalInputs {
  return {
    laborRate: 52,
    implementationCost: 28000,
    monthlyToolingCost: 950,
    profitMultiplier: 2.4,
    realizationFactor: 0.8,
    workWeeksPerYear: 50,
    currency: USD,
  }
}

function baseWorkflows(): WorkflowInput[] {
  return [
    {
      name: 'Lead qualification',
      agentName: 'Lead Qualification Agent',
      function: 'Revenue Operations',
      owner: 'COO',
      whyItMatters: 'Speed.',
      expectedOutcome: 'Faster routing.',
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
      rationale: 'Benchmark.',
    },
  ]
}

function baseCopy(): ReportCopy {
  return {
    cta_paragraph: 'Call us.',
    profit_levers: [
      {
        lever_name: 'More throughput',
        baseline_data: 'baseline',
        ai_agent_action: 'action',
        rationale: 'rationale',
        derived_from: 'Lead qualification',
      },
    ],
    unified_pattern_thesis: 'Manual orchestration slows revenue work.',
    company_snapshot: [{ text: 'Acme sells widgets.', sourceType: 'scraped' }],
    cost_of_delay: { narrative: 'Delay carries a price.' },
    resilience_rows: [{ dimension: 'Cost', act_now: 'lower', defer: 'higher' }],
    pilot_recommendation: 'Start with lead qualification.',
    risks: [{ risk: 'Messy data', detail: 'detail', mitigation: 'mitigate' }],
  }
}

export interface BuildOptions {
  normInput?: Partial<NormalizedInput>
  company?: Partial<CompanyProfile>
}

// Builds a complete, valid ReportState (before assembly) — shared by any test
// that needs the raw state rather than the PDF's assembled output.
export function buildState(opts: BuildOptions = {}): ReportState {
  const normInput = baseNormInput(opts.normInput)
  const company = baseCompany(opts.company)
  const globals = baseGlobals()
  const workflows = baseWorkflows()

  return {
    normInput,
    company,
    globals,
    workflows,
    copy: baseCopy(),
    calcOutput: roiCalculator(workflows, globals, company),
    assembled: null,
    renderedHtml: null,
    renderedFullHtml: null,
    confidenceLevel: 'high',
    coreThesis: 'thesis',
  }
}

// Builds a complete, valid ReportState and returns the assembled output.
export function buildAssembled(opts: BuildOptions = {}): AssembleReportOutput {
  return assembleReport(buildState(opts))
}
