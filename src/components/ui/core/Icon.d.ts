import type * as React from 'react'

/** Thin wrapper over the Lucide icon set (substituted — the brand ships no icon library). */
export interface IconProps {
  /** Lucide icon name in kebab-case, e.g. `arrow-right`, `check`, `workflow`. */
  name: string
  size?: number
  strokeWidth?: number
  color?: string
  style?: React.CSSProperties
}
export function Icon(props: IconProps): JSX.Element
