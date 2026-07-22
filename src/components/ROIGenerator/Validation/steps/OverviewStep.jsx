import { useMemo, useState } from 'react'
import { fmtCurrency, fmtCurrencyShort, fmtNumber } from '../../Report/format'
import { statusStyle, statusDef } from '../../Report/shared/statusMeta'
import {
  mergeWorkflows,
  reconcilingAdoptionFactor,
} from '@/src/lib/roi/pipeline/reportModel'
import KpiTile from '../KpiTile'
import NumberScale from '../../NumberScale'
import { INTER_FONT_FAMILY } from '@/src/utilities/fonts'

// Uses the same workflow merge/sort and reconciling adoption-ramp-factor as
// the PDF and web report (reportModel.ts) — the wizard only has `workflows`
// + `calcOutput` in scope (no company/copy yet), not a full ReportState, so
// it can't use buildReportModel() directly.
function buildOverviewRows(workflowInputs, calcOutput, currency) {
  if (!calcOutput) return []
  return mergeWorkflows(workflowInputs, calcOutput.workflows).map((w) => {
    const beforeHrs = w.minutesPerItemBefore / 60
    const afterHrs = w.minutesPerItemAfter / 60
    const monthlyValue = Math.round(w.monthlyHours * w.effectiveRate)
    return {
      name: w.name,
      agent: w.agentName,
      before: beforeHrs,
      after: afterHrs,
      hrsSaved: Math.round(w.monthlyHours),
      valueLabel: fmtCurrency(monthlyValue, currency),
      status: w.userValidated
        ? 'Validated'
        : w.sourceType === 'user_stated'
          ? 'Provided'
          : w.sourceType === 'research_derived'
            ? 'Scraped'
            : 'Benchmarked',
      targetOutcome: w.expectedOutcome,
      formula: `${fmtNumber(w.monthlyVolume)}/mo × ${(beforeHrs - afterHrs).toFixed(2)} hrs × ${fmtCurrency(w.effectiveRate, currency)}/hr × ${reconcilingAdoptionFactor(w).toFixed(2)} adoption ramp factor = ${fmtCurrency(monthlyValue, currency)}/mo`,
    }
  })
}

