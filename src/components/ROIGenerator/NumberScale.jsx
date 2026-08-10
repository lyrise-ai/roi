import clsx from 'clsx'

// Shared 1-5 rating control for the alpha tour's inline feedback questions
// (intake ease, trust before/after, report clarity). One component so all
// four read as the same product control rather than four one-off pickers.
//
// `variant="dark"` is for placement on the navy "starting guess" card.
// `align` should match the surrounding question's own text alignment so the
// two read as one unit — 'left' everywhere except the dark card, whose
// question is centered.
//
// The block is width-locked to its own content (`w-fit`), never the parent's
// full width, and the label row is a plain 2-item `justify-between` inside
// that same fit-content box — so the end labels land exactly on the box
// group's own outer edges, not spread across whatever container it sits in.
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
