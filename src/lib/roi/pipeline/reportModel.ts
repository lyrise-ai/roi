// ─────────────────────────────────────────────────────────────────────────────
// reportModel — the one definition of what the report says. Four things read
// it: the PDF (assembleReport.ts), the web report (reportViewModel.js), the
// chat agent (agent.ts) and the check-it-over wizard (OverviewStep.jsx).
//
// Plain data only. No HTML, no formatting, just raw numbers and strings. Each
// of the four displays it however it needs to. The numbers themselves can never
// disagree, because there is only one copy of them.
// ─────────────────────────────────────────────────────────────────────────────

import { currencySymbolFor } from '@/src/lib/roi/format'
import type {
  ReportState,
  WorkflowInput,
  WorkflowCalc,
  ProfitLever,
} from '@/src/lib/roi/types'

export type MergedWorkflow = WorkflowInput & WorkflowCalc

export interface LeverModel extends ProfitLever {
  matchedWorkflow: MergedWorkflow | null
  monthlyProfitUplift: number | null
}

export interface WorkedExample {
  workflow: MergedWorkflow | null
  baselineMonthly: number
  monthlyValue: number
  adoptionFactor: number
  totalMonthlyValue: number
}

export interface SourceRow {
  input: string
  detail: string
  sourceLabel: string
  sourceUrl: string | null
  status: 'Validated' | 'Needs validation' | 'Industry standard' | 'Unknown'
}

export interface SnapshotRow {
  text: string
  tier: 'scraped' | 'benchmarked' | 'assumed' // -> badge CSS class in PDF, badge color in web
  label: string // exact visible badge text, e.g. "Provided", "Scraped — LinkedIn", "Unknown"
}

export interface ReportModel {
  workflows: MergedWorkflow[] // sorted desc by annualValue — [0] is the top/pilot workflow
  topWorkflow: MergedWorkflow | null
  totals: {
    monthlyHours: number
    monthlyCost: number
    monthlyValue: number
    hrsBefore: number
    hrsAfter: number
  }
  levers: LeverModel[]
  workedExample: WorkedExample
  revenueContext: { base: number; pct: number; known: boolean }
  costOfDelayMonthly: number
  companySnapshot: SnapshotRow[]
  sources: SourceRow[]
}

// Drops model-written bullet points that just repeat something the user already
// typed on the form. The prompt asks the model not to write those, but it does
// it anyway. This used to exist as two identical copies, in assembleReport.ts
// and reportViewModel.js.
function isRedundantSnapshotText(
  text: string,
  teamSizeFromForm: string,
  revenueRangeFromForm: string,
): boolean {
  const t = text.toLowerCase()
  return Boolean(
    (teamSizeFromForm && /\b\d[\d,]*\s*(employees?|people|staff)\b/.test(t)) ||
    (revenueRangeFromForm &&
      // A list of fixed words with no nesting. The `.*` has nothing to fall
      // back into, so this runs in a straight line rather than blowing up on
      // certain input.
      /\b(annual\s+)?revenue\b|\bgenerates?\b.*\$|\bannually\b/.test(t)),
  )
}

// Matches each calculated workflow back to the workflow it came from, by name,
// and sorts them by yearly value, biggest first. This is the ONE definition of
// "the top workflow" used by the PDF, the web report, the chat agent and the
// wizard. It is exported on its own, not only through buildReportModel, because
// the wizard only has the workflows and the calculated figures to hand, not the
// whole report object.
export function mergeWorkflows(
  workflowInputs: WorkflowInput[],
  calcWorkflows: WorkflowCalc[],
): MergedWorkflow[] {
  return [...calcWorkflows]
    .sort((a, b) => b.annualValue - a.annualValue)
    .map((calc) => {
      const inp =
        workflowInputs.find((w) => w.name === calc.name) ?? workflowInputs[0]
      return { ...inp, ...calc }
    })
}

// Rolls take-up, realisation and any revenue-band scaling into a single
// multiplier, so the worked example on the page always adds up to the value
// shown beside it. There is one formula here now. There used to be three that
// disagreed: the PDF's panel, the web report's take-up percentage that did not
// add up, and the wizard's version, which left this out completely.
export function reconcilingAdoptionFactor(w: MergedWorkflow): number {
  const baseline = w.monthlyVolume * (w.timeSaved / 60) * w.effectiveRate
  const value = Math.round(w.monthlyHours * w.effectiveRate)
  return baseline > 0 ? value / baseline : 1
}

