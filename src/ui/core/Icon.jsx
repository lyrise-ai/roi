import React from 'react'
import {
  LuAlertCircle,
  LuArrowRight,
  LuArrowUp,
  LuBarChart3,
  LuCheck,
  LuChevronDown,
  LuClock,
  LuInfo,
  LuLoader,
  LuLock,
  LuMoreHorizontal,
  LuPencil,
  LuPlay,
  LuPlus,
  LuSearch,
  LuTarget,
  LuTrash2,
  LuWand2,
  LuWorkflow,
  LuX,
} from 'react-icons/lu'

/* Lucide icons, by kebab name: <Icon name="arrow-right" />.

   Need a new one? Import it and add it to ICONS. Only listed icons ship to
   the browser; `import * as Lu` cost /v2 424 KB.

   react-icons 4.10 predates Lucide's big rename, so use the OLD names:
   `alert-circle` not `circle-alert`, `more-horizontal` not `ellipsis`,
   `bar-chart-3` not `chart-no-axes-column`. An unknown name renders nothing
   and warns in dev. */
const ICONS = {
  'alert-circle': LuAlertCircle,
  'arrow-right': LuArrowRight,
  'arrow-up': LuArrowUp,
  'bar-chart-3': LuBarChart3,
  check: LuCheck,
  'chevron-down': LuChevronDown,
  clock: LuClock,
  info: LuInfo,
  loader: LuLoader,
  lock: LuLock,
  'more-horizontal': LuMoreHorizontal,
  pencil: LuPencil,
  play: LuPlay,
  plus: LuPlus,
  search: LuSearch,
  target: LuTarget,
  'trash-2': LuTrash2,
  'wand-2': LuWand2,
  workflow: LuWorkflow,
  x: LuX,
}

export function Icon({
  name,
  size = 20,
  strokeWidth = 2,
  color = 'currentColor',
  style,
  ...rest
}) {
  const Glyph = ICONS[name]
  if (!Glyph) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn(`<Icon name="${name}"> is not in ICONS (Icon.jsx).`)
    }
    return null
  }
  return (
    <Glyph
      size={size}
      color={color}
      strokeWidth={strokeWidth}
      aria-hidden="true"
      style={{ flex: '0 0 auto', ...style }}
      {...rest}
    />
  )
}
