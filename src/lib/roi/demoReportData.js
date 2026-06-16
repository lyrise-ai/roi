// ─────────────────────────────────────────────────────────────────────────────
// Static demo report data for Meridian Consulting Group
// Used by /api/demo-report to render a realistic example report via the real
// ROI pipeline — same assembleReport + renderTemplate path as live reports.
//
// Two exports:
//   MERIDIAN_BASE_STATE  — all 6 workflows (shown on initial demo load)
//   MERIDIAN_ALT_STATE   — proposal writing workflow only (shown after chip click)
// ─────────────────────────────────────────────────────────────────────────────

const USD = { code: 'USD', symbol: '$', name: 'US Dollar' }

const COMPANY = {
  company: 'Meridian Consulting Group',
  industry: 'Management Consulting',
  country: 'United States',
  primaryFocus: 'Strategy and operations consulting for mid-market enterprises',
  keyPriorities: ['operational efficiency', 'client delivery quality', 'margin improvement'],
  employees: 120,
  revenueEstimateM: 18,
}

const GLOBALS = {
  laborRate: 82,
  implementationCost: 44000,
  monthlyToolingCost: 2800,
  profitMultiplier: 1.09,
  realizationFactor: 0.78,
  workWeeksPerYear: 48,
  currency: USD,
}

const NORM_INPUT = {
  companyName: 'Meridian Consulting Group',
  website: 'meridianconsulting.com',
  email: 'sarah.reynolds@meridianconsulting.com',
  recipientName: 'Sarah Reynolds',
  recipientTitle: 'Chief Operating Officer',
  selectedCurrency: 'USD',
  businessDescription: 'Strategy and operations consulting for mid-market enterprises',
  teamSize: '51–200',
  revenueRange: '$5M – $20M',
  industry: 'Management Consulting',
  country: 'United States',
  keyPriorities: ['operational efficiency', 'client delivery quality'],
  processes: [],
  primaryProcess: '',
  volumeHint: '',
  primaryTimeHint: '',
  additionalContext: '',
  workContext: '',
}

// ── 6 workflows (base state) ──────────────────────────────────────────────────

