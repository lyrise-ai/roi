// ─────────────────────────────────────────────────────────────────────────────
// assembleReport — builds all display strings and HTML blobs for the template
// Pure TypeScript, fully deterministic — no LLM calls
// Single input: ReportState (reads company, globals, workflows, copy, calcOutput)
// ─────────────────────────────────────────────────────────────────────────────

import { roiLog } from '@/src/lib/roi/debug'
import {
  addCommas,
  currencySymbolFor,
  fmtNumber,
  fmtCurrency,
  fmtCurrencyShort,
} from '@/src/lib/roi/format'

import { buildReportModel } from '@/src/lib/roi/pipeline/reportModel'
import type {
  SourceRow,
  SnapshotRow,
  WorkedExample,
} from '@/src/lib/roi/pipeline/reportModel'

import type {
  ReportState,
  AssembleReportOutput,
  DisplayObject,
  WorkflowInput,
  WorkflowCalc,
} from '@/src/lib/roi/types'

// ── Formatters ────────────────────────────────────────────────────────────────

function esc(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ── Case studies ──────────────────────────────────────────────────────────────

export const CASE_STUDIES = [
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

function buildCompanySnapshotTableBody(rows: SnapshotRow[]): string {
  return rows
    .map(
      (r) =>
        `<tr><td>${esc(r.text)}</td><td><span class="badge-${r.tier}">${esc(
          r.label,
        )}</span></td></tr>`,
    )
    .join('')
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
    `<div style="font-size:8.5pt;color:#003f87;font-weight:bold">Book: <a href="https://api.leadconnectorhq.com/widget/bookings/strategy-call-with-lyrisesivto9" style="color:inherit;text-decoration:none">lyrise.ai/book-meeting</a> &nbsp;|&nbsp; elena@lyrise.ai</div>` +
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
  worked: WorkedExample,
  totalMonthlyHours: number,
  annualOD: number,
): string {
  const topWf = worked.workflow!
  const savedHrs = (topWf.timeSaved / 60).toFixed(2)
  const ftes = ((totalMonthlyHours * 12) / 2080).toFixed(1)
  const sumLine =
    wfs
      .map(
        (w) =>
          `${sym}${addCommas(Math.round(w.monthlyHours * w.effectiveRate))}`,
      )
      .join(' + ') + ` = ${sym}${addCommas(worked.totalMonthlyValue)}/mo`

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
    )}/hr × ${worked.adoptionFactor.toFixed(2)} = ${sym}${addCommas(
      worked.monthlyValue,
    )}/mo</span></div>` +
    `<div style="margin-bottom:4px;font-size:8pt;color:#64748b"><em>Adoption ramp factor combines realistic adoption (rarely 100% on day one), realization, and revenue-band alignment into one multiplier.</em></div>` +
    `<div style="margin-bottom:4px"><strong>Monthly total:</strong> <span style="font-family:monospace">${sumLine}</span></div>` +
    `<div style="margin-bottom:2px"><strong>Annual hours returned:</strong> <span style="font-family:monospace">${addCommas(
      totalMonthlyHours,
    )} × 12 = ${addCommas(
      totalMonthlyHours * 12,
    )} hrs (~${ftes} FTEs at 2,080 hrs/yr)</span></div>` +
    `<div><strong>Annual Operational Dividend:</strong> <span style="font-family:monospace">${sym}${addCommas(
      worked.totalMonthlyValue,
    )}/mo × 12 = ${sym}${addCommas(annualOD)}</span></div>` +
    `</div></div>`
  )
}

function buildProvenanceTableBody(rows: SourceRow[]): string {
  const statusStyle = (s: string) =>
    s === 'Validated'
      ? 'color:#166534;font-weight:bold'
      : s === 'Industry standard'
        ? 'color:#1d4ed8'
        : 'color:#92400e'

  return rows
    .map((r) => {
      const sourceHtml = r.sourceUrl
        ? `<a href="${esc(r.sourceUrl)}" style="color:#003f87">${esc(r.sourceLabel)}</a>`
        : esc(r.sourceLabel)
      return (
        `<tr>` +
        `<td><strong>${esc(r.input)}</strong></td>` +
        `<td>${esc(r.detail)}</td>` +
        `<td style="font-size:8.5pt;color:#64748b">${sourceHtml}</td>` +
        `<td style="font-size:8pt;${statusStyle(r.status)}">${esc(
          r.status,
        )}</td>` +
        `</tr>`
      )
    })
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

  const sym = currencySymbolFor(globals.currency)
  const s = calcOutput.summary

  const fmt = (n: number | null | undefined) => fmtNumber(n)
  const cur = (n: number) => fmtCurrency(n, globals.currency)
  const short = (n: number) => fmtCurrencyShort(n, globals.currency)

  const tf12 = s.totalFinancialGain12mo

  const model = buildReportModel(state)
  const merged = model.workflows

  const totalMonthlyHours = model.totals.monthlyHours
  const totalMonthlyCost = model.totals.monthlyCost
  const totalHrsBefore = model.totals.hrsBefore
  const totalHrsAfter = model.totals.hrsAfter
  const totalValMo = model.totals.monthlyValue

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

  const levers = model.levers
  // Per-lever arithmetic is computed deterministically from the matched
  // workflow (see reportModel.ts) so every rendered "X hrs × $Y × Z
  // redirected = $W/mo" line reconciles with the calculator's PU total — the
  // modeler is told to omit rationale_with_arithmetic (it's overwritten
  // below); only fall back to the LLM's text if there's truly no match.
  const redirectionPct = Math.max(0, globals.profitMultiplier - 1)
  const leverArithmetic: string[] = levers.map((l) => {
    const wf = l.matchedWorkflow
    if (wf) {
      return `${addCommas(wf.monthlyHours)} hrs/mo freed × ${sym}${addCommas(
        wf.effectiveRate,
      )}/hr × ${redirectionPct.toFixed(2)} redirected = ${sym}${addCommas(
        l.monthlyProfitUplift ?? 0,
      )}/mo`
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
          `<td>${esc(l.rationale ?? '')}</td>` +
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
    buildProvenanceTableBody(model.sources) +
    `</tbody></table>`

  // Revenue context statement
  const revenueContextStatement =
    model.revenueContext.base > 0 && model.revenueContext.pct <= 500
      ? `This represents approximately ${model.revenueContext.pct}% of your estimated annual revenue returned through operational efficiency — without adding headcount.`
      : !model.revenueContext.known
        ? 'Annual revenue was not provided — financial gain percentages against a revenue base are unavailable.'
        : ''

  const confLevel = confidenceLevel ?? 'low'
  const confidenceBadge =
    confLevel === 'high'
      ? 'Insight-Driven Analysis'
      : 'Hypothesis-Driven Projection'

  const companySnapshotTableBody = buildCompanySnapshotTableBody(
    model.companySnapshot,
  )

  const monthlyCostOfDelay = model.costOfDelayMonthly
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
  const calculationPanelHTML = model.topWorkflow
    ? buildCalculationPanelHTML(
        sym,
        merged,
        model.workedExample,
        totalMonthlyHours,
        s.operationalDividend12mo,
      )
    : ''
  const roadmapTableBody = model.topWorkflow
    ? buildRoadmapTableBody(model.topWorkflow.name)
    : ''

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
    hrs24: fmt(s.totalAnnualHours24mo),
    od24: cur(s.operationalDividend24mo),
    pu24: cur(s.profitUplift24mo),
    tf24: cur(s.totalFinancialGain24mo),
    hrs36: fmt(s.totalAnnualHours36mo),
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
