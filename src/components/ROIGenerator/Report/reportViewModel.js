import { CASE_STUDIES } from '@/src/lib/roi/pipeline/assembleReport'
import {
  buildReportModel,
  reconcilingAdoptionFactor,
} from '@/src/lib/roi/pipeline/reportModel'
import { fmtCurrency, fmtCurrencyShort, fmtNumber } from './format'

// Builds the object the report's sections draw themselves from. It depends only
// on the report itself. All the joining, matching and de-duplicating happens once
// in buildReportModel, which the PDF and the chat agent share. This file only
// reshapes that shared data into exactly what each section component expects.
export function buildReportViewModel(reportState) {
  const {
    company,
    globals,
    copy,
    calcOutput,
    normInput,
    confidenceLevel,
    assembled,
  } = reportState ?? {}

  if (!company || !globals || !reportState?.workflows || !copy || !calcOutput) {
    return null
  }

  const model = buildReportModel(reportState)
  const currency = globals.currency
  const summary = calcOutput.summary
  const merged = model.workflows
  const totalMonthlyHours = calcOutput.totalMonthlyHours
  const redirectionPct = Math.max(0, globals.profitMultiplier - 1)

  return {
    company,
    currency,
    currentDate: assembled?.current_date ?? '',
    recipientLine: recipientLine(normInput, assembled, company),
    confidence: confidenceMeta(confidenceLevel),
    hero: buildHero({
      summary,
      merged,
      totalMonthlyHours,
      currency,
      model,
      redirectionPct,
    }),
    similarCompanies: CASE_STUDIES,
    patternText: copy.unified_pattern_thesis,
    companySnapshot: model.companySnapshot.map((r) => ({
      text: r.text,
      status: r.label,
    })),
    workflows: buildWorkflows(merged, currency),
    workflowTotals: buildWorkflowTotals({
      merged,
      totalMonthlyHours,
      totalMonthlyValue: model.totals.monthlyValue,
      currency,
    }),
    levers: buildLevers(model.levers, currency, redirectionPct),
    leverTotal: buildLeverTotal({ model, summary, currency, redirectionPct }),
    odVsPu: buildOdVsPu(summary),
    outlook: buildOutlook(summary, currency),
    costOfDelay: buildCostOfDelay({ model, summary, copy, currency }),
    resilience: copy.resilience_rows ?? [],
    sources: model.sources.map((r) => ({
      input: r.input,
      detail: r.detail,
      sourceLabel: r.sourceLabel,
      sourceUrl: r.sourceUrl,
      status: r.status,
    })),
    risks: copy.risks ?? [],
    roadmap: buildRoadmap(model.topWorkflow),
    pilotRecommendation: copy.pilot_recommendation,
    ctaParagraph:
      copy.cta_paragraph ||
      `Let us show you how we can return ${fmtNumber(totalMonthlyHours)} hours to your team each month.`,
  }
}

function recipientLine(normInput, assembled, company) {
  if (normInput?.recipientName) {
    return normInput.recipientTitle
      ? `${normInput.recipientName}, ${normInput.recipientTitle}`
      : normInput.recipientName
  }
  return assembled?.recipient_email || company?.company || 'your team'
}

function confidenceMeta(confidenceLevel) {
  const level = confidenceLevel ?? 'low'
  return {
    label:
      level === 'high'
        ? 'Insight-Driven Analysis'
        : 'Hypothesis-Driven Projection',
    def:
      level === 'high'
        ? 'Grounded in specific research and data about your company — a high-confidence projection.'
        : 'Modeled from what you told us plus public benchmarks — a strong starting hypothesis to pressure-test in your validation session, not a guarantee.',
  }
}

