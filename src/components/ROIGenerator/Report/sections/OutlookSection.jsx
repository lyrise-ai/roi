import Tooltip from '../shared/Tooltip'
import AssumptionPopover from '../shared/AssumptionPopover'

const GROWTH_DEF =
  'Year 2 and Year 3 project cumulative Operational Dividend and Profit Uplift, reflecting ramp-up speed and process maturity over time.'

function OutlookBar({ id, data }) {
  return (
    <div className="relative flex h-full flex-1 flex-col items-center justify-end">
      <AssumptionPopover
        id={id}
        formula={data.formula}
        steps={data.steps}
        result={data.result}
        placement="top-center"
        width={270}
        triggerClassName="flex w-full max-w-[90px] flex-col overflow-hidden rounded-t-lg"
        triggerStyle={{ height: data.heightPx }}
      >
        <span
          className="bg-[#5B48F8]"
          style={{ flex: data.upliftShare || 1 }}
        />
        <span className="bg-[#0F172A]" style={{ flex: data.odShare || 1 }} />
      </AssumptionPopover>
      <div className="mt-2.5 text-[13px] font-bold text-[#0F172A]">
        {data.total}
      </div>
      <div className="mt-0.5 text-[11.5px] text-[#9CA3AF]">{data.year}</div>
    </div>
  )
}

export default function OutlookSection({ outlook }) {
  return (
    <div className="rounded-[14px] border border-[#E5E7EB] bg-white px-[30px] py-[26px]">
      <div className="mb-1 flex items-center gap-1.5">
        <div className="text-base font-bold text-[#0F172A]">
          3-year financial outlook
        </div>
        <Tooltip id="growth-def" def={GROWTH_DEF}>
          <span className="flex h-[15px] w-[15px] cursor-help items-center justify-center rounded-full bg-[#EDE9FE] text-[9px] font-bold text-[#5B48F8]">
            ?
          </span>
        </Tooltip>
      </div>
      <div className="mb-[22px] text-[13px] text-[#9CA3AF]">
        Cumulative totals — click a bar for the growth-factor math.
      </div>

      <div className="flex h-[210px] items-end gap-7 px-2.5 pb-[30px]">
        <OutlookBar id="year1" data={outlook.year1} />
        <OutlookBar id="year2" data={outlook.year2} />
        <OutlookBar id="year3" data={outlook.year3} />
      </div>
      <div className="flex gap-[18px] text-[11.5px] text-[#9CA3AF]">
        <span>
          <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[2px] bg-[#0F172A]" />
          Operational Dividend
        </span>
        <span>
          <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[2px] bg-[#5B48F8]" />
          Profit Uplift
        </span>
      </div>
    </div>
  )
}
