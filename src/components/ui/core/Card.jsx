import React from 'react'

export function Card({
  tone = 'default',
  interactive,
  padding = 'var(--space-6)',
  children,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false)
  const tones = {
    default: {
      background: 'var(--surface-card)',
      border: '1px solid var(--border-subtle)',
      color: 'var(--text-body)',
    },
    subtle: {
      background: 'var(--surface-subtle)',
      border: '1px solid var(--border-subtle)',
      color: 'var(--text-body)',
    },
    accent: {
      background: 'var(--surface-accent-subtle)',
      border: '1px solid var(--purple-200)',
      color: 'var(--text-body)',
    },
    inverse: {
      background: 'var(--surface-inverse)',
      border: '1px solid rgba(255,255,255,.12)',
      color: 'rgba(255,255,255,.78)',
      // Headings default to the dark --text-heading; hand them this tone's
      // colour instead. See tokens/base.css.
      '--heading-ink': 'currentColor',
    },
  }[tone]
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        borderRadius: 'var(--radius-card)',
        padding,
        boxShadow:
          hover && interactive ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        transform: hover && interactive ? 'translateY(-2px)' : 'none',
        cursor: interactive ? 'pointer' : undefined,
        transition:
          'box-shadow var(--duration-base) var(--ease-out),transform var(--duration-base) var(--ease-out)',
        ...tones,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  )
}