function buildHero({
  summary,
  merged,
  totalMonthlyHours,
  currency,
  model,
  redirectionPct,
}) {
  const totalAnnualHours = summary.totalAnnualHours
  const ftes = (totalAnnualHours / 2080).toFixed(1)

  const hoursSteps = [
    merged
      .map((w) => `${Math.round(w.monthlyHours)} hrs/mo (${w.name})`)
      .join(' + ') + ` = ${fmtNumber(totalMonthlyHours)} hrs/mo`,
    `${fmtNumber(totalMonthlyHours)} × 12 = ${fmtNumber(totalAnnualHours)} hrs/yr`,
    `${fmtNumber(totalAnnualHours)} ÷ 2,080 standard work-year ≈ ${ftes} FTE`,
  ]

  const odSteps = merged
    .map((w) => {
      const deltaHrs = (w.timeSaved / 60).toFixed(2)
      return `${w.name}: ${fmtNumber(w.monthlyVolume)}/mo × ${deltaHrs} hrs × ${fmtCurrency(w.effectiveRate, currency)}/hr × ${reconcilingAdoptionFactor(
        w,
      ).toFixed(
        2,
      )} adoption ramp factor ≈ ${fmtCurrency(Math.round(w.monthlyHours * w.effectiveRate), currency)}/mo`
    })
    .concat([
      `Monthly total ${fmtCurrency(
        model.totals.monthlyValue,
        currency,
      )} × 12 = ${fmtCurrency(summary.operationalDividend12mo, currency)}/yr`,
    ])

  const upliftSteps = merged
    .map(
      (w) =>
        `${w.name}: ${fmtNumber(w.monthlyHours)} hrs/mo freed × ${fmtCurrency(w.effectiveRate, currency)}/hr × ${redirectionPct.toFixed(
          2,
        )} redirected = ${fmtCurrency(w.monthlyProfitUplift, currency)}/mo`,
    )
    .concat([
      `Annualized: ${fmtCurrency(summary.profitUplift12mo, currency)}/yr`,
    ])

  const revenueSub = revenueContextStatement(model.revenueContext)

  return {
    hours: {
      label: 'Hours Returned / Year',
      value: fmtNumber(totalAnnualHours),
      sub: `${fmtNumber(totalMonthlyHours)} hrs/month · ${ftes} FTE equiv.`,
      def: 'Total hours per year your team gets back when AI takes over repetitive, rules-based work across the workflows analyzed.',
      formula: 'Sum of hours saved/month across all workflows × 12',
      steps: hoursSteps,
      result: `${fmtNumber(totalAnnualHours)} hrs/year`,
    },
    od: {
      label: 'Operational Dividend',
      value: fmtCurrencyShort(summary.operationalDividend12mo, currency),
      sub: 'Labor value recaptured',
      def: 'Dollar value of freed hours at your blended labor rate — the most direct, measurable return, available from day one.',
      formula: 'Σ (Volume × Δhrs × Rate × adoption ramp factor), × 12',
      steps: odSteps,
      result: `${fmtCurrency(summary.operationalDividend12mo, currency)}/year`,
    },
    uplift: {
      label: 'Profit Uplift',
      value: fmtCurrencyShort(summary.profitUplift12mo, currency),
      sub: 'Redirected capacity gains',
      def: 'Additional profit created when freed hours get redirected into higher-value work — not just saved, but re-invested.',
      formula: 'Σ (hrs freed × rate × redirect multiplier), × 12',
      steps: upliftSteps,
      result: `${fmtCurrency(summary.profitUplift12mo, currency)}/year`,
    },
    total: {
      label: 'Total Financial Gain',
      value: fmtCurrencyShort(summary.totalFinancialGain12mo, currency),
      sub: revenueSub,
      def: 'Operational Dividend + Profit Uplift. The full annual value this automation plan is projected to unlock.',
      formula: 'Operational Dividend + Profit Uplift',
      steps: [
        `${fmtCurrency(summary.operationalDividend12mo, currency)} + ${fmtCurrency(
          summary.profitUplift12mo,
          currency,
        )} = ${fmtCurrency(summary.totalFinancialGain12mo, currency)}/yr`,
      ],
      result: `${fmtCurrency(summary.totalFinancialGain12mo, currency)}/year`,
    },
  }
}

function revenueContextStatement(rc) {
  if (rc.base > 0 && rc.pct <= 500) {
    return `~${rc.pct}% of estimated annual revenue returned without adding headcount.`
  }
  if (!rc.known) {
    return 'Annual revenue was not provided — shown as an absolute dollar figure.'
  }
  return 'Operational Dividend + Profit Uplift, full annual value.'
}

function workflowStatusMeta(sourceType, userValidated) {
  if (userValidated) return 'Validated'
  if (sourceType === 'user_stated') return 'Provided'
  if (sourceType === 'research_derived') return 'Scraped'
  return 'Benchmarked'
}

