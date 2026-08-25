// ─────────────────────────────────────────────────────────────────────────────
// The shapes every part of the ROI pipeline passes around.
// ─────────────────────────────────────────────────────────────────────────────

// -- What the user filled in on the form ------------------------------------

export interface ProcessInput {
  name: string
  department: string
  icon: string
  volume_per_month: string | null
  time_per_item: string | null
  owner_role: string | null
  systems_used: string[]
  decision_points: string[]
  handoffs: string[]
  steps: string[]
}

export interface QuestionnairePayload {
  'Company Name': string
  'Company Website URL': string
  'What does your company do?': string
  'Number of Employees': string
  'Estimated Annual Revenue': string
  'Operating Currency': string
  Email: string
  'Recipient Name'?: string
  'Recipient Title'?: string
  Industry: string
  Country: string
  'Key Priorities': string[]
  processes: ProcessInput[]
  // Older, flat field names. Kept so old saved reports still open.
  'Biggest time drain on your team'?: string
  'Monthly volume of this process (approx.)'?: string
  'Primary process time per item'?: string
  'Any other bottlenecks to mention? (optional)'?: string
}

// -- The tidied-up version of that form, produced by normalize.ts ------------

export interface NormalizedInput {
  companyName: string
  website: string
  email: string
  recipientName: string
  recipientTitle: string
  selectedCurrency: string
  businessDescription: string
  teamSize: string
  revenueRange: string
  industry: string
  country: string
  keyPriorities: string[]
  processes: ProcessInput[]
  primaryProcess: string
  volumeHint: string
  primaryTimeHint: string
  additionalContext: string
  workContext: string
}

// ── Currency ─────────────────────────────────────────────────────────────────

export interface Currency {
  code: string
  symbol: string
  name: string
}

// -- The company. One of the four fields that hold the truth. ----------------

export interface CompanyProfile {
  company: string
  industry: string
  country: string | null
  primaryFocus: string | null
  keyPriorities: string[]
  employees: number | null
  revenueEstimateM: number | null // estimated annual revenue in millions
}

// -- One workflow. Another of the four fields that hold the truth. -----------
// The name and description come from research. The numbers are set by the
// modeller, and can be edited directly through update_workflow in chat.

export interface WorkflowInput {
  // What it is (found during research)
  name: string
  agentName: string
  function: string
  owner: string
  whyItMatters: string
  expectedOutcome: string
  sourceType: 'user_stated' | 'inferred' | 'research_derived'

  // The numbers (set by the modeller, editable in chat)
  monthlyVolume: number
  minutesPerItemBefore: number
  minutesPerItemAfter: number
  adoptionRate: number // 0–1
  exceptionRate: number // 0–1
  exceptionMinutes: number
  rateOverride: number | null // per-workflow hourly rate; null = use GlobalInputs.laborRate
  // How senior the person doing this work is. It decides the minimum hourly
  // rate for the region that roiCalculator enforces (Rule 6A).
  seniorityLevel: 'junior' | 'mid' | 'senior' | null
  // Where the hourly rate came from (Rule 6A). Shown in the report's sources
  // table. "benchmark_fallback" means we found no salary evidence and fell back
  // to the regional minimum. A real name like "Glassdoor" or "Bayt.com" means
  // the rate came from a salary source we actually found.
  rateSource: string | null
  rateSourceUrl: string | null
  rationale: string

  // True for workflows the user deliberately kept in the check-it-over wizard
  // (src/components/ROIGenerator/Validation). Shows up as a 'Validated' label
  // instead of 'Provided', 'Scraped' or 'Benchmarked'.
  userValidated?: boolean
}

