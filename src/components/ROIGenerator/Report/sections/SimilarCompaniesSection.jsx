export default function SimilarCompaniesSection({ companies }) {
  if (!companies?.length) return null
  return (
    <div className="rounded-[14px] border border-[#E5E7EB] bg-white px-[30px] py-[26px]">
      <div className="mb-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#9CA3AF]">
        Results we&apos;ve delivered for similar companies
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-[18px]">
        {companies.map((co) => (
          <div
            key={co.client}
            className="rounded-xl border border-[#F0F1F3] bg-[#F9FAFB] px-5 py-[18px]"
          >
            <div className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#9CA3AF]">
              {co.industry}
            </div>
            <div className="mb-0.5 text-sm font-bold text-[#0F172A]">
              {co.client}
            </div>
            <div className="mb-2.5 text-[15px] font-bold text-[#5B48F8]">
              {co.headline}
            </div>
            {co.results.map((b) => (
              <div key={b} className="mb-1 text-[12.5px] text-[#4B5563]">
                › {b}
              </div>
            ))}
            <div className="mt-3 border-t border-[#E5E7EB] pt-3">
              <div className="text-xs italic leading-[1.55] text-[#6B7280]">
                &quot;{co.quote}&quot;
              </div>
              <div className="mt-1.5 text-[11.5px] text-[#9CA3AF]">
                {co.author}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