export const BASE_WORKFLOWS = [
  {
    name: 'Proposal Writing Automation',
    agentName: 'ProposalDraft AI',
    function: 'Drafts and structures client proposals from a brief, past work templates, and pricing inputs',
    owner: 'Senior Consultant',
    whyItMatters: 'Proposal writing consumes 4–5 hours of senior consultant time per engagement — the most expensive resource in the firm',
    expectedOutcome: 'Reduce per-proposal effort from 4 hours to under 1 hour while maintaining quality and win-rate',
    sourceType: 'research_derived',
    monthlyVolume: 95,
    minutesPerItemBefore: 240,
    minutesPerItemAfter: 55,
    adoptionRate: 0.82,
    exceptionRate: 0.09,
    exceptionMinutes: 90,
    rateOverride: 105,
    seniorityLevel: 'senior',
    rateSource: 'Glassdoor',
    rateSourceUrl: 'https://www.glassdoor.com/Salaries/senior-consultant-salary',
    rationale: 'Senior consultants in NYC earn $180–210K fully loaded; $105/hr reflects a blended rate including benefits and overhead',
  },
  {
    name: 'Client Report & Deck Assembly',
    agentName: 'ReportBuilder AI',
    function: 'Compiles data, writes narrative sections, and formats slide decks from structured inputs and prior deliverables',
    owner: 'Analyst',
    whyItMatters: 'Analysts spend 30–40% of their time building and reformatting reports rather than analysing — a direct drag on capacity',
    expectedOutcome: 'Cut report assembly time from 2.5 hours to under 40 minutes per deliverable',
    sourceType: 'research_derived',
    monthlyVolume: 160,
    minutesPerItemBefore: 150,
    minutesPerItemAfter: 38,
    adoptionRate: 0.86,
    exceptionRate: 0.07,
    exceptionMinutes: 60,
    rateOverride: 72,
    seniorityLevel: 'mid',
    rateSource: 'LinkedIn Salary',
    rateSourceUrl: 'https://www.linkedin.com/salary/search?keywords=consultant+analyst',
    rationale: 'Mid-level consultants and analysts earn $115–130K fully loaded in US metro markets; $72/hr is a conservative mid-point',
  },
  {
    name: 'Document Review & Contract Analysis',
    agentName: 'DocReview AI',
    function: 'Reviews contracts, NDAs, SOWs, and vendor agreements — flags anomalies, extracts key clauses, and drafts summaries',
    owner: 'Senior Analyst',
    whyItMatters: 'Every client engagement involves 3–8 contracts requiring legal-adjacent review that currently falls to billable staff',
    expectedOutcome: 'Reduce per-document review time from 60 minutes to 15 minutes; surface high-risk clauses automatically',
    sourceType: 'inferred',
    monthlyVolume: 210,
    minutesPerItemBefore: 62,
    minutesPerItemAfter: 14,
    adoptionRate: 0.81,
    exceptionRate: 0.13,
    exceptionMinutes: 45,
    rateOverride: 82,
    seniorityLevel: 'mid',
    rateSource: 'benchmark_fallback',
    rateSourceUrl: null,
    rationale: 'Senior analyst rate at $82/hr reflects a mid-tier benchmark for consultants handling contract work in the US',
  },
  {
    name: 'Meeting Notes & Action Extraction',
    agentName: 'MeetingScribe AI',
    function: 'Transcribes meetings, extracts action items with owners and deadlines, and distributes structured summaries',
    owner: 'Junior Analyst',
    whyItMatters: 'A 120-person firm runs 500–700 internal and client meetings monthly; note-taking consumes disproportionate junior time',
    expectedOutcome: 'Reduce per-meeting documentation from 25 minutes to under 3 minutes; eliminate follow-up ambiguity',
    sourceType: 'inferred',
    monthlyVolume: 580,
    minutesPerItemBefore: 26,
    minutesPerItemAfter: 3,
    adoptionRate: 0.91,
    exceptionRate: 0.04,
    exceptionMinutes: 15,
    rateOverride: 54,
    seniorityLevel: 'junior',
    rateSource: 'benchmark_fallback',
    rateSourceUrl: null,
    rationale: 'Junior analysts earn $85–95K fully loaded; $54/hr reflects the lower end of the consulting cost structure',
  },
  {
    name: 'Research Synthesis & Benchmarking',
    agentName: 'ResearchAgent AI',
    function: 'Pulls industry data, competitor benchmarks, and market sizing from web and internal sources; synthesises into structured briefs',
    owner: 'Principal Consultant',
    whyItMatters: 'Every strategy engagement requires 8–12 hours of research synthesis; it is the highest-value bottleneck in the delivery chain',
    expectedOutcome: 'Compress research synthesis from 6 hours to 90 minutes per brief while improving source coverage',
    sourceType: 'research_derived',
    monthlyVolume: 32,
    minutesPerItemBefore: 370,
    minutesPerItemAfter: 88,
    adoptionRate: 0.74,
    exceptionRate: 0.11,
    exceptionMinutes: 120,
    rateOverride: 118,
    seniorityLevel: 'senior',
    rateSource: 'Glassdoor',
    rateSourceUrl: 'https://www.glassdoor.com/Salaries/principal-consultant-salary',
    rationale: 'Principal consultants earn $200–240K fully loaded; $118/hr reflects the mid-point of this band',
  },
  {
    name: 'Business Development Outreach',
    agentName: 'BDWriter AI',
    function: 'Researches target accounts, writes personalised outreach sequences, and drafts follow-up communications',
    owner: 'Business Development Manager',
    whyItMatters: 'BD sequences require tailored research per prospect — currently averaging 40 minutes per contact, limiting pipeline velocity',
    expectedOutcome: 'Reduce per-contact outreach time from 40 minutes to 8 minutes; increase pipeline coverage without headcount',
    sourceType: 'inferred',
    monthlyVolume: 260,
    minutesPerItemBefore: 42,
    minutesPerItemAfter: 9,
    adoptionRate: 0.77,
    exceptionRate: 0.08,
    exceptionMinutes: 30,
    rateOverride: 72,
    seniorityLevel: 'mid',
    rateSource: 'benchmark_fallback',
    rateSourceUrl: null,
    rationale: 'BD managers in consulting earn $110–130K fully loaded; $72/hr reflects a mid-market US benchmark',
  },
]

// Alt: proposal writing only — used after the demo chip interaction
export const ALT_WORKFLOWS = [BASE_WORKFLOWS[0]]

// ── Report copy (shared between base and alt) ─────────────────────────────────
// The alt state uses the same copy; assembleReport recomputes all financials.

