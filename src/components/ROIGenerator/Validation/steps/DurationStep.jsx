import clsx from 'clsx'
import WorkflowAdjustRow from '../WorkflowAdjustRow'

export default function DurationStep({ wizard, onBack, onContinue }) {
  const kept = wizard.keptWorkflows
  const remaining = kept.filter(
    (w) => !wizard.decisions[w.name]?.durationAnswer,
  ).length
  const canContinue = remaining === 0

  return (
    <div>
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#5B48F8]">
        Step 3 of 4 — Duration
      </div>
      <h2 className="mb-1.5 text-[22px] font-extrabold text-[#0F172A]">
        How long does each workflow take today, before AI?
      </h2>
      <p className="mb-5 text-[13.5px] leading-[1.6] text-[#6B7280]">
        This is the time per iteration your team currently spends. Confirm, or
        adjust if it&apos;s more or less than modeled.
      </p>

      <div className="mb-5 flex flex-col gap-2.5">
        {kept.map((w) => {
          const d = wizard.decisions[w.name] ?? {}
          const adjustedHrs = Math.max(
            0.05,
            +(
              (w.minutesPerItemBefore / 60) *
              (1 + (d.durationPct || 0) / 100)
            ).toFixed(2),
          )
          return (
            <WorkflowAdjustRow
              key={w.name}
              name={w.name}
              agent={w.agentName}
              valueLabel={`${adjustedHrs} hrs/iter`}
              answer={d.durationAnswer}
              pct={d.durationPct || 0}
              increaseLabel="Takes longer"
              decreaseLabel="Takes less time"
              onSame={() => wizard.setDurationAnswer(w.name, 'same')}
              onIncrease={() => wizard.setDurationAnswer(w.name, 'increase')}
              onDecrease={() => wizard.setDurationAnswer(w.name, 'decrease')}
              onBumpUp={() => wizard.bumpDurationPct(w.name, 5)}
              onBumpDown={() => wizard.bumpDurationPct(w.name, -5)}
            />
          )
        })}
      </div>

      <div className="flex items-end justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-[10px] border border-[#E5E7EB] px-5 py-3 text-[13.5px] text-[#6B7280]"
        >
          ← Back
        </button>
        <div className="flex flex-col items-end gap-1.5">
          {!canContinue && (
            <span className="text-[11.5px] text-[#9CA3AF]">
              Answer {remaining} more workflow{remaining > 1 ? 's' : ''} to
              continue
            </span>
          )}
          <button
            type="button"
            onClick={onContinue}
            disabled={!canContinue}
            className={clsx(
              'rounded-[10px] px-6 py-3 text-[13.5px] font-bold text-white',
              canContinue
                ? 'cursor-pointer bg-[#5B48F8]'
                : 'cursor-not-allowed bg-[#D1D5DB]',
            )}
          >
            Continue — Final context
          </button>
        </div>
      </div>
    </div>
  )
}
