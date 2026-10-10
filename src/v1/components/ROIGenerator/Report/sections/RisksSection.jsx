export default function RisksSection({ risks }) {
  return (
    <div className="rounded-[14px] border border-[#E5E7EB] bg-white px-[30px] py-[26px]">
      <div className="mb-[18px] text-base font-bold text-[#0F172A]">
        Risks &amp; mitigations
      </div>
      {risks.map((risk, i) => (
        <div
          key={i}
          className="mb-2.5 rounded-xl border border-[#E5E7EB] px-[18px] py-4"
        >
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-[22px] w-[22px] items-center justify-center rounded-md bg-[#FEF3C7] text-xs font-bold text-[#B45309]">
              !
            </span>
            <div className="text-[13.5px] font-bold text-[#0F172A]">
              {risk.risk}
            </div>
          </div>
          <div className="mb-2.5 text-[12.5px] leading-[1.6] text-[#4B5563]">
            {risk.detail}
          </div>
          <div className="flex gap-2 rounded-lg bg-[#ECFDF5] px-[13px] py-2.5">
            <span className="shrink-0 font-bold text-[#059669]">✓</span>
            <div className="text-xs leading-[1.55] text-[#065F46]">
              {risk.mitigation}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
