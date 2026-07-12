import clsx from 'clsx'
import { fmtNumber } from '../../Report/format'
import WorkflowAdjustRow from '../WorkflowAdjustRow'

export default function VolumeStep({ wizard, onBack, onContinue }) {
  const kept = wizard.keptWorkflows
  const remaining = kept.filter(
    (w) => !wizard.decisions[w.name]?.volumeAnswer,
  ).length
  const canContinue = remaining === 0

  return (
    <div>
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#5B48F8]">
        Step 2 of 4 — Volume
      </div>
      <h2 className="mb-1.5 text-[22px] font-extrabold text-[#0F172A]">
        Is the monthly volume accurate for each workflow?
      </h2>
      <p className="mb-5 text-[13.5px] leading-[1.6] text-[#6B7280]">
        This is how many times each workflow runs per month today. Confirm, or
        tell us if it should be higher or lower.
      </p>

      <div className="mb-5 flex flex-col gap-2.5">
        {kept.map((w) => {
          const d = wizard.decisions[w.name] ?? {}
          const adjustedVolume = Math.max(
            1,
            Math.round(w.monthlyVolume * (1 + (d.volumePct || 0) / 100)),
          )
          return (
            <WorkflowAdjustRow
              key={w.name}
              name={w.name}
              agent={w.agentName}
              valueLabel={`${fmtNumber(adjustedVolume)}/mo`}
              answer={d.volumeAnswer}
              pct={d.volumePct || 0}
              onSame={() => wizard.setVolumeAnswer(w.name, 'same')}
              onIncrease={() => wizard.setVolumeAnswer(w.name, 'increase')}
              onDecrease={() => wizard.setVolumeAnswer(w.name, 'decrease')}
              onBumpUp={() => wizard.bumpVolumePct(w.name, 5)}
              onBumpDown={() => wizard.bumpVolumePct(w.name, -5)}
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
            Continue — Duration
          </button>
        </div>
      </div>
    </div>
  )
}
