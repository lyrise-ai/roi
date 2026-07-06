import { useEffect, useRef } from 'react'
import { useReportUI } from '../ReportUIContext'

// Click-to-reveal "how we calculated this" popover. Wraps a clickable trigger
// (a headline number, a totals row, an outlook bar) — only one popover is
// open at a time (shared openAssumption key in ReportUIContext); clicking the
// same trigger again, or clicking anywhere outside, closes it.
export default function AssumptionPopover({
  id,
  formula,
  steps = [],
  result,
  children,
  placement = 'bottom-left', // 'bottom-left' | 'bottom-right' | 'top-center'
  width = 290,
  triggerClassName = '',
  triggerStyle,
}) {
  const { openAssumption, setOpenAssumption } = useReportUI()
  const isOpen = openAssumption === id
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return undefined
    const onPointerDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpenAssumption((cur) => (cur === id ? null : cur))
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [isOpen, id, setOpenAssumption])

  const toggle = () => setOpenAssumption((cur) => (cur === id ? null : id))

  const posClass =
    placement === 'bottom-right'
      ? 'top-[calc(100%+12px)] right-0'
      : placement === 'top-center'
        ? 'bottom-[calc(100%+12px)] left-1/2 -translate-x-1/2'
        : 'top-[calc(100%+12px)] left-0'

  return (
    <span ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={toggle}
        style={triggerStyle}
        className={`m-0 cursor-pointer appearance-none border-0 bg-transparent p-0 text-inherit ${triggerClassName}`}
      >
        {children}
      </button>
      {isOpen && (
        <div
          className={`absolute z-[70] rounded-xl bg-white p-4 text-left text-[#0F172A] shadow-[0_16px_40px_rgba(0,0,0,0.3)] ${posClass}`}
          style={{ width }}
        >
          <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#5B48F8]">
            How we calculated this
          </div>
          <div className="mb-2.5 rounded-lg bg-[#F5F3FF] px-2.5 py-2 text-[11.5px] text-[#4B5563]">
            {formula}
          </div>
          {steps.map((step, i) => (
            <div
              key={i}
              className="relative mb-1 pl-[13px] text-xs text-[#374151]"
            >
              <span className="absolute left-0 text-[#C4B5FD]">›</span>
              {step}
            </div>
          ))}
          <div className="mt-2 border-t border-[#F3F4F6] pt-2.5 text-[13px] font-bold">
            = {result}
          </div>
        </div>
      )}
    </span>
  )
}