// -- Pay figures found during research, one per workflow ---------------------
// The modeller reads these to set the hourly cost from a real source, instead
// of making one up from memory.
export interface SalaryEvidence {
  workflowName: string // join key — must match a WorkflowInput.name
  roleQueried: string // e.g. "Senior sales executive in UAE"
  sourceUrls: string[] // URLs where salary numbers were found
  rawSnippets: string[] // verbatim snippets containing pay figures
  parsedAnnualLow?: number | null // best-effort lower bound, in evidenceCurrency
  parsedAnnualHigh?: number | null // best-effort upper bound, in evidenceCurrency
  evidenceCurrency?: string | null // ISO code of the parsed numbers (e.g. "USD", "AED")
}

// -- The money settings that apply to the whole report. Truth field three. ---

export interface GlobalInputs {
  laborRate: number // fully-loaded hourly cost (global fallback)
  implementationCost: number
  monthlyToolingCost: number
  profitMultiplier: number
  realizationFactor: number
  workWeeksPerYear: number
  currency: Currency
}

// -- What the calculator works out. Nothing here is typed in by anyone. ------

export interface WorkflowCalc {
  name: string // mirrors WorkflowInput.name for lookup
  effectiveRate: number // rateOverride if set, else GlobalInputs.laborRate
  timeSaved: number // minutesPerItemBefore - minutesPerItemAfter (minutes)
  savingsPct: number
  costPerRun: number
  monthlyCost: number
  monthlyHours: number
  monthlyValue: number
  annualHours: number
  annualValue: number
  // A volume worked backwards so that the simple sum on the page adds up:
  //   volume x hours saved per item x rate is roughly the monthly value.
  // It already has the take-up and realisation discounts in it, and any scaling
  // we did to stay inside the revenue band. That way the page can show one set
  // of numbers that agree with each other.
  effectiveMonthlyVolume: number
  // Profit uplift for this workflow = monthly value x (profit multiplier - 1).
  // The Profit Uplift table shows this sum, worked out here in code, instead of
  // trusting the sentence the modeller wrote.
  monthlyProfitUplift: number
}

export interface RoiSummary {
  totalAnnualHours: number
  totalAnnualHours24mo: number
  totalAnnualHours36mo: number
  operationalDividend12mo: number
  profitUplift12mo: number
  totalFinancialGain12mo: number
  operationalDividend24mo: number
  profitUplift24mo: number
  totalFinancialGain24mo: number
  operationalDividend36mo: number
  profitUplift36mo: number
  totalFinancialGain36mo: number
  implCost: number
  monthlyTooling: number
  paybackMonths: number | null
}

export interface Figures {
  totalMonthlyHours: string
  totalAnnualHours: string
  statFTE: string
  operationalDividend12mo: string
  profitUplift12mo: string
  totalFinancialGain12mo: string
  totalFinancialGainShort: string
  workflowLines: string[]
}

export interface RoiCalculatorOutput {
  workflows: WorkflowCalc[]
  totalMonthlyHours: number
  totalAnnualHours: number
  summary: RoiSummary
  figures: Figures
}

// -- The written words of the report. Truth field four. ----------------------

export interface CompanySnapshotItem {
  text: string
  sourceType: 'scraped' | 'benchmarked' | 'assumed'
}

export interface PainPoint {
  title: string
  description: string
  confidence: 'high' | 'medium' | 'low'
  source: 'user_stated' | 'inferred' | 'research_derived'
}

export interface ReportEvidenceItem {
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
  createdAt?: string
}

export interface SpecificityAssessment {
  score: number
  level: 'strong' | 'moderate' | 'weak'
  evidenceCount: number
  researchDerivedWorkflowCount: number
  inferredWorkflowCount: number
  scrapedSnapshotCount: number
  companySignalCount: number
  warnings: string[]
}

export interface CostOfDelayData {
  monthly_cost?: number // computed by calculator; LLM no longer outputs this
  narrative: string
}

export interface ResilienceRow {
  dimension: string
  act_now: string
  defer: string
}

export interface RiskRow {
  risk: string
  detail: string
  mitigation: string
}