function OverviewRow({ row }) {
  const [open, setOpen] = useState(false)
  const { bg, fg } = statusStyle(row.status)

  return (
    <div className="mb-2.5 rounded-xl border border-[#E5E7EB] bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3.5 px-[18px] py-[15px] text-left"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-[7px] w-[7px] shrink-0 rounded-full bg-[#5B48F8]" />
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-bold text-[#0F172A]">
              {row.name}
            </div>
            <div className="mt-0.5 truncate text-[11.5px] text-[#9CA3AF]">
              {row.agent}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-[22px]">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.04em] text-[#9CA3AF]">
              hrs saved/mo
            </div>
            <div className="text-sm font-bold text-[#0F172A]">
              {row.hrsSaved}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.04em] text-[#9CA3AF]">
              value/mo
            </div>
            <div className="text-[14.5px] font-bold text-[#5B48F8]">
              {row.valueLabel}
            </div>
          </div>
          <div className="w-3.5 text-center text-[11px] text-[#9CA3AF]">
            {open ? '▴' : '▾'}
          </div>
        </div>
      </button>
      {open && (
        <div className="border-t border-[#F3F4F6] px-[18px] pb-5 pt-3.5">
          <div className="mb-2.5 text-[12.5px] leading-[1.55] text-[#4B5563]">
            <span className="font-bold text-[#0F172A]">
              What the agent does:{' '}
            </span>
            {row.targetOutcome}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-[#F3F4F6] pt-3.5">
            <div className="rounded-[7px] bg-[#F5F3FF] px-[11px] py-[7px] text-[11.5px] text-[#4B5563]">
              {row.formula}
            </div>
            <span
              title={statusDef(row.status)}
              className="shrink-0 cursor-help whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold"
              style={{ background: bg, color: fg }}
            >
              {row.status}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export default function OverviewStep({
  wizard,
  currency,
  onStart,
  isAlpha,
  reportId,
}) {
  const rows = useMemo(
    () => buildOverviewRows(wizard.baseline, wizard.liveCalcOutput, currency),
    [wizard.baseline, wizard.liveCalcOutput, currency],
  )
  const s = wizard.liveCalcOutput?.summary
  const [trustBefore, setTrustBefore] = useState(0)

  // Alpha tour tracking — one tap, fire-and-forget. Never blocks starting
  // the wizard: not awaited, errors only go to console.
  const rateTrustBefore = (value) => {
    setTrustBefore(value)
    if (!isAlpha) return
    try {
      const token = localStorage.getItem('alpha_token')
      if (!token) return
      fetch('/api/alpha/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_token: token,
          report_id: reportId,
          trust_before: value,
        }),
      })
        .then((res) => {
          if (!res.ok) {
            console.error('[alpha] trust_before tracking failed:', res.status)
          }
        })
        .catch((err) => {
          console.error('[alpha] trust_before tracking failed:', err)
        })
    } catch (err) {
      console.error('[alpha] trust_before tracking failed:', err)
    }
  }

  return (
    <div>
      <div className="mb-[18px] rounded-2xl bg-[#0B1528] px-9 py-8 text-white">
        <div className="mb-3 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#7C8CB0]">
          Confidential · Prepared by LyRise AI
        </div>
        <h1 className="mb-2 text-[27px] font-extrabold leading-tight tracking-tight">
          AI Profit &amp; Productivity Report
        </h1>
        <div className="mb-4 rounded-lg border border-[rgba(91,72,248,0.3)] bg-[rgba(91,72,248,0.15)] px-3.5 py-2.5 text-[12.5px] leading-[1.55] text-[#C9BFFF]">
          ✨ This is a <strong className="text-white">preview</strong> built
          from public data and industry benchmarks. Confirm a few assumptions
          below to lock in your validated report — all figures are{' '}
          <strong className="text-white">per year</strong>.
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiTile
            label="Hours Returned / Yr"
            value={fmtNumber(s?.totalAnnualHours)}
            sub="hours/year your team gets back"
            definition="Total hours per year your team gets back once AI takes over the repetitive parts of the workflows below."
          />
          <KpiTile
            label="Operational Dividend"
            value={fmtCurrencyShort(s?.operationalDividend12mo, currency)}
            sub="cash value of the time saved"
            definition="Dollar value of the hours freed up, annualized from the workflow table below."
          />
          <KpiTile
            label="Profit Uplift"
            value={fmtCurrencyShort(s?.profitUplift12mo, currency)}
            sub="extra profit from reinvesting that time"
            definition="Additional profit created when freed hours get redirected into higher-value work."
          />
          <KpiTile
            label="Total Financial Gain"
            value={fmtCurrencyShort(s?.totalFinancialGain12mo, currency)}
            sub="everything on the table, per year"
            definition="Operational Dividend + Profit Uplift — the full annual value this plan projects."
            accent
          />
        </div>
      </div>

      <div className="mb-[18px] rounded-2xl border border-[#E5E7EB] bg-white px-[30px] py-[26px]">
        <div className="mb-1 text-base font-bold text-[#0F172A]">
          The workflows behind that number
        </div>
        <div className="mb-[18px] text-[13px] text-[#9CA3AF]">
          Ranked by monthly value. Tap any row to see how the number is worked
          out.
        </div>
        {rows.map((row) => (
          <OverviewRow key={row.name} row={row} />
        ))}
      </div>

      <div className="rounded-2xl bg-[#0B1528] px-8 py-[30px] text-center text-white">
        <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#7C8CB0]">
          This is just the skeleton
        </div>
        <div className="mb-2 text-lg font-extrabold">
          These numbers are a starting guess — not the truth yet.
        </div>
        <div className="mx-auto mb-6 max-w-[440px] text-[13.5px] leading-[1.65] text-[#9AA7C4]">
          Confirm what&apos;s real for your business in 4 quick steps.
        </div>

        {isAlpha && (
          <div className="mx-auto mb-6 max-w-[360px] border-t border-[rgba(124,140,176,0.25)] pt-6">
            <div
              style={{ fontFamily: INTER_FONT_FAMILY, letterSpacing: '-0.2px' }}
              className="mb-2 text-[14.5px] font-normal text-white"
            >
              Before you validate, how much do you trust these numbers?
            </div>
            <NumberScale
              value={trustBefore}
              onChange={rateTrustBefore}
              lowLabel="Not at all"
              highLabel="Completely"
              variant="dark"
              align="center"
            />
          </div>
        )}

        <button
          type="button"
          onClick={onStart}
          className="rounded-[10px] bg-[#5B48F8] px-8 py-3.5 text-[14.5px] font-bold text-white hover:bg-[#4A3CE8]"
        >
          Start validating — Step 1 of 4
        </button>
      </div>
    </div>
  )
}
