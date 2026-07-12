import { useReportUI } from '../ReportUIContext'
import AssumptionPopover from '../shared/AssumptionPopover'
import { fmtCurrency } from '../format'

function LeverRow({ index, lever }) {
  const { openLever, setOpenLever } = useReportUI()
  const isOpen = openLever === index

  return (
    <div className="mb-2.5 rounded-xl border border-[#E5E7EB] bg-white">
      <button
        type="button"
        onClick={() => setOpenLever((cur) => (cur === index ? null : index))}
        className="flex w-full items-center justify-between gap-3.5 px-[18px] py-[15px] text-left"
      >
        <div className="min-w-0">
          <div className="text-[13.5px] font-bold text-[#0F172A]">
            {lever.name}
          </div>
          <div className="mt-0.5 text-[11.5px] text-[#9CA3AF]">
            from {lever.derivedFrom}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <div className="text-[14.5px] font-bold text-[#5B48F8]">
            {lever.valueLabel}
          </div>
          <div className="w-3.5 text-center text-[11px] text-[#9CA3AF]">
            {isOpen ? '▴' : '▾'}
          </div>
        </div>
      </button>
      {isOpen && (
        <div className="mt-0.5 border-t border-[#F3F4F6] px-[18px] pb-[18px] pt-1">
          <div className="mt-3.5 flex flex-col gap-2.5">
            <div>
              <div className="mb-1 text-[11px] font-bold text-[#0F172A]">
                Baseline
              </div>
              <div className="text-[12.5px] leading-[1.55] text-[#4B5563]">
                {lever.baseline}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[11px] font-bold text-[#0F172A]">
                AI agent action
              </div>
              <div className="text-[12.5px] leading-[1.55] text-[#4B5563]">
                {lever.aiAction}
              </div>
            </div>
          </div>
          <div className="mt-3 rounded-[7px] bg-[#F5F3FF] px-[11px] py-[7px] text-[11.5px] text-[#4B5563]">
            {lever.arithmetic}
          </div>
        </div>
      )}
    </div>
  )
}

export default function ProfitUpliftSection({
  levers,
  leverTotal,
  odVsPu,
  currency,
}) {
  return (
    <div className="rounded-[14px] border border-[#E5E7EB] bg-white px-[30px] py-[26px]">
      <div className="mb-1 text-base font-bold text-[#0F172A]">
        Profit uplift analysis
      </div>
      <div className="mb-[18px] text-[13px] text-[#9CA3AF]">
        Downstream revenue and margin gains from redirecting recaptured
        capacity. Click a lever for the full arithmetic.
      </div>

      {levers.map((l, i) => (
        <LeverRow key={l.name} index={i} lever={l} />
      ))}

      <div className="my-[18px] grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3.5">
        <div className="rounded-[10px] border border-[#F0F1F3] bg-[#F9FAFB] px-4 py-3.5">
          <div className="mb-1 text-[10.5px] font-bold uppercase text-[#9CA3AF]">
            Operational Dividend
          </div>
          <div className="text-base font-bold text-[#0F172A]">
            {fmtCurrency(odVsPu.od, currency)}
          </div>
        </div>
        <div className="rounded-[10px] border border-[#F0F1F3] bg-[#F9FAFB] px-4 py-3.5">
          <div className="mb-1 text-[10.5px] font-bold uppercase text-[#9CA3AF]">
            Profit Uplift
          </div>
          <div className="text-base font-bold text-[#5B48F8]">
            {fmtCurrency(odVsPu.pu, currency)}
          </div>
        </div>
      </div>
      <div className="mb-5 flex h-3 overflow-hidden rounded-full">
        <div className="bg-[#0F172A]" style={{ width: odVsPu.odPct }} />
        <div className="bg-[#5B48F8]" style={{ width: odVsPu.upliftPct }} />
      </div>

      <div className="flex items-center justify-between rounded-xl bg-[#0F172A] px-5 py-4">
        <div className="text-[12.5px] font-semibold text-white/60">
          Annual incremental profit (per year)
        </div>
        <AssumptionPopover
          id="lever-total"
          formula={leverTotal.formula}
          steps={leverTotal.steps}
          result={leverTotal.result}
          placement="bottom-right"
          width={270}
        >
          <span className="border-b-2 border-dashed border-[rgba(196,181,253,0.5)] text-sm font-bold text-[#C9BFFF]">
            {leverTotal.value}
          </span>
        </AssumptionPopover>
      </div>
    </div>
  )
}
