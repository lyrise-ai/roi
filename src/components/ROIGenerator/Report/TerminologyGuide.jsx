import { useEffect, useRef, useState } from 'react'
import { GLOSSARY_TERMS } from './glossary'

// Toolbar "Terminology Guide" button + dropdown. Self-contained (owns its own
// open state and the click-outside-to-close behavior) so the toolbar just
// renders <TerminologyGuide triggerRef={...} /> and forgets about it.
export default function TerminologyGuide({ triggerRef }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Terminology Guide"
        className="flex h-8 items-center gap-1.5 rounded-full border border-[#e2e8f0] bg-white px-3 text-[13px] font-medium text-[#374151] hover:bg-[#F9FAFB]"
      >
        📖 <span className="hidden sm:inline">Terminology Guide</span>
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+10px)] z-[90] w-80 rounded-2xl border border-[#E5E7EB] bg-white py-1.5 shadow-[0_16px_40px_rgba(15,23,42,0.18)]">
          <div className="border-b border-[#F3F4F6] px-[18px] py-3 text-[13px] font-bold text-[#0F172A]">
            📖 Terminology Guide
          </div>
          <div className="max-h-[360px] overflow-y-auto px-[18px] py-2.5">
            {GLOSSARY_TERMS.map(({ term, def }) => (
              <div
                key={term}
                className="border-b border-[#F9FAFB] py-2.5 last:border-b-0"
              >
                <div className="text-[12.5px] font-bold text-[#0F172A]">
                  {term}
                </div>
                <div className="mt-0.5 text-xs leading-relaxed text-[#6B7280]">
                  {def}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