export interface ProfitLever {
  lever_name: string
  baseline_data: string
  ai_agent_action: string
  rationale: string
  // The model writes this, but assembleReport overwrites it with the sum worked
  // out from the calculator's own figures. That way it always agrees with the
  // profit uplift total, even if the writing model used old rates.
  rationale_with_arithmetic?: string
  derived_from: string
}

export interface ReportCopy {
  cta_paragraph: string
  profit_levers: ProfitLever[]
  unified_pattern_thesis: string
  company_snapshot: CompanySnapshotItem[]
  cost_of_delay: CostOfDelayData
  resilience_rows: ResilienceRow[]
  pilot_recommendation: string
  risks: RiskRow[]
}

// -- The finished object the page and the PDF are drawn from -----------------

export interface DisplayObject {
  currencyCode: string
  currencySymbol: string
  workflowCount: string
  coverHeadline: string
  statHours: string
  statHoursSub: string
  statOD: string
  statTF: string
  statFTE: string
  statPU: string
  totalAnnualHours: string
  od12: string
  pu12: string
  tf12: string
  hrs24: string
  od24: string
  pu24: string
  tf24: string
  hrs36: string
  od36: string
  pu36: string
  tf36: string
  recipientDisplay: string
  caseStudiesHTML: string
  scopeListHTML: string
  profitLeversBody: string
  workflowMasterTableBody: string
  provenanceTableHTML: string
  revenueContextStatement: string
  companySnapshotTableBody: string
  confidenceBadge: string
  unifiedPatternThesis: string
  costOfDelayHTML: string
  resilienceTableHTML: string
  pilotRecommendation: string
  risksTableBody: string
  nextStepsHTML: string
  odVsPuPanelHTML: string
  calculationPanelHTML: string
  roadmapTableBody: string
  blufParagraph: string
  bvaTableBodyCompact: string
  profitUpliftLogicBody: string
}

// roi_data is a small bag of display values that fill the gaps in the template
export interface RoiDisplayData {
  company: string
  industry: string | null
  country: string | null
  employees: number | null
  revenue: number | null // millions
  currency: Currency
  summary: RoiSummary
  totalMonthlyHours: number
  totalAnnualHours: number
}

export interface AssembleReportOutput {
  roi_data: RoiDisplayData
  copy: ReportCopy
  display: DisplayObject
  current_date: string
  recipient_email: string
}

// -- Everything the agent holds while it works -------------------------------

export interface ReportState {
  normInput: NormalizedInput | null

  // The four truth fields. These are what the tools edit.
  company: CompanyProfile | null
  globals: GlobalInputs | null
  workflows: WorkflowInput[] | null
  copy: ReportCopy | null

  // Worked out from the four above. reAssemble() redoes these on every change.
  calcOutput: RoiCalculatorOutput | null
  assembled: AssembleReportOutput | null
  renderedHtml: string | null
  renderedFullHtml: string | null

  // Bookkeeping
  confidenceLevel: 'high' | 'low' | null
  coreThesis: string | null
  painPoints?: PainPoint[]
  researchSummary?: string | null
  evidenceItems?: ReportEvidenceItem[]
  specificityAssessment?: SpecificityAssessment | null
  salaryEvidence?: SalaryEvidence[]
}

export interface AgentCallbacks {
  onTextDelta(delta: string): void
  onToolStart(toolName: string, args?: Record<string, unknown>): void
  onPipelineLog?(message: string): void
  // Called when a tool finishes, whether it worked or failed. It tells the
  // caller what actually happened, instead of leaving them to guess from
  // whether onReportUpdate happened to fire.
  onToolResult?(toolName: string, output: unknown): void
  onReportUpdate(state: ReportState, changedSections?: string[]): void
  onDone(newMessages: import('ai').ModelMessage[]): void
  onError(err: Error): void
  // Called once with a summary of what this run cost. The caller saves it to
  // the roi_usage table once the report has an id (see
  // usageStore.persistUsage).
  onUsage?(summary: import('./services/usageTracker').UsageSummary): void
}
