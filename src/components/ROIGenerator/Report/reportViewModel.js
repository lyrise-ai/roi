import { CASE_STUDIES } from '@/src/lib/roi/pipeline/assembleReport'
import { fmtCurrency, fmtCurrencyShort, fmtNumber } from './format'

// Builds the fully-shaped view model the report sections render from. Pure
// function of `reportState` (the live ReportState object, which is already
// fully computed server-side — see reportViewModel's sibling formulas against
// src/lib/roi/pipeline/assembleReport.ts, which this intentionally mirrors so
// the numbers shown here always reconcile with the calculator/PDF).
export function buildReportViewModel(reportState) {
  const {
    company,
    globals,
    workflows: workflowInputs,
    copy,
    calcOutput,
    normInput,
    confidenceLevel,
    assembled,
  } = reportState ?? {}

  if (!company || !globals || !workflowInputs || !copy || !calcOutput) {
    return null
  }

  const currency = globals.currency
  const summary = calcOutput.summary

  // Merge WorkflowInput + WorkflowCalc, sorted desc by annual value — mirrors
  // assembleReport.ts's `merged` so "the top workflow" means the same thing
  // everywhere (roadmap pilot pick, calculation worked-example, etc).
  const merged = [...calcOutput.workflows]
    .sort((a, b) => b.annualValue - a.annualValue)
    .map((calc) => ({
      ...(workflowInputs.find((w) => w.name === calc.name) ??
        workflowInputs[0]),
      ...calc,
    }))

  const totalMonthlyHours = calcOutput.totalMonthlyHours
  const totalMonthlyValue = merged.reduce(
    (a, w) => a + Math.round(w.monthlyHours * w.effectiveRate),
    0,
  )

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
      company,
      normInput,
      globals,
    }),
    similarCompanies: CASE_STUDIES,
    patternText: copy.unified_pattern_thesis,
    companySnapshot: buildCompanySnapshot({ company, copy, normInput }),
    workflows: buildWorkflows(merged, currency),
    workflowTotals: buildWorkflowTotals({
      merged,
      totalMonthlyHours,
      totalMonthlyValue,
      currency,
    }),
    levers: buildLevers({ copy, merged, globals, currency }),
    leverTotal: buildLeverTotal({ copy, merged, globals, summary, currency }),
    odVsPu: buildOdVsPu(summary),
    outlook: buildOutlook(summary, currency),
    costOfDelay: buildCostOfDelay({ summary, copy, currency }),
    resilience: copy.resilience_rows ?? [],
    sources: buildSources({
      company,
      workflowInputs,
      calcOutput,
      copy,
      globals,
      normInput,
      currency,
    }),
    risks: copy.risks ?? [],
    roadmap: buildRoadmap(merged),
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
  company,
  normInput,
  globals,
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
      const deltaHrs = (
        (w.minutesPerItemBefore - w.minutesPerItemAfter) /
        60
      ).toFixed(2)
      return `${w.name}: ${fmtNumber(w.monthlyVolume)}/mo × ${deltaHrs} hrs × ${fmtCurrency(w.effectiveRate, currency)}/hr × ${Math.round(
        w.adoptionRate * 100,
      )}% adoption ≈ ${fmtCurrency(Math.round(w.monthlyHours * w.effectiveRate), currency)}/mo`
    })
    .concat([
      `Monthly total ${fmtCurrency(
        merged.reduce(
          (a, w) => a + Math.round(w.monthlyHours * w.effectiveRate),
          0,
        ),
        currency,
      )} × 12 = ${fmtCurrency(summary.operationalDividend12mo, currency)}/yr`,
    ])

  const redirectionPct = Math.max(0, globals.profitMultiplier - 1)
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

  const revenueSub = revenueContextStatement({
    company,
    normInput,
    tf12: summary.totalFinancialGain12mo,
  })

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
      formula: 'Σ (Volume × Δhrs × Rate × adoption), × 12',
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