export const BASE_COPY = {
  cta_paragraph:
    'Meridian is well-positioned to capture a first-mover advantage in AI-augmented consulting. The workflows identified here represent the highest-density opportunity in the firm — the places where senior capacity is consumed by tasks that are structurally automatable. A focused pilot on Proposal Writing and Client Reporting can be live within 8 weeks and generating measurable returns within the first billing cycle. LyRise recommends initiating a discovery engagement to validate workflow volumes and confirm the implementation roadmap.',

  unified_pattern_thesis:
    'Meridian\'s model depends on deploying expensive, experienced consultants at the problem — but a significant share of their time is spent on work that is high-volume, low-variance, and structurally separable from the judgement it surrounds. Proposal writing follows templates. Reports follow formats. Contracts surface the same clause types. Meetings produce the same action-item structure. The pattern underneath the financial opportunity is the same in every case: senior and mid-level consultants are acting as skilled formatters. AI can absorb the formatting; the consultants keep the judgement.',

  company_snapshot: [
    { text: '120-person management consulting firm operating across strategy, operations, and transformation practices', sourceType: 'scraped' },
    { text: 'Serves mid-market clients in financial services, healthcare, and industrial sectors', sourceType: 'scraped' },
    { text: 'Estimated annual revenue of $18M; average engagement size $250K–$500K', sourceType: 'benchmarked' },
    { text: 'Consultants bill an estimated 1,600–1,800 hours per year; internal admin accounts for 28–35% of non-billable time', sourceType: 'benchmarked' },
    { text: 'Proposal win rate industry benchmark: 35–45%; each lost proposal represents $4–6K of unrecovered time cost', sourceType: 'benchmarked' },
    { text: 'Staff turnover in management consulting averages 15–20% annually — junior analyst retention is the primary risk to delivery continuity', sourceType: 'benchmarked' },
  ],

  profit_levers: [
    {
      lever_name: 'Proposal Writing Automation',
      baseline_data: '95 proposals drafted monthly by senior consultants averaging 4 hours each at $105/hr fully loaded',
      ai_agent_action: 'AI agent drafts structure, narrative, and pricing tables from a brief in under 55 minutes; consultant reviews and finalises',
      rationale: 'Senior consultant time freed from formatting returns to billable client work — the highest-margin activity in the firm',
      derived_from: 'Proposal Writing Automation',
    },
    {
      lever_name: 'Client Report & Deck Assembly',
      baseline_data: '160 client deliverables produced monthly by analysts averaging 2.5 hours each at $72/hr',
      ai_agent_action: 'AI compiles data, writes commentary, and formats slides from structured inputs; analyst reviews in under 40 minutes',
      rationale: 'Analyst capacity freed from assembly directly increases the number of engagements the firm can staff without additional headcount',
      derived_from: 'Client Report & Deck Assembly',
    },
    {
      lever_name: 'Research Synthesis & Benchmarking',
      baseline_data: '32 research briefs produced monthly by principals averaging 6 hours each at $118/hr',
      ai_agent_action: 'AI pulls and synthesises industry data, benchmarks, and market sizing into structured briefs in under 90 minutes',
      rationale: 'Principal time is the scarcest resource in the firm; returning it from research to client strategy is the highest-leverage intervention',
      derived_from: 'Research Synthesis & Benchmarking',
    },
    {
      lever_name: 'Meeting Notes & Action Extraction',
      baseline_data: '580 meetings documented monthly by junior analysts averaging 26 minutes of post-meeting write-up each',
      ai_agent_action: 'AI transcribes, structures, and distributes meeting summaries with owners and deadlines in under 3 minutes',
      rationale: 'Eliminates one of the highest-volume low-value tasks in the firm; frees junior capacity for analytical work and reduces follow-up delay',
      derived_from: 'Meeting Notes & Action Extraction',
    },
  ],

  cost_of_delay: {
    monthly_cost: null,
    narrative:
      'For Meridian, every month without AI augmentation is a month where senior consultants continue spending 4 hours writing proposals that could take 55 minutes, and principals spend 6-hour blocks on research briefs that could take 90 minutes. The opportunity cost compounds: as competitors adopt these tools and reclaim the same capacity, Meridian\'s per-engagement margin and delivery speed fall behind without any change in headcount or billing rates. The Cost of Delay quantifies what is already being lost — it is not a projection of future savings but a measure of present underperformance.',
  },

  resilience_rows: [
    {
      dimension: 'Talent Retention',
      act_now: 'Junior analysts spend time on high-value analytical work; reduced attrition from removing tedious formatting tasks',
      defer: 'Continued high turnover (15–20%) driven by repetitive admin; replacement cost $25–40K per analyst',
    },
    {
      dimension: 'Proposal Win Rate',
      act_now: 'Faster turnaround on proposals enables response to more RFPs; senior time redirected to proposal quality and strategy',
      defer: 'Win rate stays flat while competitors using AI deliver higher-quality proposals faster at lower cost',
    },
    {
      dimension: 'Delivery Capacity',
      act_now: 'Existing team handles 20–30% more engagements without additional headcount',
      defer: 'Growth requires proportional headcount increases; margin stays flat or declines as salaries rise',
    },
    {
      dimension: 'Client Experience',
      act_now: 'Faster report delivery, more consistent formatting, fewer follow-up gaps from meeting action items',
      defer: 'Delivery quality depends on individual consultant diligence; inconsistency at scale is a client retention risk',
    },
    {
      dimension: 'Competitive Position',
      act_now: 'Ability to price engagements more competitively while maintaining margin, or reinvest freed capacity in higher-value work',
      defer: 'Competitors adopting AI-augmented delivery gain a 20–30% cost advantage; Meridian\'s rate card becomes structurally uncompetitive',
    },
  ],

  pilot_recommendation:
    'Start with Proposal Writing Automation. It targets the highest per-hour cost in the firm, produces a visible and measurable output (the proposal document), and has a clear quality gate (partner review before submission). A 6–8 week pilot with 20 proposals validates the model, builds team confidence, and generates a documented ROI number before broader rollout. The second wave — Client Report & Deck Assembly — can begin in parallel once the proposal agent is in production, since it targets a different role (analysts) with minimal workflow overlap.',

  risks: [
    {
      risk: 'Proposal quality regression',
      detail: 'AI-drafted proposals may initially miss firm-specific voice, client context, or nuanced pricing judgement',
      mitigation: 'Mandatory partner review gate before submission during the pilot; quality scoring tracked per proposal; agent fine-tuned on Meridian\'s winning proposals over the first 60 days',
    },
    {
      risk: 'Adoption resistance from senior consultants',
      detail: 'Senior staff may perceive AI drafting as a threat to their expertise or be reluctant to change their workflow',
      mitigation: 'Frame as a time-return tool, not a replacement; early adopter programme with senior consultants who demonstrate the time savings; make adoption opt-in for the first 90 days',
    },
    {
      risk: 'Client confidentiality and data handling',
      detail: 'Proposal and report generation involves sensitive client data that must not be exposed to third-party model training',
      mitigation: 'All AI processing via enterprise API agreements with zero training data retention; data handling addendum added to vendor contracts; legal sign-off required before pilot launch',
    },
    {
      risk: 'Over-reliance on AI outputs without review',
      detail: 'Time pressure may lead consultants to submit AI-drafted content without adequate review, increasing error risk',
      mitigation: 'Review-gate enforced in the workflow tooling; quality audit on 20% of outputs monthly; escalation path for flagged issues',
    },
  ],
}

