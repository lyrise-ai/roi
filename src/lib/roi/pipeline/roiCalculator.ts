// ─────────────────────────────────────────────────────────────────────────────
// roiCalculator — pure TypeScript, no LLM calls
// Single source: WorkflowInput[] + GlobalInputs + CompanyProfile
// ─────────────────────────────────────────────────────────────────────────────

import { roiLog } from '@/src/lib/roi/debug'
import { addCommas, fmtCurrency, fmtCurrencyShort } from '@/src/lib/roi/format'

import type {
  WorkflowInput,
  GlobalInputs,
  CompanyProfile,
  WorkflowCalc,
  RoiCalculatorOutput,
} from '@/src/lib/roi/types'

const MAX_MIN = 480

// ── Regional rate floor enforcement (Rule 6A) ────────────────────────────────
// Bands sourced from `template_instructions.txt:140-148` — fully-loaded billing
// capacity, not raw wages. Bands are stored in their native currency and
// converted to the report's output currency at clamp time.
type SeniorityTier = 'junior' | 'mid' | 'senior'
type RegionBands = {
  currency: string
  bands: Record<SeniorityTier, [number, number]>
}

const REGIONAL_BANDS: Record<string, RegionBands> = {
  UAE: {
    currency: 'AED',
    bands: { junior: [60, 70], mid: [70, 85], senior: [85, 100] },
  },
  SAUDI: {
    currency: 'SAR',
    bands: { junior: [60, 70], mid: [70, 85], senior: [85, 100] },
  },
  US: {
    currency: 'USD',
    bands: { junior: [50, 65], mid: [55, 75], senior: [65, 90] },
  },
  UK: {
    currency: 'GBP',
    bands: { junior: [40, 55], mid: [55, 75], senior: [70, 100] },
  },
  EGYPT: {
    currency: 'EGP',
    bands: { junior: [1200, 1600], mid: [1600, 2000], senior: [2000, 2400] },
  },
  DEFAULT: {
    currency: 'USD',
    bands: { junior: [25, 40], mid: [40, 60], senior: [60, 90] },
  },
}

// Approximate FX — 1 USD = X local unit. Used only for rate-band conversion;
// the report's actual numbers are in whatever currency the modeler chose.
const USD_PER_UNIT: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  AED: 3.6725,
  SAR: 3.75,
  QAR: 3.64,
  KWD: 0.305,
  BHD: 0.376,
  OMR: 0.385,
  EGP: 50,
  JOD: 0.71,
  NGN: 1500,
  ZAR: 18,
  INR: 84,
  JPY: 150,
  CAD: 1.36,
  AUD: 1.5,
  CHF: 0.88,
}

function toRegion(country: string | null): keyof typeof REGIONAL_BANDS {
  if (!country) return 'DEFAULT'
  const c = country.toLowerCase()
  if (
    c.includes('uae') ||
    c.includes('united arab') ||
    c.includes('emirates') ||
    c.includes('dubai') ||
    c.includes('abu dhabi')
  )
    return 'UAE'
  if (c.includes('saudi') || c.includes('ksa')) return 'SAUDI'
  // GCC peers tracked under UAE bands
  if (
    c.includes('qatar') ||
    c.includes('kuwait') ||
    c.includes('bahrain') ||
    c.includes('oman')
  )
    return 'UAE'
  if (
    c === 'us' ||
    c.includes('united states') ||
    c.includes('usa') ||
    c.includes('america')
  )
    return 'US'
  if (
    c === 'uk' ||
    c.includes('united kingdom') ||
    c.includes('britain') ||
    c.includes('england') ||
    c.includes('scotland') ||
    c.includes('wales')
  )
    return 'UK'
  if (c.includes('egypt')) return 'EGYPT'
  return 'DEFAULT'
}

function convertCurrency(
  amount: number,
  fromCcy: string,
  toCcy: string,
): number {
  if (fromCcy === toCcy) return amount
  const fromRate = USD_PER_UNIT[fromCcy] ?? 1
  const toRate = USD_PER_UNIT[toCcy] ?? 1
  return (amount / fromRate) * toRate
}

function getRateBand(
  country: string | null,
  seniority: SeniorityTier,
  outputCcy: string,
): [number, number] {
  const region = REGIONAL_BANDS[toRegion(country)]
  const [lo, hi] = region.bands[seniority]
  return [
    convertCurrency(lo, region.currency, outputCcy),
    convertCurrency(hi, region.currency, outputCcy),
  ]
}