export function buildReportModel(state: ReportState): ReportModel {
  const { company, globals, workflows, copy, calcOutput, normInput } = state
  if (!calcOutput || !copy || !workflows || !globals || !company) {
    throw new Error('buildReportModel: missing required state fields')
  }

  const merged = mergeWorkflows(workflows, calcOutput.workflows)
  const topWorkflow = merged[0] ?? null

  const totals = {
    monthlyHours: merged.reduce((a, w) => a + w.monthlyHours, 0),
    monthlyCost: merged.reduce((a, w) => a + w.monthlyCost, 0),
    monthlyValue: merged.reduce(
      (a, w) => a + Math.round(w.monthlyHours * w.effectiveRate),
      0,
    ),
    hrsBefore: merged.reduce(
      (a, w) => a + Math.round((w.monthlyVolume * w.minutesPerItemBefore) / 60),
      0,
    ),
    hrsAfter: merged.reduce(
      (a, w) => a + Math.round((w.monthlyVolume * w.minutesPerItemAfter) / 60),
      0,
    ),
  }

  // Match each profit lever to its workflow: by name, ignoring capitalisation,
  // and falling back to position if the name does not match. Then attach the
  // numbers for its sum, worked out here in code.
  //
  // This deliberately overwrites whatever the model wrote, so every lever adds
  // up to the calculator's own profit uplift total (see
  // ProfitLever.rationale_with_arithmetic).
  //
  // The redirection percentage is just the profit multiplier minus one — cheap
  // enough for each display to work out itself rather than carry here.
  const levers: LeverModel[] = (copy.profit_levers ?? []).map((l, i) => {
    const wf =
      merged.find(
        (w) => w.name.toLowerCase() === (l.derived_from ?? '').toLowerCase(),
      ) ??
      merged[i] ??
      null
    return {
      ...l,
      matchedWorkflow: wf,
      monthlyProfitUplift: wf ? wf.monthlyProfitUplift : null,
    }
  })

  // The worked example — "here is how we got this number" — for the top
  // workflow.
  const baselineMonthly = topWorkflow
    ? topWorkflow.monthlyVolume *
      (topWorkflow.timeSaved / 60) *
      topWorkflow.effectiveRate
    : 0
  const workedExampleMonthlyValue = topWorkflow
    ? Math.round(topWorkflow.monthlyHours * topWorkflow.effectiveRate)
    : 0
  const workedExample: WorkedExample = {
    workflow: topWorkflow,
    baselineMonthly,
    monthlyValue: workedExampleMonthlyValue,
    adoptionFactor: topWorkflow ? reconcilingAdoptionFactor(topWorkflow) : 1,
    totalMonthlyValue: totals.monthlyValue,
  }

  const tf12 = calcOutput.summary.totalFinancialGain12mo
  const revenueBase =
    (company.revenueEstimateM ?? 0) > 0
      ? company.revenueEstimateM! * 1_000_000
      : 0
  const revenueContext = {
    base: revenueBase,
    pct: revenueBase > 0 ? Math.round((tf12 / revenueBase) * 100) : 0,
    known: revenueBase > 0 || (normInput?.revenueRange ?? '').trim().length > 0,
  }

  const costOfDelayMonthly = Math.round(tf12 / 12)
  // Only used for the few sentences below that have a money amount inside
  // them. Choosing the currency symbol is already a single shared function
  // (format.ts), so calling it here does not create a second copy of anything.
  // This is not general number formatting.
  const sym = currencySymbolFor(globals.currency)

  // The company summary. Facts the user typed come first, because we trust
  // those most, then the model's bullets with the repetitive ones removed.
  const teamSizeFromForm = (normInput?.teamSize ?? '').trim()
  const revenueRangeFromForm = (normInput?.revenueRange ?? '').trim()
  const countryFromForm = (normInput?.country ?? '').trim()
  const companySnapshot: SnapshotRow[] = []
  if (company.employees) {
    companySnapshot.push({
      text: `${company.employees.toLocaleString()} employees`,
      tier: 'scraped',
      label: teamSizeFromForm ? 'Provided' : 'Scraped — LinkedIn',
    })
  }
  if (revenueRangeFromForm) {
    companySnapshot.push({
      text: `Annual revenue ${revenueRangeFromForm}`,
      tier: 'scraped',
      label: 'Provided',
    })
  } else if (company.revenueEstimateM) {
    companySnapshot.push({
      text: `Revenue estimated ${sym}${company.revenueEstimateM}M annually`,
      tier: 'benchmarked',
      label: 'Benchmarked',
    })
  } else {
    companySnapshot.push({
      text: 'Annual revenue — not provided',
      tier: 'assumed',
      label: 'Unknown',
    })
  }
  if (countryFromForm) {
    companySnapshot.push({
      text: `Country: ${countryFromForm}`,
      tier: 'scraped',
      label: 'Provided',
    })
  } else if (company.country) {
    companySnapshot.push({
      text: `Country: ${company.country}`,
      tier: 'scraped',
      label: 'Scraped',
    })
  }
  const TIER_LABEL = {
    scraped: 'Scraped',
    benchmarked: 'Benchmarked',
    assumed: 'Assumed',
  } as const
  ;(copy.company_snapshot ?? []).forEach((item) => {
    if (
      isRedundantSnapshotText(
        item.text ?? '',
        teamSizeFromForm,
        revenueRangeFromForm,
      )
    )
      return
    companySnapshot.push({
      text: item.text,
      tier: item.sourceType,
      label: TIER_LABEL[item.sourceType],
    })
  })

  // The source rows. The PDF's sources table and the web report's sources
  // section both read these, so the two show the same links and labels. The web
  // version used to be a cut-down copy.
  const sources: SourceRow[] = []
  if (revenueRangeFromForm) {
    sources.push({
      input: 'Annual revenue anchor',
      detail: revenueRangeFromForm,
      sourceLabel: 'Provided',
      sourceUrl: null,
      status: 'Validated',
    })
  } else if (company.revenueEstimateM) {
    sources.push({
      input: 'Annual revenue anchor',
      detail: `${sym}${company.revenueEstimateM}M estimated`,
      sourceLabel: 'Benchmarked',
      sourceUrl: null,
      status: 'Needs validation',
    })
  } else {
    sources.push({
      input: 'Annual revenue anchor',
      detail: 'Not provided',
      sourceLabel: '—',
      sourceUrl: null,
      status: 'Unknown',
    })
  }
  if (company.employees) {
    sources.push({
      input: 'Headcount',
      detail: `${company.employees.toLocaleString()} employees`,
      sourceLabel: teamSizeFromForm
        ? 'Provided'
        : 'Scraped — LinkedIn / Apollo',
      sourceUrl: null,
      status: 'Validated',
    })
  }
  if (countryFromForm) {
    sources.push({
      input: 'Country',
      detail: countryFromForm,
      sourceLabel: 'Provided',
      sourceUrl: null,
      status: 'Validated',
    })
  } else if (company.country) {
    sources.push({
      input: 'Country',
      detail: company.country,
      sourceLabel: 'Scraped',
      sourceUrl: null,
      status: 'Validated',
    })
  }
  workflows.forEach((wf) => {
    const calc = calcOutput.workflows.find((c) => c.name === wf.name)
    const isFallback =
      !wf.rateSource ||
      wf.rateSource === 'benchmark_fallback' ||
      wf.rateSource === 'assumed'
    const safeUrl =
      wf.rateSourceUrl && /^https?:\/\//i.test(wf.rateSourceUrl)
        ? wf.rateSourceUrl
        : null
    sources.push({
      input: `${wf.name} — blended rate`,
      detail: `${sym}${calc?.effectiveRate ?? globals.laborRate}/hr${
        wf.seniorityLevel ? ` (${wf.seniorityLevel})` : ''
      }`,
      sourceLabel: isFallback
        ? 'Benchmarked'
        : `Scraped — ${wf.rateSource ?? ''}`,
      sourceUrl: isFallback ? null : safeUrl,
      status: isFallback ? 'Needs validation' : 'Validated',
    })
    sources.push({
      input: `${wf.name} — monthly volume`,
      detail: `${wf.monthlyVolume}/mo estimated`,
      sourceLabel:
        wf.sourceType === 'user_stated'
          ? 'User-stated'
          : wf.sourceType === 'research_derived'
            ? 'Scraped'
            : 'Benchmarked',
      sourceUrl: null,
      status:
        wf.sourceType === 'user_stated' ? 'Validated' : 'Needs validation',
    })
  })
  if (calcOutput.workflows.length > 0) {
    sources.push({
      input: 'Automation time reduction %',
      detail: calcOutput.workflows
        .map((w) => `${w.savingsPct}% — ${w.name}`)
        .join('; '),
      sourceLabel: 'Benchmarked — LyRise + McKinsey 2023',
      sourceUrl: null,
      status: 'Industry standard',
    })
  }
  ;(copy.profit_levers ?? []).forEach((l) => {
    sources.push({
      input: `Profit lever — ${l.lever_name}`,
      detail: l.baseline_data,
      sourceLabel: 'Benchmarked',
      sourceUrl: null,
      status: 'Needs validation',
    })
  })

  return {
    workflows: merged,
    topWorkflow,
    totals,
    levers,
    workedExample,
    revenueContext,
    costOfDelayMonthly,
    companySnapshot,
    sources,
  }
}
