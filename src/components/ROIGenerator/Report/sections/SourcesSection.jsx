import { useState } from 'react'
import StatusPill from '../shared/StatusPill'

const FILTERS = ['All', 'Validated', 'Needs validation', 'Industry standard']

export default function SourcesSection({ sources }) {
  const [filter, setFilter] = useState('All')
  const filtered =
    filter === 'All' ? sources : sources.filter((s) => s.status === filter)

  return (
    <div className="rounded-[14px] border border-[#E5E7EB] bg-white px-[30px] py-[26px]">
      <div className="mb-1 text-base font-bold text-[#0F172A]">
        Sources &amp; assumptions
      </div>
      <div className="mb-4 text-[13px] text-[#9CA3AF]">
        Every modeling input, traceable to where it came from. Review this
        before your validation session.
      </div>
      <div className="mb-[18px] flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const count =
            f === 'All'
              ? sources.length
              : sources.filter((s) => s.status === f).length
          const isActive = filter === f
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full border px-[13px] py-[7px] text-xs font-semibold ${
                isActive
                  ? 'border-[#5B48F8] bg-[#5B48F8] text-white'
                  : 'border-[#E5E7EB] bg-white text-[#4B5563]'
              }`}
            >
              {f} ({count})
            </button>
          )
        })}
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-2.5">
        {filtered.map((src, i) => (
          <div
            key={i}
            className="rounded-[10px] border border-[#F0F1F3] bg-[#F9FAFB] px-[15px] py-[13px]"
          >
            <div className="mb-1 text-[12.5px] font-bold text-[#0F172A]">
              {src.input}
            </div>
            <div className="mb-2 text-xs text-[#4B5563]">{src.detail}</div>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] text-[#9CA3AF]">
                {src.sourceLabel}
              </div>
              <StatusPill id={`src-${i}`} status={src.status} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