// The alt copy differs only in pilot recommendation and CTA — the financial
// recalculation handles everything else automatically.
export const ALT_COPY = {
  ...BASE_COPY,
  cta_paragraph:
    'A Year 1 focus on Proposal Writing Automation represents a deliberately conservative entry point — high impact, contained scope, and a clear measurement framework. The $44,000 implementation cost is recovered within the first two quarters, and the model is validated before expanding to the broader workflow set. LyRise recommends this as a structured pilot: 8 weeks to deploy, 30 days to measure, and a documented ROI number before the board conversation about Phase 2.',
  pilot_recommendation:
    'With a Year 1 scope limited to Proposal Writing Automation, the implementation is straightforward: one workflow, one team (senior consultants), one quality gate (partner review). The pilot should target 20 proposals over 6 weeks, with a quality comparison against the firm\'s baseline win rate. Success metric: proposal turnaround time reduced by 70% and win rate maintained or improved. This creates the internal business case for expanding to Client Reporting and Research Synthesis in Year 2.',
}

// ── Assembled state objects ───────────────────────────────────────────────────

export const MERIDIAN_BASE_STATE = {
  normInput: NORM_INPUT,
  company: COMPANY,
  globals: GLOBALS,
  workflows: BASE_WORKFLOWS,
  copy: BASE_COPY,
  calcOutput: null,
  assembled: null,
  renderedHtml: null,
  renderedFullHtml: null,
  confidenceLevel: 'high',
  coreThesis:
    'Meridian consultants are acting as skilled formatters — AI absorbs the formatting, consultants keep the judgement',
  researchSummary:
    'Research identified 6 high-value workflow automation opportunities across proposal writing, client reporting, document review, meeting documentation, research synthesis, and business development. All workflows are structurally separable from the strategic judgement that surrounds them.',
}

export const MERIDIAN_ALT_STATE = {
  ...MERIDIAN_BASE_STATE,
  workflows: ALT_WORKFLOWS,
  copy: ALT_COPY,
}
