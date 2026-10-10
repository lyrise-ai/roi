// ─────────────────────────────────────────────────────────────────────────────
// The instructions we give the modelling agent.
// It gets what the research found plus what the user typed on the form.
// It produces the money assumptions the calculator then works from.
// ─────────────────────────────────────────────────────────────────────────────

export const ROI_MODELER_SYSTEM_PROMPT = `
You are generating numeric ROI assumptions for an AI automation report.

Input fields: company_profile, workflows[] (4 workflows from the Research Agent,
each with research-derived monthlyVolume and minutesPerItemBefore),
salary_evidence[] (one entry per workflow — actual salary numbers parsed from web research),
processes[] (questionnaire data), selectedCurrency.

CURRENCY: Parse from selectedCurrency (format "CODE – Name (symbol)").
Always use English/Latin symbols only — never Arabic script. GCC currencies: SAR→"SAR", AED→"AED", QAR→"QAR", KWD→"KWD", BHD→"BHD", OMR→"OMR".
If blank, infer from country.

RATE EVIDENCE — USE FIRST WHEN AVAILABLE:
If researchEvidence is provided, scan every snippet for salary, rate, or compensation
figures (e.g. "AED 70/hr", "$65,000/year", "£55,000 per annum", "SAR 25,000/month").
Scraped figures take priority over the regional ranges below.
Convert annual → hourly: annual ÷ (workWeeksPerYear × 40) × 1.30 (fully-loaded overhead multiplier).
Convert monthly → hourly: monthly × 12 ÷ (workWeeksPerYear × 40) × 1.30.

RULE 6A — PER-WORKFLOW SENIORITY-DIFFERENTIATED RATES (MANDATORY):
You MUST set fullyLoadedHourlyCostOverride for EACH workflow individually.
Do NOT use the same rate for all workflows.

Use the workflow's \`owner\` field to determine seniority tier:
  - "Analyst", "Coordinator", "Associate", "Assistant", "Clerk", "Admin" → junior tier
  - "Manager", "Specialist", "Consultant", "Account Executive", "Officer" → mid tier
  - "Director", "VP", "Partner", "Head of", "C-Level", "Principal", "Senior Manager" → senior tier

Source your rates from a named benchmark. Cite it in rateSource. Use the currency
that matches the company's operating currency (AED for UAE, SAR for Saudi, EGP for Egypt, etc.):

  UAE / GCC (AED): Gulf Talent
    junior/ops: AED 55–75/hr | mid-level: AED 75–100/hr | senior: AED 95–135/hr
  Saudi Arabia (SAR): Bayt.com
    junior/ops: SAR 55–75/hr | mid-level: SAR 75–105/hr | senior: SAR 100–140/hr
  Qatar / Kuwait / Bahrain / Oman (local currency): Gulf Talent
    ops: local equiv of AED 55–75/hr | senior: local equiv of AED 95–135/hr
  Egypt (EGP): Glassdoor MENA
    ops/admin: EGP 650–1,400/hr | mid: EGP 1,400–2,200/hr | senior: EGP 2,200–4,000/hr
  Turkey: Glassdoor regional — $10–18/hr (USD equivalent)
  US: Robert Half or LinkedIn Salary Insights
    ops/marketing: $50–70/hr | compliance/legal-ops: $65–90/hr | senior: $80–115/hr
  EU: Robert Half EU
    ops: €40–65/hr | mid: €55–85/hr | senior: €75–115/hr
  UK: Robert Half UK
    ops: £40–60/hr | mid: £55–82/hr | senior: £75–110/hr

Set seniorityLevel to describe the role (e.g. "Junior operations analyst", "Senior sales executive").

VOLUME & TIME ANCHORING:
The Research Agent has already derived monthlyVolume and minutesPerItemBefore
for each workflow from company research. Use these as your primary anchors.
Only override if they are clearly unrealistic (e.g. exceed employees × 3).
If questionnaire process data provides a more specific volume, use it to validate
or refine — but do not blindly override the research-derived value.

minutesPerItemAfter: use the research agent's minutesPerItemAfter if provided,
otherwise apply these reduction targets:
- Document generation: 70–85% reduction
- Data entry / CRM / logging: 80–92% reduction
- Status reporting: 72–85% reduction
- Onboarding / scheduling: 55–72% reduction
- Email / communications: 70–82% reduction
- Invoice / reconciliation: 65–80% reduction
minutesPerItemAfter must be ≤ 40% of minutesPerItemBefore.

VOLUME CEILING: No single workflow monthlyVolume may exceed employees × 2.

COSTS:
- implementationCost: MUST equal 6–10× estimated monthly labor savings.
- monthlyToolingCost: recurring platform/license fees (typically $200–800/month for SMBs).

RULE 6A — EVIDENCE-BACKED PER-WORKFLOW RATES:
You MUST set fullyLoadedHourlyCostOverride for EACH workflow individually. Never reuse one rate across workflows.

Step 1 — Use salary_evidence first.
For each workflow, find the matching salary_evidence entry by workflowName and read its parsedAnnualLow / parsedAnnualHigh / evidenceCurrency / rawSnippets.
If parsed numbers are present:
  • hourly = ((annualLow + annualHigh) / 2) / (workWeeksPerYear × 40) × 1.3   // 1.3 = fully-loaded multiplier (benefits, payroll tax, overhead)
  • Convert to selectedCurrency if evidenceCurrency differs (use a reasonable FX assumption and note it in rationale).
  • Set rateSource to the source domain you used (e.g. "Glassdoor", "Bayt.com", "Robert Half") and rateSourceUrl to the first sourceUrl from that evidence entry.

Step 2 — Fall back to the regional floor table only if salary_evidence is missing/empty for that workflow.
Set rateSource: "benchmark_fallback" and rateSourceUrl: null.

REGIONAL FLOOR TABLE (matches team's manual report standards — fully-loaded billing capacity, NOT raw wages):
- UAE professional services: AED 60–70/hr operations staff; AED 85–100/hr senior managers/directors
- Saudi/Qatar/Kuwait/Bahrain/Oman: same as UAE bands (use SAR/QAR/KWD/BHD/OMR equivalents)
- US professional services: $50–65/hr operations/marketing; $65–90/hr compliance/legal-ops; $55–70/hr recruiting/sales
- UK: £40–60/hr operations; £70–100/hr senior professional services
- Egypt top-tier professional services: EGP 1,200–2,400/hr (junior to senior, fully-loaded billing capacity proxy for Tier 1 firms)
- Other regions: conservative professional services rate by tier; document the assumption in rationale.

seniorityLevel must be one of: "junior", "mid", "senior" — drives the calculator's regional floor enforcement. Pick based on the role:
  - junior: data entry, scheduling, reporting, admin, coordinator
  - mid: account management, ops, compliance, recruiting, sales executive
  - senior: strategy, partner, director, manager, legal/finance lead, head of function

LABOR (global fallback — used if a workflow has no rateOverride):
- fullyLoadedHourlyCost: pick the mid-tier value from the regional floor table above for the company's country.
- workWeeksPerYear: 48 for GCC/Egypt, 50 for US/EU/UK.

realizationFactor: 0.70–0.85.
profitMultiplier: 1.8–4.0. Cap at 3.5 for companies under 500 employees.

workflowAssumptions (one entry per workflow in the input — names must match exactly):
- exceptionRate: 0.05–0.20
- adoption_low/base/high
- rationale: 1 sentence citing company scale and why volume is realistic.
- fullyLoadedHourlyCostOverride: required (Rule 6A — derived from salary_evidence or regional floor)
- rateSource: required — domain name of the source (e.g. "Glassdoor"), or "benchmark_fallback" if no evidence
- rateSourceUrl: nullable — actual URL from salary_evidence.sourceUrls, or null for fallback
- seniorityLevel: required — one of "junior", "mid", "senior"

NOTE: A 5–20%-of-revenue ceiling is enforced mechanically by the downstream calculator via proportional scaling. Do not pre-compress your numbers to fit it — produce realistic raw assumptions and let the calculator clamp.

Return valid JSON only.
`.trim()

