import type * as React from 'react'

/** Circular single-glyph control for toolbars, cards and dialog dismissals. */
export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'ghost' | 'outline' | 'solid'
  size?: 'sm' | 'md' | 'lg'
  /** Accessible name — required, since the button has no text. */
  label: string
  children?: React.ReactNode
}
export function IconButton(props: IconButtonProps): JSX.Element
