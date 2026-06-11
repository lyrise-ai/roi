// ─────────────────────────────────────────────────────────────────────────────
// assembleReport — builds all display strings and HTML blobs for the template
// Pure TypeScript, fully deterministic — no LLM calls
// Single input: ReportState (reads company, globals, workflows, copy, calcOutput)
// ─────────────────────────────────────────────────────────────────────────────

import { roiLog } from '@/src/lib/roi/debug'

import type {
  ReportState,
  AssembleReportOutput,
  DisplayObject,
  WorkflowInput,
  WorkflowCalc,
} from '@/src/lib/roi/types'

// ── Formatters ────────────────────────────────────────────────────────────────

function addCommas(n: number): string {
  const str = String(Math.round(n || 0))
  let out = ''
  for (let i = 0; i < str.length; i++) {
    if (i > 0 && (str.length - i) % 3 === 0) out += ','
    out += str[i]
  }
  return out
}

function esc(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ── Case studies ──────────────────────────────────────────────────────────────

const CASE_STUDIES = [
  {
    client: 'Quantrax Corporation',
    industry: 'Financial Services',
    headline: '$390K total gain in Year 1',
    results: [
      '~3,300 hrs freed per year (~2 FTEs)',
      '$70K/year Operational Dividend',
      '$290K/year Profit Uplift',
      '$390K Total Financial Gain',
    ],
    quote:
      'The LyRise team helped Quantrax create outstanding scoring models in a complex debt-collection industry. I would recommend them if you want to build your AI team or solution easier and faster.',
    author: 'Ranjan Dharmaraja, Founder & CEO',
  },
  {
    client: 'NY Law Firm',
    industry: 'Legal & Professional Services',
    headline: '$450K total gain in Year 1',
    results: [
      '~10,000 hrs freed per year (~6 FTEs)',
      '$300K/year Operational Dividend',
      '$225K/year Profit Uplift',
      '$450K Total Financial Gain',
    ],
    quote:
      'LyRise helped us reclaim thousands of attorney hours and redirect them to higher-value client work.',
    author: 'Managing Partner, NY Law Firm',
  },
]

function buildCaseStudiesHTML(): string {
  const cols = CASE_STUDIES.map((cs) => {
    const truncQuote =
      cs.quote.length > 150 ? cs.quote.slice(0, 147) + '...' : cs.quote
    return (
      `<td style="width:50%;vertical-align:top;background:#f8fafc;border:1px solid #dde1e7;padding:9px 11px">` +
      `<div style="font-size:7pt;text-transform:uppercase;letter-spacing:0.8px;color:#94a3b8;font-weight:bold;margin-bottom:2px">${esc(
        cs.industry,
      )}</div>` +
      `<div style="font-size:10pt;font-weight:bold;color:#003f87;margin-bottom:4px">${esc(
        cs.client,
      )}</div>` +
      `<div style="font-size:12pt;font-weight:bold;color:#003f87;margin-bottom:6px;padding-bottom:5px;border-bottom:1px solid #e2e8f0">${esc(
        cs.headline,
      )}</div>` +
      cs.results
        .map(
          (r) =>
            `<div style="font-size:8.5pt;color:#1e293b;padding:2px 0">&rsaquo; ${esc(
              r,
            )}</div>`,
        )
        .join('') +
      `<div style="font-size:8pt;color:#64748b;margin-top:7px;font-style:italic;line-height:1.4;border-top:1px solid #e2e8f0;padding-top:5px">&ldquo;${esc(
        truncQuote,
      )}&rdquo;</div>` +
      `<div style="font-size:7.5pt;color:#94a3b8;margin-top:3px;font-weight:bold">${esc(
        cs.author,
      )}</div>` +
      `</td>`
    )
  }).join('')
  return `<table style="width:100%;border-collapse:separate;border-spacing:5px;margin-bottom:0"><tr>${cols}</tr></table>`
}

// ── HTML builders ─────────────────────────────────────────────────────────────

function buildCompanySnapshotTableBody(
  state: ReportState,
  sym: string,
): string {
  const { company, copy, normInput } = state
  const rows: string[] = []
  // Headcount: if the form supplied a team size, show "Provided" — otherwise
  // it came from LinkedIn/Apollo research.
  const teamSizeFromForm = (normInput?.teamSize ?? '').trim()
  if (company?.employees) {
    const sourceBadge = teamSizeFromForm
      ? `<span class="badge-scraped">Provided</span>`
      : `<span class="badge-scraped">Scraped — LinkedIn</span>`
    rows.push(
      `<tr><td>${addCommas(
        company.employees,
      )} employees</td><td>${sourceBadge}</td></tr>`,
    )
  }
  // Revenue: if the form supplied a range, surface that range verbatim with
  // a "Provided" badge — research-derived $M estimates only show when the
  // form was empty.
  const revenueRangeFromForm = (normInput?.revenueRange ?? '').trim()
  if (revenueRangeFromForm) {
    rows.push(
      `<tr><td>Annual revenue ${esc(
        revenueRangeFromForm,
      )}</td><td><span class="badge-scraped">Provided</span></td></tr>`,
    )
  } else if (company?.revenueEstimateM) {
    rows.push(
      `<tr><td>Revenue estimated ${sym}${company.revenueEstimateM}M annually</td><td><span class="badge-benchmarked">Benchmarked</span></td></tr>`,
    )
  }
  // Country: form-supplied wins; otherwise show research-derived country.
  const countryFromForm = (normInput?.country ?? '').trim()
  if (countryFromForm) {
    rows.push(
      `<tr><td>Country: ${esc(
        countryFromForm,
      )}</td><td><span class="badge-scraped">Provided</span></td></tr>`,
    )
  } else if (company?.country) {
    rows.push(
      `<tr><td>Country: ${esc(
        company.country,
      )}</td><td><span class="badge-scraped">Scraped</span></td></tr>`,
    )
  }
  // Safety net — drop LLM-authored snapshot items that would duplicate the
  // form-provided rows above. The writer prompt asks the model to skip these
  // facts, but it doesn't always comply, so we filter at render time too.
  const isRedundant = (text: string): boolean => {
    const t = text.toLowerCase()
    return (
      (teamSizeFromForm &&
        /\b\d[\d,]*\s*(employees?|people|staff)\b/.test(t)) ||
      (revenueRangeFromForm &&
        /\b(annual\s+)?revenue\b|\bgenerates?\b.*\$|\bannually\b/.test(t))
    )
  }
  ;(copy?.company_snapshot ?? []).forEach((item) => {
    if (isRedundant(item.text ?? '')) return
    const cls =
      item.sourceType === 'scraped'
        ? 'badge-scraped'
        : item.sourceType === 'benchmarked'
        ? 'badge-benchmarked'
        : 'badge-assumed'
    const label =
      item.sourceType === 'scraped'
        ? 'Scraped'
        : item.sourceType === 'benchmarked'
        ? 'Benchmarked'
        : 'Assumed'
    rows.push(
      `<tr><td>${esc(
        item.text,
      )}</td><td><span class="${cls}">${label}</span></td></tr>`,
    )
  })
  return rows.join('')
}

function buildCostOfDelayHTML(
  sym: string,
  monthlyCostRaw: number,
  narrative: string,
): string {
  return (
    `<div class="insight-panel">` +
    `<div class="stripe"></div>` +
    `<div class="panel-content">` +
    `<div style="font-size:18pt;font-weight:bold;color:#003f87;line-height:1">${sym}${addCommas(
      Math.round(monthlyCostRaw),
    )}<span style="font-size:9pt;font-weight:normal;color:#64748b"> / month</span></div>` +
    `<p style="font-size:8.5pt;color:#2d2d2d;margin-top:6px;line-height:1.5">${esc(
      narrative,
    )}</p>` +
    `</div></div>`
  )
}

function buildResilienceTableHTML(
  rows: ReportState['copy']['resilience_rows'],
): string {
  if (!rows?.length) return ''
  const tableRows = rows
    .map(
      (r) =>
        `<tr>` +
        `<td style="font-weight:bold;width:22%">${esc(r.dimension)}</td>` +
        `<td style="background:#f0fdf4;color:#166534"><strong>Act Now:</strong> ${esc(
          r.act_now,
        )}</td>` +
        `<td style="background:#fef2f2;color:#991b1b"><strong>Defer:</strong> ${esc(
          r.defer,
        )}</td>` +
        `</tr>`,
    )
    .join('')
  return (
    `<table style="width:100%;border-collapse:collapse;font-size:9pt">` +
    `<thead><tr><th style="width:22%">Dimension</th><th style="width:39%">Act Now</th><th style="width:39%">Defer Decision</th></tr></thead>` +
    `<tbody>${tableRows}</tbody></table>`
  )
}

function buildRisksTableBody(risks: ReportState['copy']['risks']): string {
  if (!risks?.length) return ''
  return risks
    .map(
      (r) =>
        `<tr>` +
        `<td style="font-weight:bold;width:20%">${esc(r.risk)}</td>` +
        `<td style="width:42%;font-size:8.5pt">${esc(r.detail)}</td>` +
        `<td style="width:38%">${esc(r.mitigation)}</td>` +
        `</tr>`,
    )
    .join('')
}

function buildNextStepsHTML(cta: string): string {
  return (
    `<div style="font-size:10pt;font-weight:bold;color:#1a1a1a;margin-bottom:6px">Process validation session</div>` +
    `<div class="insight-panel" style="margin-bottom:10px">` +
    `<div class="stripe"></div>` +
    `<div class="panel-content" style="font-size:9pt">` +
    `<p style="margin:0 0 6px">${esc(cta)}</p>` +
    `<div style="font-size:8.5pt;color:#003f87;font-weight:bold">Book: calendly.com/elena-lyrise/30min &nbsp;|&nbsp; elena@lyrise.ai</div>` +
    `</div></div>`
  )
}

function buildOdVsPuPanelHTML(sym: string, od: number, pu: number): string {
  return (
    `<div class="insight-panel" style="margin-top:8px">` +
    `<div class="insight-stripe"></div>` +
    `<div class="insight-content">` +
    `<div style="font-size:7pt;text-transform:uppercase;letter-spacing:0.8px;color:#003f87;font-weight:bold;margin-bottom:6px">Understanding These Numbers</div>` +
    `<div style="display:flex;gap:20px">` +
    `<div style="flex:1"><div style="font-size:7pt;text-transform:uppercase;color:#94a3b8;font-weight:bold">Operational Dividend</div>` +
    `<div style="font-size:13pt;font-weight:bold;color:#003f87">${sym}${addCommas(
      od,
    )}</div>` +
    `<div style="font-size:8pt;color:#64748b;margin-top:2px">Direct labor value recaptured from freed hours — measurable on day one of full adoption</div></div>` +
    `<div style="flex:1"><div style="font-size:7pt;text-transform:uppercase;color:#94a3b8;font-weight:bold">Profit Uplift</div>` +
    `<div style="font-size:13pt;font-weight:bold;color:#003f87">${sym}${addCommas(
      pu,
    )}</div>` +
    `<div style="font-size:8pt;color:#64748b;margin-top:2px">Downstream revenue and margin gains from redirecting recaptured capacity to higher-value activities</div></div>` +
    `</div></div></div>`
  )
}

function buildCalculationPanelHTML(
  sym: string,
  wfs: Array<WorkflowInput & WorkflowCalc>,
  globals: { realizationFactor: number; workWeeksPerYear: number },
  totalMonthlyHours: number,
  annualOD: number,
): string {
  const topWf = wfs[0]
  const savedHrs = (topWf.timeSaved / 60).toFixed(2)
  // Damping/alignment factor: bundles adoption rate, realization factor, work-
  // month factor, and any revenue-band scaling into a single multiplier so the
  // simple formula on the page reconciles to the displayed monthly value.
  // Shown to the reader so they can sanity-check the math line by line.
  const baselineMonthly = topWf.monthlyVolume * (topWf.timeSaved / 60) * topWf.effectiveRate
  const monthlyValue = Math.round(topWf.monthlyHours * topWf.effectiveRate)
  const adoptionFactor = baselineMonthly > 0 ? monthlyValue / baselineMonthly : 1
  const totalMonthlyValue = wfs.reduce(
    (a, w) => a + Math.round(w.monthlyHours * w.effectiveRate),
    0,
  )
  const ftes = ((totalMonthlyHours * 12) / 2080).toFixed(1)
  const sumLine =
    wfs
      .map(
        (w) =>
          `${sym}${addCommas(Math.round(w.monthlyHours * w.effectiveRate))}`,
      )
      .join(' + ') + ` = ${sym}${addCommas(totalMonthlyValue)}/mo`

  return (
    `<div class="insight-panel" style="margin-top:6px">` +
    `<div class="insight-stripe"></div>` +
    `<div class="insight-content" style="font-size:8.5pt">` +
    `<div style="font-size:7pt;text-transform:uppercase;letter-spacing:0.8px;color:#003f87;font-weight:bold;margin-bottom:6px">How This Is Calculated</div>` +
    `<div style="margin-bottom:4px"><strong>Formula:</strong> Value recaptured/mo = Volume × (Before AI hrs − After AI hrs) × Rate (${sym}/hr) × Adoption ramp factor</div>` +
    `<div style="margin-bottom:4px"><strong>Worked example — ${esc(
      topWf.name,
    )}:</strong> <span style="font-family:monospace">${addCommas(
      topWf.monthlyVolume,
    )} × ${savedHrs} hrs × ${sym}${addCommas(
      topWf.effectiveRate,
    )}/hr × ${adoptionFactor.toFixed(2)} = ${sym}${addCommas(monthlyValue)}/mo</span></div>` +
    `<div style="margin-bottom:4px;font-size:8pt;color:#64748b"><em>Adoption ramp factor combines realistic adoption (rarely 100% on day one), realization, and revenue-band alignment into one multiplier.</em></div>` +
    `<div style="margin-bottom:4px"><strong>Monthly total:</strong> <span style="font-family:monospace">${sumLine}</span></div>` +
    `<div style="margin-bottom:2px"><strong>Annual hours returned:</strong> <span style="font-family:monospace">${addCommas(
      totalMonthlyHours,
    )} × 12 = ${addCommas(totalMonthlyHours * 12)} hrs (~${ftes} FTEs at 2,080 hrs/yr)</span></div>` +
    `<div><strong>Annual Operational Dividend:</strong> <span style="font-family:monospace">${sym}${addCommas(
      totalMonthlyValue,
    )}/mo × 12 = ${sym}${addCommas(annualOD)}</span></div>` +
    `</div></div>`
  )
}

function buildProvenanceTableBody(
  state: ReportState,
  sym: string,
  profitLevers: ReportState['copy']['profit_levers'],
): string {
  const { company, workflows, globals, calcOutput, normInput } = state
  // `sourceIsHtml: true` means `source` is pre-escaped HTML and should be
  // injected verbatim (used to embed real <a> hyperlinks for evidence URLs).
  const rows: {
    input: string
    detail: string
    source: string
    sourceIsHtml?: boolean
    status: string
  }[] = []

  // Form-provided data is the highest-confidence source — short-circuit
  // research-derived values when the user typed it in themselves.
  const revenueRangeFromForm = (normInput?.revenueRange ?? '').trim()
  const teamSizeFromForm = (normInput?.teamSize ?? '').trim()
  const countryFromForm = (normInput?.country ?? '').trim()

  if (revenueRangeFromForm) {
    rows.push({
      input: 'Annual revenue anchor',
      detail: revenueRangeFromForm,
      source: 'Provided',
      status: 'Validated',
    })
  } else if (company?.revenueEstimateM) {
    rows.push({
      input: 'Annual revenue anchor',
      detail: `${sym}${company.revenueEstimateM}M estimated`,
      source: 'Benchmarked',
      status: 'Needs validation',
    })
  }
  if (company?.employees) {
    rows.push({
      input: 'Headcount',
      detail: `${company.employees.toLocaleString()} employees`,
      source: teamSizeFromForm ? 'Provided' : 'Scraped — LinkedIn / Apollo',
      status: 'Validated',
    })
  }
  if (countryFromForm) {
    rows.push({
      input: 'Country',
      detail: countryFromForm,
      source: 'Provided',
      status: 'Validated',
    })
  } else if (company?.country) {
    rows.push({
      input: 'Country',
      detail: company.country,
      source: 'Scraped',
      status: 'Validated',
    })
  }

  ;(workflows ?? []).forEach((wf) => {
    const calc = calcOutput?.workflows.find((c) => c.name === wf.name)
    // Rule 6A — surface rateSource + URL when the modeler grounded the rate in
    // real salary evidence; fall back to "Benchmarked" only when the modeler
    // signaled benchmark_fallback or supplied no source.
    const isFallback =
      !wf.rateSource ||
      wf.rateSource === 'benchmark_fallback' ||
      wf.rateSource === 'assumed'
    const safeUrl =
      wf.rateSourceUrl && /^https?:\/\//i.test(wf.rateSourceUrl)
        ? wf.rateSourceUrl
        : null
    const rateSourceLabel = isFallback
      ? 'Benchmarked'
      : safeUrl
      ? `Scraped — <a href="${esc(safeUrl)}" style="color:#003f87">${esc(
          wf.rateSource ?? '',
        )}</a>`
      : `Scraped — ${esc(wf.rateSource ?? '')}`
    const rateStatus = isFallback ? 'Needs validation' : 'Validated'
    rows.push({
      input: `${wf.name} — blended rate`,
      detail: `${sym}${calc?.effectiveRate ?? globals?.laborRate ?? '—'}/hr${
        wf.seniorityLevel ? ` (${wf.seniorityLevel})` : ''
      }`,
      source: rateSourceLabel,
      sourceIsHtml: true,
      status: rateStatus,
    })
    rows.push({
      input: `${wf.name} — monthly volume`,
      detail: `${wf.monthlyVolume}/mo estimated`,
      source:
        wf.sourceType === 'user_stated'
          ? 'User-stated'
          : wf.sourceType === 'research_derived'
          ? 'Scraped'
          : 'Benchmarked',
      status:
        wf.sourceType === 'user_stated' ? 'Validated' : 'Needs validation',
    })
  })

  if ((calcOutput?.workflows ?? []).length > 0) {
    rows.push({
      input: 'Automation time reduction %',
      detail: (calcOutput?.workflows ?? [])
        .map((w) => `${w.savingsPct}% — ${w.name}`)
        .join('; '),
      source: 'Benchmarked — LyRise + McKinsey 2023',
      status: 'Industry standard',
    })
  }

  ;(profitLevers ?? []).forEach((l) => {
    rows.push({
      input: `Profit lever — ${l.lever_name}`,
      detail: l.baseline_data,
      source: 'Benchmarked',
      status: 'Needs validation',
    })
  })

  const statusStyle = (s: string) =>
    s === 'Validated'
      ? 'color:#166534;font-weight:bold'
      : s === 'Industry standard'
      ? 'color:#1d4ed8'
      : 'color:#92400e'

  return rows
    .map(
      (r) =>
        `<tr>` +
        `<td><strong>${esc(r.input)}</strong></td>` +
        `<td>${esc(r.detail)}</td>` +
        `<td style="font-size:8.5pt;color:#64748b">${
          r.sourceIsHtml ? r.source : esc(r.source)
        }</td>` +
        `<td style="font-size:8pt;${statusStyle(r.status)}">${esc(
          r.status,
        )}</td>` +
        `</tr>`,
    )
    .join('')
}

function buildRoadmapTableBody(pilotWfName: string): string {
  return [
    [
      'Weeks 1–2',
      'Rapid Discovery &amp; Validation',
      `Validate workflow volumes and task times for ${esc(
        pilotWfName,
      )}; confirm data access and integration scope; agree pilot selection.`,
    ],
    [
      'Weeks 3–6',
      'Pilot Build &amp; Testing',
      `Deploy AI agent for ${esc(
        pilotWfName,
      )}; QA and calibration cycles; weekly accuracy reports; human review gates active throughout.`,
    ],
    [
      'Weeks 7–8',
      'Controlled Go-Live',
      `Full pilot rollout on approved workflows; performance instrumentation live; weekly dashboard; anomaly escalation active.`,
    ],
    [
      'Weeks 9–10',
      'ROI Validation &amp; Expansion',
      `Measure actual hours returned vs. modelled; calculate realised Operational Dividend; present Phase 2 roadmap.`,
    ],
  ]
    .map(
      ([timeline, phase, activities]) =>
        `<tr>` +
        `<td style="color:#003f87;font-weight:bold;white-space:nowrap">${timeline}</td>` +
        `<td><strong>${phase}</strong></td>` +
        `<td>${activities}</td>` +
        `</tr>`,
    )
    .join('')
}

// ── Main function ─────────────────────────────────────────────────────────────

export function assembleReport(state: ReportState): AssembleReportOutput {
  const {
    company,
    globals,
    workflows,
    copy,
    calcOutput,
    normInput,
    confidenceLevel,
  } = state

  if (!calcOutput || !copy || !workflows || !globals || !company) {
    throw new Error('assembleReport: missing required state fields')
  }

  // Per-workflow rate provenance summary — confirms whether the renderer is
  // about to show evidence-backed sources or the "Benchmarked" fallback label.
  const evidenceCount = workflows.filter(
    (w) =>
      w.rateSource &&
      w.rateSource !== 'benchmark_fallback' &&
      w.rateSource !== 'assumed',
  ).length
  roiLog(
    'assemble',
    `building report — ${workflows.length} workflows | ${evidenceCount}/${workflows.length} have evidence-backed rate citation`,
    workflows.map((w) => ({
      name: w.name,
      rate: w.rateOverride,
      seniority: w.seniorityLevel,
      source: w.rateSource ?? 'NULL',
      url: w.rateSourceUrl,
    })),
  )

  // Currencies whose official symbols are non-Latin script — always use the ISO code instead
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
  // eslint-disable-next-line no-control-regex
  const hasNonAscii = /[^\x00-\x7F]/.test(globals.currency.symbol)
  const rawSym =
    SCRIPT_SYMBOL_CODES.has(globals.currency.code) || hasNonAscii
      ? globals.currency.code
      : globals.currency.symbol
  const sym = rawSym.length > 1 && !rawSym.endsWith(' ') ? rawSym + ' ' : rawSym
  const s = calcOutput.summary

  const fmt = (n: number | null | undefined) =>
    n != null && !Number.isNaN(+n) ? addCommas(+n) : '—'
  const cur = (n: number) => sym + fmt(n)
  const short = (n: number) => {
    if (n == null || Number.isNaN(+n)) return '—'
    const v = Math.round(+n)
    if (v >= 1_000_000) return sym + (v / 1_000_000).toFixed(1) + 'M'
    if (v >= 1_000) return sym + Math.round(v / 1_000) + 'K'
    return cur(v)
  }

  const tf12 = s.totalFinancialGain12mo

  // Merge WorkflowInput + WorkflowCalc — sorted desc by annual value for display
  const merged: Array<WorkflowInput & WorkflowCalc> = [...calcOutput.workflows]
    .sort((a, b) => b.annualValue - a.annualValue)
    .map((calc) => {
      const inp = workflows.find((w) => w.name === calc.name) ?? workflows[0]
      return { ...inp, ...calc }
    })

  const totalMonthlyHours = merged.reduce((a, w) => a + w.monthlyHours, 0)
  const totalMonthlyCost = merged.reduce((a, w) => a + w.monthlyCost, 0)
  const totalHrsBefore = merged.reduce(
    (acc, w) =>
      acc + Math.round((w.monthlyVolume * w.minutesPerItemBefore) / 60),
    0,
  )
  const totalHrsAfter = merged.reduce(
    (acc, w) =>
      acc + Math.round((w.monthlyVolume * w.minutesPerItemAfter) / 60),
    0,
  )
  const totalValMo = merged.reduce(
    (acc, w) => acc + Math.round(w.monthlyHours * w.effectiveRate),
    0,
  )

  const MONTHS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ]
  const now = new Date()
  const currentDate = `${
    MONTHS[now.getMonth()]
  } ${now.getDate()}, ${now.getFullYear()}`

  // Tables
  const caseStudiesHTML = buildCaseStudiesHTML()
  const scopeListHTML = merged.map((w) => `<li>${esc(w.name)}</li>`).join('')

  const levers = copy.profit_levers ?? []
  // Per-lever arithmetic is computed deterministically from WorkflowCalc so
  // every rendered "X hrs × $Y × Z redirected = $W/mo" line reconciles with
  // the calculator's PU total — the modeler is told to omit
  // rationale_with_arithmetic (it's overwritten below). Join by derived_from
  // first, then fall back to positional index (the prompt mandates lever
  // ordering matches workflow ordering); only fall back to the LLM's text
  // if both lookups fail.
  const redirectionPct = Math.max(0, globals.profitMultiplier - 1)
  const leverArithmetic: string[] = levers.map((l, i) => {
    const wf =
      merged.find(
        (w) => w.name.toLowerCase() === (l.derived_from ?? '').toLowerCase(),
      ) ?? merged[i]
    if (wf) {
      return `${addCommas(wf.monthlyHours)} hrs/mo freed × ${sym}${addCommas(
        wf.effectiveRate,
      )}/hr × ${redirectionPct.toFixed(
        2,
      )} redirected = ${sym}${addCommas(wf.monthlyProfitUplift)}/mo`
    }
    return esc(l.rationale_with_arithmetic ?? l.rationale ?? '')
  })
  const profitLeversBody =
    levers
      .map((l, i) => {
        return (
          `<tr>` +
          `<td><strong>${esc(l.lever_name ?? '')}</strong></td>` +
          `<td style="color:#64748b;font-size:8.5pt">${esc(
            l.derived_from ?? '',
          )}</td>` +
          `<td>${esc(l.baseline_data ?? '')}</td>` +
          `<td>${esc((l as any).assumption ?? '')}</td>` +
          `<td style="font-size:8pt;color:#2d2d2d;font-family:monospace">${leverArithmetic[i]}</td>` +
          `</tr>`
        )
      })
      .join('') +
    `<tr class="total-row"><td colspan="4"><strong>Annual incremental profit (per year)</strong></td><td class="accent"><strong>${sym}${fmt(
      s.profitUplift12mo,
    )}</strong></td></tr>`

  // Master workflow table — consolidates As-Is + Before/After + Deploy
  // (each workflow appears once with all relevant columns).
  const workflowMasterTableBody =
    merged
      .map((wf) => {
        const beforeHrs = (wf.minutesPerItemBefore / 60).toFixed(2)
        const afterHrs = (wf.minutesPerItemAfter / 60).toFixed(2)
        const monthlyValue = Math.round(wf.monthlyHours * wf.effectiveRate)
        const srcClass =
          wf.sourceType === 'user_stated'
            ? 'badge-scraped'
            : wf.sourceType === 'research_derived'
            ? 'badge-scraped'
            : 'badge-benchmarked'
        const srcLabel =
          wf.sourceType === 'user_stated'
            ? 'User-stated'
            : wf.sourceType === 'research_derived'
            ? 'Scraped'
            : 'Benchmarked'
        const detailParts: string[] = []
        if (wf.expectedOutcome) {
          detailParts.push(
            `<strong>Target outcome:</strong> ${esc(wf.expectedOutcome)}`,
          )
        }
        if (wf.whyItMatters) {
          detailParts.push(
            `<strong>Why it fits:</strong> ${esc(wf.whyItMatters)}`,
          )
        }
        const detailRow = detailParts.length
          ? `<tr><td colspan="9" style="background:#f8fafc;font-size:8.5pt;color:#475569;padding:4px 8px;border-bottom:1px solid #e2e8f0">${detailParts.join(
              ' &nbsp;·&nbsp; ',
            )}</td></tr>`
          : ''
        return (
          `<tr>` +
          `<td>` +
          `<strong>${esc(wf.name)}</strong> ` +
          `<span class="${srcClass}">${srcLabel}</span>` +
          (wf.owner
            ? `<div style="font-size:7.5pt;color:#5a5a6e;margin-top:2px">${esc(
                wf.owner,
              )}</div>`
            : '') +
          `</td>` +
          `<td style="text-align:center">${fmt(wf.monthlyVolume)}</td>` +
          `<td style="text-align:center">${beforeHrs}</td>` +
          `<td style="text-align:center">${afterHrs}</td>` +
          `<td style="text-align:center">${fmt(wf.monthlyHours)}</td>` +
          `<td>${sym}${fmt(wf.effectiveRate)}/hr</td>` +
          `<td>${sym}${fmt(wf.monthlyCost)}</td>` +
          `<td class="accent"><strong>${sym}${fmt(
            monthlyValue,
          )}</strong></td>` +
          `<td class="accent"><strong>${esc(
            wf.agentName ?? '—',
          )}</strong></td>` +
          `</tr>` +
          detailRow
        )
      })
      .join('') +
    `<tr class="total-row">` +
    `<td colspan="4"><strong>Totals — across ${merged.length} workflow${
      merged.length === 1 ? '' : 's'
    }</strong></td>` +
    `<td style="text-align:center"><strong>${fmt(
      totalMonthlyHours,
    )} hrs</strong></td>` +
    `<td></td>` +
    `<td><strong>${sym}${fmt(totalMonthlyCost)}</strong></td>` +
    `<td class="accent"><strong>${sym}${fmt(totalValMo)}/mo</strong></td>` +
    `<td></td>` +
    `</tr>`

  const provenanceTableHTML =
    `<table><thead><tr>` +
    `<th style="width:22%">Input</th><th style="width:36%">Detail</th><th style="width:28%">Source</th><th style="width:14%">Status</th>` +
    `</tr></thead><tbody>` +
    buildProvenanceTableBody(state, sym, copy.profit_levers) +
    `</tbody></table>`

  // Revenue context statement
  const revenueBase =
    (company.revenueEstimateM ?? 0) > 0
      ? company.revenueEstimateM! * 1_000_000
      : 0
  const revPct = revenueBase > 0 ? Math.round((tf12 / revenueBase) * 100) : 0
  const revenueContextStatement =
    revenueBase > 0 && revPct <= 500
      ? `This represents approximately ${revPct}% of your estimated annual revenue returned through operational efficiency — without adding headcount.`
      : ''

  const confLevel = confidenceLevel ?? 'low'
  const confidenceBadge =
    confLevel === 'high'
      ? 'Insight-Driven Analysis'
      : 'Hypothesis-Driven Projection'

  const companySnapshotTableBody = buildCompanySnapshotTableBody(state, sym)

  const monthlyCostOfDelay = Math.round(tf12 / 12)
  const costOfDelayNarrative =
    copy.cost_of_delay?.narrative ??
    `Every month without automation costs your team the equivalent of ${sym}${addCommas(
      monthlyCostOfDelay,
    )} in recoverable value. Delay is not neutral — it carries a monthly price.`
  const costOfDelayHTML = buildCostOfDelayHTML(
    sym,
    monthlyCostOfDelay,
    costOfDelayNarrative,
  )

  const resilienceTableHTML = buildResilienceTableHTML(
    copy.resilience_rows ?? [],
  )
  const risksTableBody = buildRisksTableBody(copy.risks ?? [])
  const nextStepsHTML = buildNextStepsHTML(
    copy.cta_paragraph ||
      `Let us show you how we can return ${fmt(
        totalMonthlyHours,
      )} hours to your team each month.`,
  )
  const odVsPuPanelHTML = buildOdVsPuPanelHTML(
    sym,
    s.operationalDividend12mo,
    s.profitUplift12mo,
  )
  const calculationPanelHTML =
    merged.length > 0
      ? buildCalculationPanelHTML(
          sym,
          merged,
          globals,
          totalMonthlyHours,
          s.operationalDividend12mo,
        )
      : ''
  const roadmapTableBody =
    merged.length > 0 ? buildRoadmapTableBody(merged[0].name) : ''

  // BLUF paragraph — use coreThesis from research agent when available
  const profileParts: string[] = []
  if (company.employees)
    profileParts.push(`${company.employees.toLocaleString()}-person`)
  if (company.industry) profileParts.push(company.industry.toLowerCase())
  const profileDesc = profileParts.length
    ? `${company.company} is a ${profileParts.join(' ')} firm`
    : company.company
  const wfNames = merged.map((w) => w.name.toLowerCase()).join(', ')
  const coreThesisLine = state.coreThesis
    ? ` ${state.coreThesis}`
    : ` Across its workflows — ${wfNames} — the same structural drain recurs: qualified professionals spending significant time on high-volume, rules-based process that does not require their judgment.`
  const blufParagraph =
    `${profileDesc}.${coreThesisLine}` +
    ` This report estimates ${short(
      tf12,
    )} in Total Financial Gain available through targeted AI deployment — without adding headcount.`

  // BVA compact table (exec template)
  const bvaTableBodyCompact =
    merged
      .map((wf) => {
        const hrsBefore = Math.round(
          (wf.monthlyVolume * wf.minutesPerItemBefore) / 60,
        )
        const hrsAfter = Math.round(
          (wf.monthlyVolume * wf.minutesPerItemAfter) / 60,
        )
        const hrsSaved = Math.round(wf.monthlyHours)
        const valMo = Math.round(wf.monthlyHours * wf.effectiveRate)
        return (
          `<tr>` +
          `<td style="font-weight:bold">${esc(wf.name)}</td>` +
          `<td style="text-align:center">${hrsBefore}</td>` +
          `<td style="text-align:center">${hrsAfter}</td>` +
          `<td style="text-align:center;font-weight:bold">${hrsSaved}</td>` +
          `<td style="text-align:right;color:#003f87;font-weight:bold">${sym}${addCommas(
            valMo,
          )}</td>` +
          `<td style="color:#5a5a6e">${esc(wf.agentName ?? '')}</td>` +
          `</tr>`
        )
      })
      .join('') +
    `<tr class="total-row">` +
    `<td><strong>TOTALS</strong></td>` +
    `<td style="text-align:center"><strong>${totalHrsBefore}</strong></td>` +
    `<td style="text-align:center"><strong>${totalHrsAfter}</strong></td>` +
    `<td style="text-align:center"><strong>${fmt(
      s.totalAnnualHours / 12,
    )}</strong></td>` +
    `<td style="text-align:right"><strong>${sym}${addCommas(
      totalValMo,
    )}</strong></td>` +
    `<td style="color:#fff;font-size:8pt">${fmt(
      s.totalAnnualHours,
    )} hrs/yr · ${(s.totalAnnualHours / 2080).toFixed(1)} FTE equiv.</td>` +
    `</tr>` +
    `<tr class="total-row">` +
    `<td colspan="4" style="color:#fff;font-weight:bold;font-size:8.5pt">Total Operational Dividend (per year)</td>` +
    `<td colspan="2" style="color:#aad0ff;font-weight:bold;font-size:9.5pt">${sym}${addCommas(
      s.operationalDividend12mo,
    )} / yr · value of hours recaptured</td>` +
    `</tr>`

  // Profit uplift logic table (exec template) — arithmetic comes from the
  // shared deterministic helper above so this table stays reconciled with the
  // calculator's PU total even when the writer LLM authored stale numbers.
  const profitUpliftLogicBody =
    levers
      .map(
        (l, i) =>
          `<tr>` +
          `<td style="color:#003f87;font-weight:bold;vertical-align:top;width:22%">${esc(
            l.derived_from,
          )}</td>` +
          `<td style="font-style:italic;vertical-align:top;width:22%;font-size:8.5pt">${esc(
            l.lever_name,
          )}</td>` +
          `<td style="color:#5a5a6e;vertical-align:top;width:56%;font-size:8pt">${leverArithmetic[i]}</td>` +
          `</tr>`,
      )
      .join('') +
    `<tr class="total-row">` +
    `<td colspan="2" style="color:#fff;font-weight:bold;font-size:8.5pt">Total Profit Uplift: ${sym}${addCommas(
      s.profitUplift12mo,
    )}/yr</td>` +
    `<td style="color:#aad0ff;font-size:8.5pt">Total Financial Gain: ${sym}${addCommas(
      tf12,
    )}/yr · All levers require validation in Phase 1.</td>` +
    `</tr>`

  const display: DisplayObject = {
    currencyCode: globals.currency.code,
    currencySymbol: sym,
    workflowCount: String(merged.length),
    coverHeadline: `${fmt(s.totalAnnualHours)} Hrs Returned & ${short(
      tf12,
    )} Total Financial Gain per year`,
    statHours: fmt(s.totalAnnualHours),
    statHoursSub: fmt(totalMonthlyHours),
    statOD: short(s.operationalDividend12mo),
    statPU: short(s.profitUplift12mo),
    statTF: short(tf12),
    statFTE: (s.totalAnnualHours / 2080).toFixed(1),
    totalAnnualHours: fmt(s.totalAnnualHours),
    od12: cur(s.operationalDividend12mo),
    pu12: cur(s.profitUplift12mo),
    tf12: cur(tf12),
    hrs24: fmt(Math.round(s.totalAnnualHours * 2.15)),
    od24: cur(s.operationalDividend24mo),
    pu24: cur(s.profitUplift24mo),
    tf24: cur(s.totalFinancialGain24mo),
    hrs36: fmt(Math.round(s.totalAnnualHours * 3.4)),
    od36: cur(s.operationalDividend36mo),
    pu36: cur(s.profitUplift36mo),
    tf36: cur(s.totalFinancialGain36mo),
    recipientDisplay: normInput?.recipientName
      ? normInput.recipientTitle
        ? `${normInput.recipientName}, ${normInput.recipientTitle}`
        : normInput.recipientName
      : `${company.company} Leadership`,
    caseStudiesHTML,
    scopeListHTML,
    profitLeversBody,
    workflowMasterTableBody,
    provenanceTableHTML,
    revenueContextStatement,
    companySnapshotTableBody,
    confidenceBadge,
    unifiedPatternThesis: copy.unified_pattern_thesis ?? '',
    costOfDelayHTML,
    resilienceTableHTML,
    pilotRecommendation: copy.pilot_recommendation ?? '',
    risksTableBody,
    nextStepsHTML,
    odVsPuPanelHTML,
    calculationPanelHTML,
    roadmapTableBody,
    blufParagraph,
    bvaTableBodyCompact,
    profitUpliftLogicBody,
  }

  return {
    roi_data: {
      company: company.company,
      industry: company.industry ?? null,
      country: company.country ?? null,
      employees: company.employees ?? null,
      revenue: company.revenueEstimateM ?? null,
      currency: globals.currency,
      summary: s,
      totalMonthlyHours: calcOutput.totalMonthlyHours,
      totalAnnualHours: calcOutput.totalAnnualHours,
    },
    copy,
    display,
    current_date: currentDate,
    recipient_email: normInput?.email ?? '',
  }
}
