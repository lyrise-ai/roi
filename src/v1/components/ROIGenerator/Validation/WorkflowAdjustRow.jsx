import clsx from 'clsx'

// Shared row for VolumeStep and DurationStep: Same/Increase/Decrease + a ±5%
// stepper once a direction is chosen.
export default function WorkflowAdjustRow({
  name,
  agent,
  valueLabel,
  answer,
  pct,
  onSame,
  onIncrease,
  onDecrease,
  increaseLabel = 'Increase',
  decreaseLabel = 'Decrease',
  onBumpUp,
  onBumpDown,
}) {
  const chip = (active) =>
    clsx(
      'flex-1 rounded-lg border px-2.5 py-2 text-xs font-semibold',
      active
        ? 'border-[#5B48F8] bg-[#F5F3FF] text-[#5B48F8]'
        : 'border-[#E5E7EB] bg-white text-[#374151]',
    )

  return (
    <div
      className={clsx(
        'rounded-xl border bg-white px-4 py-3.5',
        answer ? 'border-[#E5E7EB]' : 'border-[#FCD34D]',
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-bold text-[#0F172A]">
            {name}
          </div>
          <div className="truncate text-[11px] text-[#9CA3AF]">{agent}</div>
        </div>
        <div className="shrink-0 text-[13px] font-bold text-[#5B48F8]">
          {valueLabel}
        </div>
      </div>
      <div className="mb-2.5 flex gap-2">
        <button
          type="button"
          onClick={onSame}
          className={chip(answer === 'same')}
        >
          Same
        </button>
        <button
          type="button"
          onClick={onIncrease}
          className={chip(answer === 'increase')}
        >
          {increaseLabel}
        </button>
        <button
          type="button"
          onClick={onDecrease}
          className={chip(answer === 'decrease')}
        >
          {decreaseLabel}
        </button>
      </div>
      {(answer === 'increase' || answer === 'decrease') && (
        <div className="flex items-center gap-2.5 rounded-lg bg-[#F9FAFB] px-3 py-2">
          <button
            type="button"
            onClick={onBumpDown}
            className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md border border-[#D1D5DB] bg-white text-sm"
          >
            −
          </button>
          <span className="min-w-[110px] text-center text-xs font-semibold text-[#374151]">
            {pct > 0 ? '+' : ''}
            {pct}%
          </span>
          <button
            type="button"
            onClick={onBumpUp}
            className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md border border-[#D1D5DB] bg-white text-sm"
          >
            +
          </button>
        </div>
      )}
    </div>
  )
}
