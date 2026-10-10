export default function NextStepsSection({ ctaParagraph, recipientLine }) {
  return (
    <div className="rounded-[14px] bg-[#0B1528] px-[34px] py-[30px] text-white">
      <div className="mb-2.5 text-base font-bold">Next steps</div>
      <div className="mb-[18px] text-[13.5px] leading-[1.7] text-white/65">
        {ctaParagraph}
      </div>
      <div className="mb-[26px] flex flex-wrap gap-2.5">
        <a
          href="https://api.leadconnectorhq.com/widget/bookings/strategy-call-with-lyrisesivto9"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded-lg bg-[#5B48F8] px-[22px] py-[11px] text-[13.5px] font-semibold text-white hover:bg-[#4A3CE8]"
        >
          Book validation session →
        </a>
        <a
          href="mailto:elena@lyrise.ai"
          className="inline-block rounded-lg border border-white/25 px-[22px] py-[11px] text-[13.5px] font-semibold text-white hover:bg-white/[0.06]"
        >
          elena@lyrise.ai
        </a>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3.5 border-t border-white/10 pt-5">
        <div>
          <div className="text-[13px] font-bold">Elena Easton</div>
          <div className="mt-0.5 text-xs text-white/50">
            Head of Operations · lyrise.ai
          </div>
        </div>
        <div className="text-[11.5px] text-white/35">
          This report is confidential and prepared exclusively for{' '}
          {recipientLine}. All projections are estimates — verify independently
          before acting.
        </div>
      </div>
    </div>
  )
}
