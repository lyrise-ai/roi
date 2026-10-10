export default function PatternSection({ text }) {
  if (!text) return null
  return (
    <div className="rounded-[14px] border border-[#E5E7EB] bg-white px-[30px] py-[26px]">
      <div className="mb-2.5 text-base font-bold text-[#0F172A]">
        The pattern underneath
      </div>
      <div className="text-sm leading-[1.7] text-[#4B5563]">{text}</div>
    </div>
  )
}
