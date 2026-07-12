import { useReportUI } from '../ReportUIContext'

// Hover-triggered floating definition box. `children` is the trigger element
// (a "?" badge, a status pill, etc.) — only one tooltip is "active" at a time
// via the shared hoveredTip key in ReportUIContext, keyed by `id`.
export default function Tooltip({
  id,
  def,
  children,
  placement = 'bottom',
  align = 'left',
  variant = 'dark',
  width = 220,
}) {
  const { hoveredTip, setHoveredTip } = useReportUI()
  const isOpen = hoveredTip === id

  const posStyle =
    placement === 'top'
      ? { bottom: 'calc(100% + 8px)' }
      : { top: 'calc(100% + 8px)' }
  const alignStyle = align === 'right' ? { right: 0 } : { left: 0 }

  const variantClass =
    variant === 'light'
      ? 'bg-white text-[#374151] shadow-[0_10px_26px_rgba(0,0,0,0.3)]'
      : 'bg-[#0F172A] text-white shadow-[0_10px_26px_rgba(0,0,0,0.25)]'

  return (
    <span className="relative inline-flex shrink-0">
      <span
        onMouseEnter={() => setHoveredTip(id)}
        onMouseLeave={() => setHoveredTip((cur) => (cur === id ? null : cur))}
      >
        {children}
      </span>
      {isOpen && (
        <div
          className={`absolute z-[60] rounded-lg px-3 py-2.5 text-xs leading-[1.55] text-left ${variantClass}`}
          style={{ width, ...posStyle, ...alignStyle }}
        >
          {def}
        </div>
      )}
    </span>
  )
}