// Silently clamp each workflow's hourly rate into the regional band for its
// seniority. Floor is strict (raises wages too low to match team standards);
// ceiling allows 1.5× headroom for outlier roles before clamping. n8n parity:
// silent — no warnings surfaced to user.
function enforceRegionalRateFloors(
  workflows: WorkflowInput[],
  globals: GlobalInputs,
  company: CompanyProfile,
): WorkflowInput[] {
  const ccy = globals.currency.code
  const region = toRegion(company.country)
  roiLog(
    'calc:floor',
    `region=${region} country="${
      company.country ?? '?'
    }" output_ccy=${ccy} — checking ${workflows.length} workflows`,
  )
  return workflows.map((wf) => {
    const seniority: SeniorityTier = wf.seniorityLevel ?? 'mid'
    const [floor, baseCeiling] = getRateBand(company.country, seniority, ccy)
    // The allowed range is [floor, headroomCeiling] — baseCeiling is only the
    // top of the "typical" band; headroomCeiling is the actual clamp boundary
    // for outlier roles. A rate that exceeds it must clamp back down TO that
    // boundary, not down to baseCeiling — clamping to baseCeiling silently
    // drops the rate below where it started for any edit landing in the
    // headroom zone (e.g. 50 → scale by 1.25 → 63, clamped to a bare
    // baseCeiling of 40 instead of the crossed boundary of 60), which made a
    // requested rate *increase* show up as a decrease in every derived total.
    const headroomCeiling = baseCeiling * 1.5
    const current = wf.rateOverride ?? globals.laborRate
    let clamped = current
    let action = 'OK'
    if (current < floor) {
      clamped = floor
      action = `↑ FLOOR ENFORCED (${current.toFixed(0)} → ${clamped.toFixed(
        0,
      )})`
    } else if (current > headroomCeiling) {
      clamped = headroomCeiling
      action = `↓ CEILING ENFORCED (${current.toFixed(0)} → ${clamped.toFixed(
        0,
      )})`
    }
    roiLog(
      'calc:floor',
      `  ${wf.name} [${seniority}] floor=${floor.toFixed(
        0,
      )} baseCeiling=${baseCeiling.toFixed(
        0,
      )} headroomCeiling=${headroomCeiling.toFixed(
        0,
      )} ${ccy} | current=${current.toFixed(0)} → ${action}`,
    )
    if (clamped === current) return wf
    return { ...wf, rateOverride: Math.round(clamped) }
  })
}

function calcScenario(
  wf: WorkflowInput,
  globals: GlobalInputs,
): { monthlyHours: number; annualHours: number; annualValue: number } {
  const minutesBefore = Math.min(wf.minutesPerItemBefore, MAX_MIN)
  const minutesAfter = Math.min(wf.minutesPerItemAfter, minutesBefore)
  const netSaved = Math.max(
    0,
    minutesBefore - minutesAfter - wf.exceptionRate * wf.exceptionMinutes,
  )
  const rate =
    wf.rateOverride != null && wf.rateOverride > 0
      ? wf.rateOverride
      : globals.laborRate
  const workingMonthFactor = globals.workWeeksPerYear / 52
  const hrs =
    ((wf.monthlyVolume * wf.adoptionRate * netSaved) / 60) *
    globals.realizationFactor *
    workingMonthFactor
  return {
    monthlyHours: hrs,
    annualHours: hrs * 12,
    annualValue: hrs * 12 * rate,
  }
}

