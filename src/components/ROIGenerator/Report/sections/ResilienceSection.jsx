import Tooltip from '../shared/Tooltip'
import { resilienceDimDef } from '../shared/statusMeta'

export default function ResilienceSection({ rows }) {
  return (
    <div className="rounded-[14px] border border-[#E5E7EB] bg-white px-[30px] py-[26px]">
      <div className="mb-1 text-base font-bold text-[#0F172A]">
        Resilience positioning
      </div>
      <div className="mb-[18px] text-[13px] text-[#9CA3AF]">
        The gap between automated and manual operations compounds over time.
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3.5">
        {rows.map((r) => (
          <div
            key={r.dimension}
            className="rounded-xl border border-[#E5E7EB] px-[18px] py-4"
          >
            <div className="mb-2.5 flex items-center gap-1.5">
              <div className="text-[12.5px] font-bold text-[#0F172A]">
                {r.dimension}
              </div>
              <Tooltip
                id={`res-${r.dimension}`}
                def={resilienceDimDef(r.dimension)}
              >
                <span className="flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full bg-[#F3F4F6] text-[8.5px] font-bold text-[#6B7280]">
                  ?
                </span>
              </Tooltip>
            </div>
            <div className="mb-[7px] rounded-lg bg-[#ECFDF5] px-[11px] py-2.5">
              <div className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-[#059669]">
                Act now
              </div>
              <div className="text-xs leading-[1.5] text-[#065F46]">
                {r.act_now}
              </div>
            </div>
            <div className="rounded-lg bg-[#FFFBEB] px-[11px] py-2.5">
              <div className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-[#D97706]">
                Defer
              </div>
              <div className="text-xs leading-[1.5] text-[#92400E]">
                {r.defer}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
