import clsx from 'clsx'

// The 1-to-5 rating control used by all four alpha-tour questions: how easy the
// form was, trust before and after, and how clear the report was. One component,
// so all four read as the same control rather than four separate pickers.
//
// The dark version is for the navy "starting guess" card.
// The alignment should match the question above it, so the two read as one
// block: left everywhere except on the dark card, whose question is centred.
//
// The whole block is exactly as wide as its own contents, never as wide as
// whatever it sits inside. The end labels sit at the two edges of that same
// fit-to-content box, so they line up with the outer boxes rather than
// spreading across the container.
export default function NumberScale({
  value = 0,
  onChange,
  lowLabel,
  highLabel,
  variant = 'light',
  align = 'left',
}) {
  const isDark = variant === 'dark'
  const mutedColor = isDark ? 'text-[#7C8CB0]' : 'text-[#9CA3AF]'

  return (
    <div className={clsx('w-fit', align === 'center' && 'mx-auto')}>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => {
          const selected = n === value
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              aria-label={`${n} out of 5`}
              aria-pressed={selected}
              className={clsx(
                'flex h-9 w-12 shrink-0 items-center justify-center rounded-[10px] text-[15px] font-semibold transition-colors',
                selected
                  ? 'bg-[#5B48F8] text-white shadow-sm'
                  : isDark
                    ? 'border border-white/15 bg-white/5 text-[#C9BFFF] hover:border-white/30 hover:bg-white/10'
                    : 'border border-[#E5E7EB] bg-white text-[#374151] hover:border-[#5B48F8]/40',
              )}
            >
              {n}
            </button>
          )
        })}
      </div>
      {(lowLabel || highLabel) && (
        <div className="mt-2 flex justify-between">
          <span className={clsx('text-[11px] leading-none', mutedColor)}>
            {lowLabel}
          </span>
          <span className={clsx('text-[11px] leading-none', mutedColor)}>
            {highLabel}
          </span>
        </div>
      )}
    </div>
  )
}