function revenueContextStatement({ company, normInput, tf12 }) {
  const revenueBase =
    (company?.revenueEstimateM ?? 0) > 0
      ? company.revenueEstimateM * 1_000_000
      : 0
  const revPct = revenueBase > 0 ? Math.round((tf12 / revenueBase) * 100) : 0
  const revenueRangeKnown = (normInput?.revenueRange ?? '').trim().length > 0
  if (revenueBase > 0 && revPct <= 500) {
    return `~${revPct}% of estimated annual revenue returned without adding headcount.`
  }
  if (!revenueRangeKnown && revenueBase === 0) {
    return 'Annual revenue was not provided — shown as an absolute dollar figure.'
  }
  return 'Operational Dividend + Profit Uplift, full annual value.'
}

function buildCompanySnapshot({ company, copy, normInput }) {
  const rows = []
  const teamSizeFromForm = (normInput?.teamSize ?? '').trim()
  const revenueRangeFromForm = (normInput?.revenueRange ?? '').trim()
  const countryFromForm = (normInput?.country ?? '').trim()

  if (company?.employees) {
    rows.push({
      text: `${fmtNumber(company.employees)} employees`,
      status: teamSizeFromForm ? 'Provided' : 'Scraped',
    })
  }
  if (revenueRangeFromForm) {
    rows.push({
      text: `Annual revenue ${revenueRangeFromForm}`,
      status: 'Provided',
    })
  } else if (company?.revenueEstimateM) {
    rows.push({
      text: `Revenue estimated $${company.revenueEstimateM}M annually`,
      status: 'Benchmarked',
    })
  }
  if (countryFromForm) {
    rows.push({ text: `Country: ${countryFromForm}`, status: 'Provided' })
  } else if (company?.country) {
    rows.push({ text: `Country: ${company.country}`, status: 'Scraped' })
  }

  const isRedundant = (text) => {
    const t = text.toLowerCase()
    return (
      (teamSizeFromForm &&
        /\b\d[\d,]*\s*(employees?|people|staff)\b/.test(t)) ||
      (revenueRangeFromForm &&
        /\b(annual\s+)?revenue\b|\bgenerates?\b.*\$|\bannually\b/.test(t))
    )
  }
  ;(copy.company_snapshot ?? []).forEach((item) => {
    if (isRedundant(item.text ?? '')) return
    const status =
      item.sourceType === 'scraped'
        ? 'Scraped'
        : item.sourceType === 'benchmarked'
          ? 'Benchmarked'
          : 'Assumed'
    rows.push({ text: item.text, status })
  })

  return rows
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
      )}/hr × ${Math.round(w.adoptionRate * 100)}% adoption = ${fmtCurrency(monthlyValue, currency)}/mo`,
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

// Matches a profit lever to the workflow it's derived from (by name, falling
// back to positional index — mirrors assembleReport.ts's leverArithmetic).
function matchWorkflowForLever(lever, merged, index) {
  return (
    merged.find(
      (w) => w.name.toLowerCase() === (lever.derived_from ?? '').toLowerCase(),
    ) ??
    merged[index] ??
    null
  )
}

function buildLevers({ copy, merged, globals, currency }) {
  const redirectionPct = Math.max(0, globals.profitMultiplier - 1)
  return (copy.profit_levers ?? []).map((lever, i) => {
    const wf = matchWorkflowForLever(lever, merged, i)
    const arithmetic = wf
      ? `${fmtNumber(Math.round(wf.monthlyHours))} hrs/mo freed × ${fmtCurrency(wf.effectiveRate, currency)}/hr × ${redirectionPct.toFixed(
          2,
        )} redirected = ${fmtCurrency(wf.monthlyProfitUplift, currency)}/mo`
      : (lever.rationale_with_arithmetic ?? lever.rationale ?? '')
    return {
      name: lever.lever_name,
      derivedFrom: lever.derived_from,
      baseline: lever.baseline_data,
      aiAction: lever.ai_agent_action,
      arithmetic,
      valueLabel: wf
        ? `${fmtCurrency(wf.monthlyProfitUplift, currency)}/mo`
        : '',
    }
  })
}

function buildLeverTotal({ copy, merged, globals, summary, currency }) {
  const redirectionPct = Math.max(0, globals.profitMultiplier - 1)
  const monthlyTotal = (copy.profit_levers ?? []).reduce((acc, lever, i) => {
    const wf = matchWorkflowForLever(lever, merged, i)
    return acc + (wf?.monthlyProfitUplift ?? 0)
  }, 0)
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
      // A pixel height (not a CSS percentage) so the bar renders correctly
      // regardless of how deeply it's nested inside the clickable trigger —
      // percentage heights need every ancestor to have a definite height,
      // which a generic button/popover wrapper doesn't guarantee.
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

function buildCostOfDelay({ summary, copy, currency }) {
  const monthly = Math.round(summary.totalFinancialGain12mo / 12)
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

function buildSources({
  company,
  workflowInputs,
  calcOutput,
  copy,
  globals,
  normInput,
  currency,
}) {
  const rows = []
  const revenueRangeFromForm = (normInput?.revenueRange ?? '').trim()
  const teamSizeFromForm = (normInput?.teamSize ?? '').trim()
  const countryFromForm = (normInput?.country ?? '').trim()

  if (revenueRangeFromForm) {
    rows.push({
      input: 'Annual revenue anchor',
      detail: revenueRangeFromForm,
      sourceLabel: 'Provided',
      status: 'Validated',
    })
  } else if (company?.revenueEstimateM) {
    rows.push({
      input: 'Annual revenue anchor',
      detail: `${fmtCurrency(company.revenueEstimateM, currency)}M estimated`,
      sourceLabel: 'Benchmarked',
      status: 'Needs validation',
    })
  }
  if (company?.employees) {
    rows.push({
      input: 'Headcount',
      detail: `${fmtNumber(company.employees)} employees`,
      sourceLabel: teamSizeFromForm ? 'Provided' : 'Scraped',
      status: 'Validated',
    })
  }
  if (countryFromForm) {
    rows.push({
      input: 'Country',
      detail: countryFromForm,
      sourceLabel: 'Provided',
      status: 'Validated',
    })
  } else if (company?.country) {
    rows.push({
      input: 'Country',
      detail: company.country,
      sourceLabel: 'Scraped',
      status: 'Validated',
    })
  }

  ;(workflowInputs ?? []).forEach((wf) => {
    const calc = calcOutput.workflows.find((c) => c.name === wf.name)
    const isFallback =
      !wf.rateSource ||
      wf.rateSource === 'benchmark_fallback' ||
      wf.rateSource === 'assumed'
    rows.push({
      input: `${wf.name} — blended rate`,
      detail: `${fmtCurrency(calc?.effectiveRate ?? globals.laborRate, currency)}/hr${wf.seniorityLevel ? ` (${wf.seniorityLevel})` : ''}`,
      sourceLabel: isFallback ? 'Benchmarked' : (wf.rateSource ?? 'Scraped'),
      status: isFallback ? 'Needs validation' : 'Validated',
    })
    rows.push({
      input: `${wf.name} — monthly volume`,
      detail: `${fmtNumber(wf.monthlyVolume)}/mo estimated`,
      sourceLabel: workflowStatusMeta(wf.sourceType, wf.userValidated),
      status:
        wf.userValidated || wf.sourceType === 'user_stated'
          ? 'Validated'
          : 'Needs validation',
    })
  })

  if (calcOutput.workflows.length > 0) {
    rows.push({
      input: 'Automation time reduction %',
      detail: calcOutput.workflows
        .map((w) => `${Math.round(w.savingsPct)}% — ${w.name}`)
        .join('; '),
      sourceLabel: 'Industry benchmarks',
      status: 'Industry standard',
    })
  }

  ;(copy.profit_levers ?? []).forEach((l) => {
    rows.push({
      input: `Profit lever — ${l.lever_name}`,
      detail: l.baseline_data,
      sourceLabel: 'Benchmarked',
      status: 'Needs validation',
    })
  })

  return rows
}

function buildRoadmap(merged) {
  const pilotName = merged[0]?.name ?? 'the top workflow'
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
