import Tooltip from './Tooltip'
import { statusStyle, statusDef } from './statusMeta'

// Colored status pill (Validated/Scraped/Benchmarked/Assumed/Needs
// validation/Industry standard/Provided) that doubles as a hover-tooltip
// trigger explaining what the status means.
export default function StatusPill({
  id,
  status,
  label,
  align = 'right',
  className = '',
}) {
  const { bg, fg } = statusStyle(status)
  return (
    <Tooltip id={id} def={statusDef(status)} align={align}>
      <span
        className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold cursor-help ${className}`}
        style={{ background: bg, color: fg }}
      >
        {label ?? status}
      </span>
    </Tooltip>
  )
}
