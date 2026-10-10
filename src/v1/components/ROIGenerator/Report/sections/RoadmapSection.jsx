export default function RoadmapSection({ phases, pilotRecommendation }) {
  return (
    <div className="rounded-[14px] border border-[#E5E7EB] bg-white px-[30px] py-[26px]">
      <div className="mb-3 text-base font-bold text-[#0F172A]">
        Recommended starting point
      </div>
      <div className="mb-[26px] rounded-r-[10px] border-l-[3px] border-[#5B48F8] bg-[#F5F3FF] px-[18px] py-3.5 text-[13px] leading-[1.65] text-[#3B2E82]">
        {pilotRecommendation}
      </div>

      <div className="mb-[18px] text-base font-bold text-[#0F172A]">
        Implementation roadmap
      </div>
      <div className="relative pl-[26px]">
        <div className="absolute bottom-1.5 left-[6px] top-1.5 w-0.5 bg-[#E5E7EB]" />
        {phases.map((phase) => (
          <div key={phase.weeks} className="relative pb-[22px] last:pb-0">
            <div className="absolute -left-[26px] top-0.5 h-3.5 w-3.5 rounded-full border-[3px] border-[#EDE9FE] bg-[#5B48F8]" />
            <div className="mb-0.5 text-[11px] font-bold uppercase tracking-[0.05em] text-[#5B48F8]">
              {phase.weeks}
            </div>
            <div className="mb-1 text-[13.5px] font-bold text-[#0F172A]">
              {phase.phase}
            </div>
            <div className="text-[12.5px] leading-[1.6] text-[#4B5563]">
              {phase.activities}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
