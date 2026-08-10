import type * as React from 'react'

/** Neutral outlined chip for taxonomy — skills, systems, departments. */
export interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  removable?: boolean
  onRemove?: () => void
  children?: React.ReactNode
}
export function Tag(props: TagProps): JSX.Element
