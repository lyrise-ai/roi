import StatusPill from '../shared/StatusPill'

export default function CompanySnapshotSection({ facts }) {
  return (
    <div className="rounded-[14px] border border-[#E5E7EB] bg-white px-[30px] py-[26px]">
      <div className="mb-1 text-base font-bold text-[#0F172A]">
        Company snapshot
      </div>
      <div className="mb-[18px] text-[13px] text-[#9CA3AF]">
        What we know about your company, and where each fact came from. Hover a
        tag for what it means.
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-2.5">
        {facts.map((fact, i) => (
          <div
            key={i}
            className="flex items-start justify-between gap-3 rounded-[10px] border border-[#F0F1F3] bg-[#F9FAFB] px-4 py-[13px]"
          >
            <div className="text-[13px] leading-[1.5] text-[#111827]">
              {fact.text}
            </div>
            <StatusPill
              id={`snap-${i}`}
              status={fact.status}
              className="shrink-0"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
