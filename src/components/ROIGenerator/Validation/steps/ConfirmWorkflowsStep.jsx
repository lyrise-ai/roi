import { useState } from 'react'
import clsx from 'clsx'
import { fmtCurrency } from '../../Report/format'

export default function ConfirmWorkflowsStep({
  wizard,
  currency,
  onSendChat,
  onBack,
  onContinue,
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [addText, setAddText] = useState('')

  const submitAdd = () => {
    const text = addText.trim()
    if (!text) return
    onSendChat(
      `Validation wizard: the user identified an additional workflow we missed: "${text}". Estimate its monthly volume and time-per-item, then call add_workflow with your best estimate based on the company context, then stop.`,
    )
    setAddText('')
    setShowAdd(false)
  }

  return (
    <div>
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#5B48F8]">
        Step 1 of 4 — Priorities
      </div>
      <h2 className="mb-1.5 text-[22px] font-extrabold text-[#0F172A]">
        Are these the right workflows to focus on first?
      </h2>
      <p className="mb-5 text-[13.5px] leading-[1.6] text-[#6B7280]">
        We ranked these by monthly value recaptured. Confirm, remove, or add
        before we build the rest of the model on top of them.
      </p>

      <div className="mb-5 flex gap-2.5">
        <button
          type="button"
          onClick={() => wizard.setWorkflowsAnswer('yes')}
          className={clsx(
            'flex-1 rounded-[10px] border-[1.5px] px-4 py-2.5 text-[13px] font-semibold',
            wizard.workflowsAnswer === 'yes'
              ? 'border-[#5B48F8] bg-[#F5F3FF] text-[#5B48F8]'
              : 'border-[#E5E7EB] bg-white text-[#374151]',
          )}
        >
          ✓ Yes, these are right
        </button>
        <button
          type="button"
          onClick={() => wizard.setWorkflowsAnswer('no')}
          className={clsx(
            'flex-1 rounded-[10px] border-[1.5px] px-4 py-2.5 text-[13px] font-semibold',
            wizard.workflowsAnswer === 'no'
              ? 'border-[#5B48F8] bg-[#F5F3FF] text-[#5B48F8]'
              : 'border-[#E5E7EB] bg-white text-[#374151]',
          )}
        >
          I want to make changes
        </button>
      </div>

      <div className="mb-4 flex flex-col gap-2.5">
        {wizard.baseline.map((w, i) => {
          const kept = wizard.decisions[w.name]?.kept !== false
          const calc = wizard.liveCalcOutput?.workflows?.find(
            (c) => c.name === w.name,
          )
          const valueLabel = calc
            ? fmtCurrency(
                Math.round(calc.monthlyHours * calc.effectiveRate),
                currency,
              )
            : '—'
          return (
            <div
              key={w.name}
              className={clsx(
                'flex items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3.5',
                kept ? 'border-[#E5E7EB]' : 'border-[#FCE0E0] opacity-55',
              )}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="shrink-0 text-[13px] font-bold text-[#5B48F8]">
                  #{i + 1}
                </span>
                <div className="min-w-0">
                  <div
                    className={clsx(
                      'truncate text-[13.5px] font-bold text-[#0F172A]',
                      !kept && 'line-through',
                    )}
                  >
                    {w.name}
                  </div>
                  <div className="truncate text-[11.5px] text-[#9CA3AF]">
                    {w.agentName} · {valueLabel}/mo
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => wizard.toggleKeep(w.name)}
                className={clsx(
                  'shrink-0 rounded-lg px-3.5 py-1.5 text-xs font-semibold',
                  kept
                    ? 'bg-[#FEF2F2] text-[#DC2626]'
                    : 'bg-[#ECFDF5] text-[#059669]',
                )}
              >
                {kept ? 'Remove' : 'Removed — undo'}
              </button>
            </div>
          )
        })}
      </div>

      {showAdd ? (
        <div className="mb-5 flex gap-2 rounded-xl border border-dashed border-[#D1D5DB] bg-[#F9FAFB] px-4 py-3.5">
          <input
            value={addText}
            onChange={(e) => setAddText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitAdd()}
            placeholder="e.g. Client onboarding checklist"
            className="flex-1 rounded-[7px] border border-[#E5E7EB] px-3 py-2 text-[13px] outline-none"
          />
          <button
            type="button"
            onClick={submitAdd}
            className="rounded-[7px] bg-[#0F172A] px-4 py-2 text-[12.5px] font-semibold text-white"
          >
            Add
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="mb-6 text-[13px] font-semibold text-[#5B48F8]"
        >
          + Add a workflow we missed
        </button>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-[10px] border border-[#E5E7EB] px-5 py-3 text-[13.5px] text-[#6B7280]"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={onContinue}
          disabled={!wizard.workflowsAnswer}
          className={clsx(
            'rounded-[10px] px-6 py-3 text-[13.5px] font-bold text-white',
            wizard.workflowsAnswer
              ? 'cursor-pointer bg-[#5B48F8]'
              : 'cursor-not-allowed bg-[#D1D5DB]',
          )}
        >
          Continue — Volume
        </button>
      </div>
    </div>
  )
}