function buildWorkflows(merged, currency) {
  return merged.map((w) => {
    const beforeHrs = w.minutesPerItemBefore / 60
    const afterHrs = w.minutesPerItemAfter / 60
    const monthlyValue = Math.round(w.monthlyHours * w.effectiveRate)
    return {
      name: w.name,
      agent: w.agentName,
      before: beforeHrs,
      after: afterHrs,
      afterPct: Math.max(6, Math.round((afterHrs / (beforeHrs || 1)) * 100)),
      hrsSaved: Math.round(w.monthlyHours),
      valueLabel: fmtCurrency(monthlyValue, currency),
      status: workflowStatusMeta(w.sourceType, w.userValidated),
      role: w.owner || w.agentName,
      targetOutcome: w.expectedOutcome,
      whyFits: w.whyItMatters,
      formula: `${fmtNumber(w.monthlyVolume)}/mo × ${(beforeHrs - afterHrs).toFixed(2)} hrs × ${fmtCurrency(
        w.effectiveRate,
        currency,
      )}/hr × ${reconcilingAdoptionFactor(w).toFixed(2)} adoption ramp factor = ${fmtCurrency(monthlyValue, currency)}/mo`,
    }
  })
}

function buildWorkflowTotals({
  merged,
  totalMonthlyHours,
  totalMonthlyValue,
  currency,
}) {
  return {
    hrs: `${fmtNumber(totalMonthlyHours)} hrs/mo`,
    monthlyValue: `${fmtCurrency(totalMonthlyValue, currency)}/mo`,
    formula: 'Sum of hours saved and value recaptured across all workflows',
    steps: [
      `Hours: ${merged.map((w) => Math.round(w.monthlyHours)).join(' + ')} = ${fmtNumber(totalMonthlyHours)} hrs/mo`,
      `Value: ${merged.map((w) => fmtCurrency(Math.round(w.monthlyHours * w.effectiveRate), currency)).join(' + ')} = ${fmtCurrency(
        totalMonthlyValue,
        currency,
      )}/mo`,
    ],
    result: `${fmtNumber(totalMonthlyHours)} hrs/mo · ${fmtCurrency(totalMonthlyValue, currency)}/mo`,
  }
}

function buildLevers(levers, currency, redirectionPct) {
  return levers.map((l) => {
    const wf = l.matchedWorkflow
    const arithmetic = wf
      ? `${fmtNumber(Math.round(wf.monthlyHours))} hrs/mo freed × ${fmtCurrency(wf.effectiveRate, currency)}/hr × ${redirectionPct.toFixed(
          2,
        )} redirected = ${fmtCurrency(l.monthlyProfitUplift, currency)}/mo`
      : (l.rationale_with_arithmetic ?? l.rationale ?? '')
    return {
      name: l.lever_name,
      derivedFrom: l.derived_from,
      baseline: l.baseline_data,
      aiAction: l.ai_agent_action,
      arithmetic,
      valueLabel: wf
        ? `${fmtCurrency(l.monthlyProfitUplift, currency)}/mo`
        : '',
    }
  })
}

function buildLeverTotal({ model, summary, currency, redirectionPct }) {
  const monthlyTotal = model.levers.reduce(
    (acc, l) => acc + (l.monthlyProfitUplift ?? 0),
    0,
  )
  return {
    value: fmtCurrency(summary.profitUplift12mo, currency),
    formula: `Σ (hrs freed × rate × ${redirectionPct.toFixed(2)} redirected), × 12`,
    steps: [
      `Monthly total: ${fmtCurrency(monthlyTotal, currency)}/mo`,
      `Annualized: ${fmtCurrency(summary.profitUplift12mo, currency)}/yr`,
    ],
    result: `${fmtCurrency(summary.profitUplift12mo, currency)}/year`,
  }
}

function buildOdVsPu(summary) {
  const od = summary.operationalDividend12mo
  const pu = summary.profitUplift12mo
  const total = od + pu || 1
  return {
    od,
    pu,
    odPct: `${Math.round((od / total) * 100)}%`,
    upliftPct: `${100 - Math.round((od / total) * 100)}%`,
  }
}

