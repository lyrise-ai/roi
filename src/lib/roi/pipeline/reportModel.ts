// ─────────────────────────────────────────────────────────────────────────────
// reportModel — the single source of truth for report content shared by the
// PDF (assembleReport.ts), the live web report (reportViewModel.js), the
// chat agent (agent.ts), and the validation wizard (OverviewStep.jsx).
// Pure, no HTML, no formatting — raw numbers/strings only. Each consumer
// formats/renders this however it needs; the numbers themselves never diverge.
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

// Suppresses LLM-authored snapshot bullets that just restate a form-provided
// fact (the writer prompt asks it to skip these, but it doesn't always
// comply) — was independently duplicated byte-for-byte in assembleReport.ts
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
      /\b(annual\s+)?revenue\b|\bgenerates?\b.*\$|\bannually\b/.test(t)),
  )
}

// Joins calcOutput.workflows with their WorkflowInput by name, sorted desc by
// annualValue — the ONE definition of "the top/pilot workflow" used
// everywhere (PDF, web, chat, validation wizard). Exported standalone (not
// just via buildReportModel) because the validation wizard only has
// `workflows` + `calcOutput` in scope, not the full ReportState.
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

// The reconciling ramp factor (bundles adoption + realization + revenue-band
// scaling into one multiplier) so worked-example arithmetic always ties out
// to the displayed value — the one canonical formula instead of 3 diverging
// ones (PDF's calculation panel, web's non-reconciling adoption%, and the
// validation wizard's formula which omitted it entirely).
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

  // Per-lever match (derived_from -> workflow name, case-insensitive, then
  // positional fallback) + deterministic arithmetic inputs. This intentionally
  // overrides whatever the LLM wrote so every lever always reconciles with
  // the calculator's PU total (see ProfitLever.rationale_with_arithmetic).
  // Redirection % itself is just `globals.profitMultiplier - 1`, cheap enough
  // for adapters to compute inline rather than carry in the model.
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

  // Worked example / "how this is calculated" for the top workflow.
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
  // Only used for the handful of prose strings below that embed a currency
  // amount mid-sentence — currency symbol selection is itself already the
  // one shared implementation (format.ts), so reusing it here doesn't
  // reintroduce duplication; it's not general number/short-form formatting.
  const sym = currencySymbolFor(globals.currency)

  // Company snapshot — form-provided facts (highest confidence) first, then
  // LLM-authored bullets with redundant ones suppressed.
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

  // Sources / provenance rows — shared by PDF's Data Provenance table and
  // (as of this change) the web report's Sources section, so both surfaces
  // show the same evidence links/labels instead of web being a stripped-down
  // copy.
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
