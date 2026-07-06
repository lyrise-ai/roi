import Tooltip from '../shared/Tooltip'
import AssumptionPopover from '../shared/AssumptionPopover'

function MetricCard({ id, metric, highlight = false }) {
  return (
    <div
      className={`rounded-xl border px-4 pb-[18px] pt-4 ${
        highlight
          ? 'border-[rgba(91,72,248,0.4)] bg-[rgba(91,72,248,0.18)]'
          : 'border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.05)]'
      }`}
    >
      <div
        className={`mb-2.5 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] ${
          highlight ? 'text-[#C9BFFF]' : 'text-[#9AA7C4]'
        }`}
      >
        <span>{metric.label}</span>
        <Tooltip id={`${id}-def`} def={metric.def} variant="light">
          <span className="flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full bg-white/15 text-[8.5px] font-bold text-white">
            ?
          </span>
        </Tooltip>
      </div>
      <AssumptionPopover
        id={id}
        formula={metric.formula}
        steps={metric.steps}
        result={metric.result}
        placement={highlight ? 'bottom-right' : 'bottom-left'}
        triggerClassName={`text-[27px] font-extrabold leading-[1.15] border-b-2 border-dashed ${
          highlight
            ? 'border-white/50 text-white'
            : 'border-white/35 text-white'
        }`}
      >
        {metric.value}
      </AssumptionPopover>
      <div
        className={`mt-1.5 text-[11.5px] ${highlight ? 'text-white/50' : 'text-white/45'}`}
      >
        {metric.sub}
      </div>
    </div>
  )
}

export default function HeroSection({
  hero,
  confidence,
  company,
  recipientLine,
  currentDate,
  currency,
}) {
  return (
    <div className="rounded-2xl bg-[#0B1528] px-[38px] py-[34px] text-white">
      <div className="mb-3.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#7C8CB0]">
        Confidential · Prepared by LyRise AI
      </div>
      <h1 className="mb-1.5 text-[29px] font-extrabold tracking-[-0.4px]">
        AI Profit &amp; Productivity Report
      </h1>
      <div className="mb-[18px] flex items-center gap-1.5">
        <span className="text-sm font-medium italic text-[#7BAFD4]">
          {confidence.label}
        </span>
        <Tooltip id="confidence-def" def={confidence.def} variant="light">
          <span className="flex h-[15px] w-[15px] cursor-help items-center justify-center rounded-full bg-white/[0.18] text-[9px] font-bold text-white">
            ?
          </span>
        </Tooltip>
      </div>
      <div className="flex flex-wrap gap-[22px] border-b border-white/10 pb-[18px] text-[12.5px] text-white/55">
        <span>
          Prepared for{' '}
          <strong className="font-semibold text-white">{recipientLine}</strong>
        </span>
        <span>
          Date &amp; currency{' '}
          <strong className="font-semibold text-white">
            {currentDate} · {currency?.code}
          </strong>
        </span>
      </div>

      <div className="mt-[22px] grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3.5">
        <MetricCard id="hero-hours" metric={hero.hours} />
        <MetricCard id="hero-od" metric={hero.od} />
        <MetricCard id="hero-uplift" metric={hero.uplift} />
        <MetricCard id="hero-total" metric={hero.total} highlight />
      </div>
    </div>
  )
}
