import { useState } from 'react'
import clsx from 'clsx'

// One overview KPI tile + a self-contained hover/click definition tooltip.
// Intentionally does not depend on Report/shared/Tooltip.jsx (which is wired
// to ReportUIContext) — the wizard is a separate tree from ReportViewer, so it
// carries its own tiny local tooltip instead.
export default function KpiTile({ label, value, sub, definition, accent }) {
  const [open, setOpen] = useState(false)

  return (
    <div
      className={clsx(
        'rounded-xl border px-4 py-3.5',
        accent
          ? 'border-[rgba(91,72,248,0.4)] bg-[rgba(91,72,248,0.18)]'
          : 'border-white/10 bg-white/5',
      )}
    >
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-[#9AA7C4]">
        <span>{label}</span>
        {definition && (
          <span className="relative inline-flex">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              onMouseEnter={() => setOpen(true)}
              onMouseLeave={() => setOpen(false)}
              className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white/15 text-[8.5px] font-bold text-white"
            >
              ?
            </button>
            {open && (
              <div className="absolute left-0 top-[calc(100%+8px)] z-[60] w-[220px] rounded-lg bg-white px-3 py-2.5 text-left text-xs font-normal normal-case leading-[1.55] tracking-normal text-[#374151] shadow-[0_10px_26px_rgba(0,0,0,0.3)]">
                {definition}
              </div>
            )}
          </span>
        )}
      </div>
      <div className="text-[22px] font-extrabold text-white">{value}</div>
      {sub && (
        <div className="mt-1 text-[10.5px] leading-[1.4] text-white/50">
          {sub}
        </div>
      )}
    </div>
  )
}