export function roiCalculator(
  workflows: WorkflowInput[],
  globals: GlobalInputs,
  company: CompanyProfile,
  // Rule 6B is a generation-time-only sanity check on the modeler's raw
  // output. It must never re-run on post-generation edits (chat, validation
  // wizard) — a fixed ceiling/floor target rescales ALL workflows to ~the
  // same total regardless of the edit, which silently swallows the visible
  // effect of a user's change (LYR-146). Callers outside the initial
  // 'generate' run must leave this false.
  applyRevenueGuardrail = false,
): RoiCalculatorOutput {
  // Rule 6A: silently clamp per-workflow rates into the regional band for the
  // workflow's seniority tier. Catches modeler hallucination of cheap-labor
  // rates (e.g. $12/hr for an Egyptian senior lawyer). n8n-parity: no warnings.
  // eslint-disable-next-line no-param-reassign
  workflows = enforceRegionalRateFloors(workflows, globals, company)

  const workflowCalcs: WorkflowCalc[] = workflows.map((wf) => {
    const minutesBefore = Math.min(wf.minutesPerItemBefore, MAX_MIN)
    const minutesAfter = Math.min(wf.minutesPerItemAfter, minutesBefore)
    const effectiveRate =
      wf.rateOverride != null && wf.rateOverride > 0
        ? wf.rateOverride
        : globals.laborRate
    const timeSaved = minutesBefore - minutesAfter
    const savingsPct =
      minutesBefore > 0 ? Math.round((timeSaved / minutesBefore) * 100) : 0
    const costPerRun = Math.round((minutesBefore / 60) * effectiveRate)
    const monthlyCost = Math.round(wf.monthlyVolume * costPerRun)
    const { monthlyHours, annualHours, annualValue } = calcScenario(wf, globals)
    return {
      name: wf.name,
      effectiveRate,
      timeSaved,
      savingsPct,
      costPerRun,
      monthlyCost,
      monthlyHours: Math.round(monthlyHours),
      monthlyValue: Math.round(monthlyHours * effectiveRate),
      annualHours: Math.round(annualHours),
      annualValue: Math.round(annualValue),
      effectiveMonthlyVolume: 0, // populated after all scaling, below
      monthlyProfitUplift: 0, // populated after all scaling, below
    }
  })

  // Revenue guardrail — keep TFG within 5–20% of estimated revenue.
  // Generation-time only (Rule 6B) — see applyRevenueGuardrail above.
  const revenueM = company.revenueEstimateM
  if (applyRevenueGuardrail && revenueM != null && revenueM > 0) {
    const rawOD = workflowCalcs.reduce((s, w) => s + w.annualValue, 0)
    const rawTF = rawOD * globals.profitMultiplier
    const revenueU = revenueM * 1e6
    const ceiling = revenueU * 0.2
    const floor = revenueU * 0.05
    const ratioPct = ((rawTF / revenueU) * 100).toFixed(1)
    roiLog(
      'calc:revcap',
      `revenue=${revenueM}M (${revenueU.toFixed(0)}) | rawOD=${rawOD.toFixed(
        0,
      )} rawTF=${rawTF.toFixed(0)} | TF/revenue=${ratioPct}% (band: 5–20%)`,
    )

    const applyScale = (scale: number) => {
      workflowCalcs.forEach((w) => {
        w.annualValue = Math.round(w.annualValue * scale)
        w.monthlyValue = Math.round(w.monthlyValue * scale)
        w.annualHours = Math.round(w.annualHours * scale)
        w.monthlyHours = Math.round(w.monthlyHours * scale)
      })
    }

    if (rawOD > 0) {
      if (rawTF > ceiling) {
        const targetOD = ceiling / globals.profitMultiplier
        const rounded = Math.round(targetOD / 1000) * 1000
        const scale = (rounded > 0 ? rounded : targetOD) / rawOD
        roiLog(
          'calc:revcap',
          `↓ CLAMPED DOWN — TF exceeded 20% ceiling, scaling all workflows by ${scale.toFixed(
            3,
          )}× (proportional)`,
        )
        applyScale(scale)
      } else if (rawTF < floor) {
        const targetOD = floor / globals.profitMultiplier
        const rounded = Math.round(targetOD / 1000) * 1000
        const scale = (rounded > 0 ? rounded : targetOD) / rawOD
        roiLog(
          'calc:revcap',
          `↑ SCALED UP — TF below 5% floor, scaling all workflows by ${scale.toFixed(
            3,
          )}× (proportional)`,
        )
        applyScale(scale)
      } else {
        roiLog('calc:revcap', `OK — TF within 5–20% band, no scaling applied`)
      }
    }
  } else if (applyRevenueGuardrail) {
    roiLog(
      'calc:revcap',
      `no revenue anchor available (revenueM=${
        revenueM ?? 'null'
      }) — skipping 5–20% guardrail`,
    )
  }

  // Back-derive an "effective monthly volume" that makes the simple formula
  // (volume × hrsSavedPerItem × rate ≈ monthlyValue) reconcile in the rendered
  // report. Adoption/realization damping and revenue-band scaling are both
  // baked in — this is the single number we surface to the reader so the
  // worked example, master workflow table, and per-lever arithmetic all agree.
  // Also compute per-workflow profit uplift deterministically so the Profit
  // Uplift table's per-lever lines don't drift from the totals.
  const profitUpliftMultiplier = Math.max(0, globals.profitMultiplier - 1)
  workflowCalcs.forEach((w, idx) => {
    const wf = workflows[idx]
    const hrsSavedPerItem =
      Math.max(0.01, wf.minutesPerItemBefore - wf.minutesPerItemAfter) / 60
    w.effectiveMonthlyVolume = Math.max(
      0,
      Math.round(w.monthlyHours / hrsSavedPerItem),
    )
    w.monthlyProfitUplift = Math.round(w.monthlyValue * profitUpliftMultiplier)
  })

  const totalMonthlyHours = workflowCalcs.reduce(
    (s, w) => s + w.monthlyHours,
    0,
  )
  const totalAnnualHours = workflowCalcs.reduce((s, w) => s + w.annualHours, 0)
  const totalAnnualValue = workflowCalcs.reduce((s, w) => s + w.annualValue, 0)

  const od12 = Math.round(totalAnnualValue)
  const pu12 = Math.round(totalAnnualValue * (globals.profitMultiplier - 1))
  const tf12 = od12 + pu12
  roiLog(
    'calc:revcap',
    `final: OD=${od12} PU=${pu12} TFG=${tf12} hrs/yr=${Math.round(
      totalAnnualHours,
    )} (profitMultiplier=${globals.profitMultiplier})`,
  )
  const od24 = Math.round(od12 * 2.15)
  const pu24 = Math.round(pu12 * 2.15)
  const tf24 = od24 + pu24
  const hrs24 = Math.round(totalAnnualHours * 2.15)
  const od36 = Math.round(od12 * 3.4)
  const pu36 = Math.round(pu12 * 3.4)
  const tf36 = od36 + pu36
  const hrs36 = Math.round(totalAnnualHours * 3.4)

  const monthlyValue = totalAnnualValue / 12
  const adjImplCost = Math.max(
    Math.round(monthlyValue * 6),
    Math.min(Math.round(monthlyValue * 10), globals.implementationCost),
  )
  const adjPayback =
    totalAnnualValue > 0 ? Math.ceil(adjImplCost / monthlyValue) : null

  const fmtCur = (n: number) => fmtCurrency(n, globals.currency)
  const fmtShort = (n: number) => fmtCurrencyShort(n, globals.currency)

  // Build calculation-friendly figures (sorted desc by value)
  const sortedCalcs = [...workflowCalcs].sort(
    (a, b) => b.annualValue - a.annualValue,
  )

  return {
    workflows: workflowCalcs,
    totalMonthlyHours: Math.round(totalMonthlyHours),
    totalAnnualHours: Math.round(totalAnnualHours),
    summary: {
      totalAnnualHours: Math.round(totalAnnualHours),
      totalAnnualHours24mo: hrs24,
      totalAnnualHours36mo: hrs36,
      operationalDividend12mo: od12,
      profitUplift12mo: pu12,
      totalFinancialGain12mo: tf12,
      operationalDividend24mo: od24,
      profitUplift24mo: pu24,
      totalFinancialGain24mo: tf24,
      operationalDividend36mo: od36,
      profitUplift36mo: pu36,
      totalFinancialGain36mo: tf36,
      implCost: adjImplCost,
      monthlyTooling: globals.monthlyToolingCost,
      paybackMonths: adjPayback,
    },
    figures: {
      totalMonthlyHours: addCommas(Math.round(totalMonthlyHours)),
      totalAnnualHours: addCommas(Math.round(totalAnnualHours)),
      statFTE: (totalAnnualHours / 2080).toFixed(1),
      operationalDividend12mo: fmtCur(od12),
      profitUplift12mo: fmtCur(pu12),
      totalFinancialGain12mo: fmtCur(tf12),
      totalFinancialGainShort: fmtShort(tf12),
      workflowLines: sortedCalcs.map(
        (w) =>
          `${w.name}: ${addCommas(w.monthlyHours)} hrs/mo freed, ${fmtCur(
            w.annualValue,
          )}/yr`,
      ),
    },
  }
}
