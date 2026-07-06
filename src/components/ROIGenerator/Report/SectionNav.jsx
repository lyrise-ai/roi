import { useReportUI } from './ReportUIContext'
import { NAV_ITEMS } from './navItems'

// Left sidebar — jumps the center scroll column to a section; highlights the
// item matching activeSection (scroll-spy, computed by ReportContent).
export default function SectionNav() {
  const { activeSection, scrollToSection } = useReportUI()

  return (
    <nav className="h-full overflow-y-auto bg-white px-2.5 py-[22px]">
      <div className="mb-2.5 px-3 text-[10.5px] font-bold uppercase tracking-[0.09em] text-[#9CA3AF]">
        On this page
      </div>
      {NAV_ITEMS.map((item) => {
        const isActive = activeSection === item.key
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => scrollToSection(item.key)}
            className={`mb-0.5 block w-full rounded-lg px-3 py-[9px] text-left text-[12.5px] font-semibold transition-colors ${
              isActive
                ? 'bg-[#F5F3FF] text-[#5B48F8]'
                : 'bg-transparent text-[#4B5563] hover:bg-[#F9FAFB]'
            }`}
          >
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}
