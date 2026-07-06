import Tooltip from '../shared/Tooltip'
import AssumptionPopover from '../shared/AssumptionPopover'

const DELAY_DEF =
  'Approximate value left on the table for every month automation is postponed, derived from Year 1 total financial gain.'

export default function CostOfDelaySection({ costOfDelay }) {
  return (
    <div className="rounded-[14px] border border-[#FCE0E0] bg-[#FEF2F2] px-[30px] py-[26px]">
      <div className="mb-2.5 flex items-center gap-1.5">
        <div className="text-base font-bold text-[#0F172A]">Cost of delay</div>
        <Tooltip id="delay-def" def={DELAY_DEF}>
          <span className="flex h-[15px] w-[15px] cursor-help items-center justify-center rounded-full bg-[#FEE2E2] text-[9px] font-bold text-[#B91C1C]">
            ?
          </span>
        </Tooltip>
      </div>
      <div className="mb-2.5 inline-block">
        <AssumptionPopover
          id="cost-of-delay"
          formula={costOfDelay.formula}
          steps={costOfDelay.steps}
          result={costOfDelay.result}
          width={280}
          triggerClassName="flex items-baseline gap-1.5"
        >
          <span className="border-b-2 border-dashed border-[rgba(185,28,28,0.35)] text-[34px] font-extrabold text-[#B91C1C]">
            {costOfDelay.value}
          </span>
          <span className="text-sm text-[#9CA3AF]">/ month</span>
        </AssumptionPopover>
      </div>
      <div className="text-[13.5px] leading-[1.65] text-[#7F1D1D]">
        {costOfDelay.narrative}
      </div>
    </div>
  )
}
