import { useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import clsx from 'clsx'
import { VALIDATION_QUALIFY_MONTHLY_THRESHOLD } from '@/src/lib/roi/constants'
import { fmtCurrency } from '../../Report/format'

const BUDGET_OPTIONS = [
  { value: 'this_quarter', label: 'This quarter' },
  { value: 'next_quarter', label: 'Next quarter' },
  { value: 'exploring', label: 'Just exploring' },
]

export default function CompleteStep({ wizard, reportId, currency, isAlpha }) {
  const router = useRouter()
  const [status, setStatus] = useState('idle') // idle | saving | error

  const monthlyGain = Math.round(
    (wizard.liveCalcOutput?.summary?.totalFinancialGain12mo ?? 0) / 12,
  )
  const qualifies = monthlyGain >= VALIDATION_QUALIFY_MONTHLY_THRESHOLD
  const gap = VALIDATION_QUALIFY_MONTHLY_THRESHOLD - monthlyGain

  const removedCount = useMemo(
    () =>
      wizard.baseline.filter((w) => wizard.decisions[w.name]?.kept === false)
        .length,
    [wizard.baseline, wizard.decisions],
  )

  const finalize = async () => {
    if (status === 'saving') return
    setStatus('saving')
    try {
      const res = await fetch(`/api/reports/${reportId}/validate-finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowDecisions: wizard.decisions,
          additionalContext: wizard.additionalContext,
          feedback: wizard.feedback,
          budgetTiming: wizard.budgetTiming,
          xp: wizard.xp,
          skipped: false,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      // Alpha tour tracking — best-effort. Validation is already saved above;
      // this must never block or break navigation to the finished report.
      if (isAlpha) {
        try {
          const token = localStorage.getItem('alpha_token')
          if (token) {
            fetch('/api/alpha/progress', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                session_token: token,
                reached_validation: true,
                report_id: reportId,
                intent_timeline: wizard.budgetTiming || null,
              }),
            })
              .then((trackRes) => {
                if (!trackRes.ok) {
                  console.error(
                    '[alpha] validation tracking failed:',
                    trackRes.status,
                  )
                }
              })
              .catch((err) => {
                console.error('[alpha] validation tracking failed:', err)
              })
          }
        } catch (err) {
          console.error('[alpha] validation tracking failed:', err)
        }
      }

      router.push(`/report/${reportId}`)
    } catch (err) {
      console.error('[CompleteStep] finalize failed:', err)
      setStatus('error')
    }
  }

  return (
    <div className="text-center">
      <div className="mb-3.5 text-5xl">🎉</div>
      <h2 className="mb-2 text-2xl font-extrabold text-[#0F172A]">
        Your Profit Map is validated.
      </h2>
      <p className="mb-2 text-sm text-[#6B7280]">
        4 / 4 steps complete · {wizard.xp} / 40 XP earned
      </p>

      <div
        className={clsx(
          'mx-auto mb-5 max-w-[480px] rounded-xl border px-[18px] py-3.5 text-left',
          qualifies
            ? 'border-[#A7F3D0] bg-[#ECFDF5]'
            : 'border-[#FDE68A] bg-[#FFFBEB]',
        )}
      >
        <div
          className={clsx(
            'mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em]',
            qualifies ? 'text-[#059669]' : 'text-[#92400E]',
          )}
        >
          Fit-check result —{' '}
          {qualifies
            ? 'Workflow fit confirmed'
            : `Close to the bar — ${fmtCurrency(gap, currency)}/mo short`}
        </div>
        <div className="text-[13.5px] leading-[1.6] text-[#374151]">
          {qualifies
            ? `Validated value is ~${fmtCurrency(monthlyGain, currency)}/mo, above our qualification bar. These workflows are a strong candidate for a process-mapping engagement.`
            : `Validated value is ~${fmtCurrency(monthlyGain, currency)}/mo, against our ${fmtCurrency(VALIDATION_QUALIFY_MONTHLY_THRESHOLD, currency)}/mo qualification bar. Adding a workflow or confirming higher volume in the steps above could close the gap.`}
        </div>
      </div>

      <div className="mx-auto mb-5 max-w-[480px] rounded-xl border border-[#E5E7EB] bg-white px-6 py-[22px] text-left">
        <div className="mb-2.5 text-[13px] font-medium text-[#374151]">
          When would you want to move on process mapping for these workflows?
        </div>
        <div className="flex flex-wrap gap-2">
          {BUDGET_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => wizard.setBudgetTiming(opt.value)}
              className={clsx(
                'flex-1 rounded-lg border-[1.5px] px-2.5 py-2 text-xs font-semibold',
                wizard.budgetTiming === opt.value
                  ? 'border-[#5B48F8] bg-[#F5F3FF] text-[#5B48F8]'
                  : 'border-[#E5E7EB] bg-white text-[#374151]',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto mb-6 max-w-[480px] rounded-xl border border-[#E5E7EB] bg-white px-7 py-6 text-left">
        <div className="mb-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#9CA3AF]">
          What you confirmed
        </div>
        <div className="flex flex-col gap-2.5 text-[13px] text-[#374151]">
          <div className="flex gap-2">
            <span className="text-[#059669]">✓</span>
            <span>
              {wizard.keptWorkflows.length} workflow
              {wizard.keptWorkflows.length === 1 ? '' : 's'} kept as top
              priorities
              {removedCount > 0 ? ` (${removedCount} removed)` : ''}
            </span>
          </div>
          <div className="flex gap-2">
            <span className="text-[#059669]">✓</span>
            <span>Volume confirmed or adjusted for every workflow</span>
          </div>
          <div className="flex gap-2">
            <span className="text-[#059669]">✓</span>
            <span>Duration confirmed or adjusted for every workflow</span>
          </div>
          {wizard.additionalContext.trim() && (
            <div className="flex gap-2">
              <span className="text-[#059669]">✓</span>
              <span>Additional context added</span>
            </div>
          )}
        </div>
      </div>

      {status === 'error' && (
        <div className="mb-3 text-[13px] text-[#DC2626]">
          Something went wrong saving your validation — try again.
        </div>
      )}

      <button
        type="button"
        onClick={finalize}
        disabled={status === 'saving'}
        className="rounded-[10px] bg-[#5B48F8] px-8 py-3.5 text-[14.5px] font-bold text-white disabled:opacity-60"
      >
        {status === 'saving' ? 'Saving…' : 'View my full report →'}
      </button>
    </div>
  )
}
