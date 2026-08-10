import React from 'react'
import * as Lu from 'react-icons/lu'

/* The brand supplies no icon set — the design system substitutes Lucide (see
   readme.md ICONOGRAPHY). Upstream hydrated <i data-lucide> nodes from a CDN
   `window.lucide`; there is no such global here, so we resolve against
   react-icons/lu, which is the same Lucide set and already a dependency.
   Kebab names stay the public API: 'arrow-right' -> LuArrowRight.

   react-icons 4.10 predates Lucide's big rename, so use the OLD names:
   `alert-circle` not `circle-alert`, `more-horizontal` not `ellipsis`,
   `bar-chart-3` not `chart-no-axes-column`. An unknown name renders nothing
   and warns in dev — check the console before hunting a layout bug.

   ponytail: namespace import pulls the whole Lucide set into the bundle;
   swap to explicit named imports per icon if bundle size starts to matter. */
const exportName = (name) =>
  'Lu' + String(name).replace(/(^|-)([a-z0-9])/g, (_, __, c) => c.toUpperCase())

export function Icon({
  name,
  size = 20,
  strokeWidth = 2,
  color = 'currentColor',
  style,
  ...rest
}) {
  const Glyph = Lu[exportName(name)]
  if (!Glyph) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn(`<Icon name="${name}"> is not in this Lucide build.`)
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