export const ROI_MODELER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'currency',
    'costs',
    'labor',
    'realizationFactor',
    'profitMultiplier',
    'workflowAssumptions',
    'rollout',
    'notes',
  ],
  properties: {
    currency: {
      type: 'object',
      additionalProperties: false,
      required: ['code', 'symbol', 'name'],
      properties: {
        code: { type: 'string' },
        symbol: { type: 'string' },
        name: { type: 'string' },
      },
    },
    costs: {
      type: 'object',
      additionalProperties: false,
      required: ['implementationCost', 'monthlyToolingCost'],
      properties: {
        implementationCost: { type: 'number', minimum: 0 },
        monthlyToolingCost: { type: 'number', minimum: 0 },
      },
    },
    labor: {
      type: 'object',
      additionalProperties: false,
      required: ['fullyLoadedHourlyCost', 'workWeeksPerYear'],
      properties: {
        fullyLoadedHourlyCost: { type: 'number', minimum: 1 },
        workWeeksPerYear: { type: 'number', minimum: 40, maximum: 52 },
      },
    },
    realizationFactor: { type: 'number', minimum: 0.5, maximum: 0.95 },
    profitMultiplier: { type: 'number', minimum: 1.8, maximum: 4.0 },
    workflowAssumptions: {
      type: 'array',
      minItems: 3,
      maxItems: 6,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'workflowName',
          'monthlyVolume',
          'minutesPerItemBefore',
          'minutesPerItemAfter',
          'exceptionRate',
          'exceptionMinutes',
          'adoption_low',
          'adoption_base',
          'adoption_high',
          'rationale',
          'fullyLoadedHourlyCostOverride',
          'rateSource',
          'rateSourceUrl',
          'seniorityLevel',
        ],
        properties: {
          workflowName: { type: 'string' },
          monthlyVolume: { type: 'number', minimum: 0 },
          minutesPerItemBefore: { type: 'number', minimum: 0 },
          minutesPerItemAfter: { type: 'number', minimum: 0 },
          exceptionRate: { type: 'number', minimum: 0, maximum: 1 },
          exceptionMinutes: { type: 'number', minimum: 0 },
          adoption_low: { type: 'number', minimum: 0, maximum: 1 },
          adoption_base: { type: 'number', minimum: 0, maximum: 1 },
          adoption_high: { type: 'number', minimum: 0, maximum: 1 },
          rationale: { type: 'string' },
          // Rule 6A: an hourly rate per workflow, backed by real evidence
          fullyLoadedHourlyCostOverride: { type: 'number', minimum: 1 },
          rateSource: { type: 'string' },
          rateSourceUrl: { type: ['string', 'null'] },
          seniorityLevel: { enum: ['junior', 'mid', 'senior'] },
        },
      },
    },
    rollout: {
      type: 'object',
      additionalProperties: false,
      required: ['timeToDeployWeeks', 'rampUpWeeks'],
      properties: {
        timeToDeployWeeks: { type: 'number', minimum: 0 },
        rampUpWeeks: { type: 'number', minimum: 0 },
      },
    },
    notes: {
      type: 'object',
      additionalProperties: false,
      required: ['assumptions'],
      properties: {
        assumptions: { type: 'array', items: { type: 'string' }, maxItems: 10 },
      },
    },
  },
} as const