function buildOutlook(summary, currency) {
  const years = [
    {
      key: 'year1',
      year: 'Year 1',
      od: summary.operationalDividend12mo,
      pu: summary.profitUplift12mo,
      total: summary.totalFinancialGain12mo,
    },
    {
      key: 'year2',
      year: 'Through Year 2',
      od: summary.operationalDividend24mo,
      pu: summary.profitUplift24mo,
      total: summary.totalFinancialGain24mo,
    },
    {
      key: 'year3',
      year: 'Through Year 3',
      od: summary.operationalDividend36mo,
      pu: summary.profitUplift36mo,
      total: summary.totalFinancialGain36mo,
    },
  ]
  const maxTotal = Math.max(...years.map((y) => y.total), 1)
  const tf12 = summary.totalFinancialGain12mo || 1
  const growth24 = summary.totalFinancialGain24mo / tf12
  const growth36 = summary.totalFinancialGain36mo / tf12

  const out = {}
  years.forEach((y, i) => {
    out[y.key] = {
      year: y.year,
      total: fmtCurrency(y.total, currency),
      // A height in pixels rather than a percentage, so the bar draws correctly
      // however deeply it is nested inside the button. A percentage height needs
      // every container above it to have a fixed height, and a general-purpose
      // button or pop-up wrapper does not guarantee that.
      heightPx: Math.max(6, Math.round((y.total / maxTotal) * 140)),
      odShare: y.od,
      upliftShare: y.pu,
      formula:
        i === 0
          ? 'Operational Dividend + Profit Uplift, Year 1'
          : `Year 1 figures × ${(i === 1 ? growth24 : growth36).toFixed(2)}× growth factor (ramp-up + process maturity)`,
      steps:
        i === 0
          ? [
              `Operational Dividend: ${fmtCurrency(y.od, currency)}`,
              `Profit Uplift: ${fmtCurrency(y.pu, currency)}`,
              `Hours returned: ${fmtNumber(summary.totalAnnualHours)}`,
            ]
          : [
              `${fmtCurrency(summary.operationalDividend12mo, currency)} × ${(i === 1 ? growth24 : growth36).toFixed(2)} = ${fmtCurrency(
                y.od,
                currency,
              )}`,
              `${fmtCurrency(summary.profitUplift12mo, currency)} × ${(i === 1 ? growth24 : growth36).toFixed(2)} = ${fmtCurrency(
                y.pu,
                currency,
              )}`,
            ],
      result: `${fmtCurrency(y.total, currency)} ${i === 0 ? 'total financial gain' : 'cumulative'}`,
    }
  })
  return out
}

function buildCostOfDelay({ model, summary, copy, currency }) {
  const monthly = model.costOfDelayMonthly
  const narrative =
    copy.cost_of_delay?.narrative ??
    `Every month without automation costs your team the equivalent of ${fmtCurrency(monthly, currency)} in recoverable value. Delay is not neutral — it carries a monthly price.`
  return {
    value: fmtCurrency(monthly, currency),
    narrative,
    formula: 'Year 1 Total Financial Gain ÷ 12 months',
    steps: [
      `${fmtCurrency(summary.totalFinancialGain12mo, currency)} ÷ 12 ≈ ${fmtCurrency(monthly, currency)}/mo`,
    ],
    result: `${fmtCurrency(monthly, currency)}/month`,
  }
}

function buildRoadmap(topWorkflow) {
  const pilotName = topWorkflow?.name ?? 'the top workflow'
  return [
    {
      weeks: 'Weeks 1–2',
      phase: 'Rapid Discovery & Validation',
      activities: `Validate workflow volumes and task times for ${pilotName}; confirm data access and integration scope; agree pilot selection.`,
    },
    {
      weeks: 'Weeks 3–6',
      phase: 'Pilot Build & Testing',
      activities: `Deploy AI agent for ${pilotName}; QA and calibration cycles; weekly accuracy reports; human review gates active throughout.`,
    },
    {
      weeks: 'Weeks 7–8',
      phase: 'Controlled Go-Live',
      activities:
        'Full pilot rollout on approved workflows; performance instrumentation live; weekly dashboard; anomaly escalation active.',
    },
    {
      weeks: 'Weeks 9–10',
      phase: 'ROI Validation & Expansion',
      activities:
        'Measure actual hours returned vs. modelled; calculate realised Operational Dividend; present Phase 2 roadmap.',
    },
  ]
}
