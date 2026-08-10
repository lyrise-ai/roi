import React from 'react'

export function GlassPanel({
  tone = 'light',
  padding = 'var(--space-6)',
  blur = true,
  children,
  style,
  ...rest
}) {
  const light = {
    background: 'var(--glass-fill)',
    border: 'var(--glass-border)',
    color: 'var(--dark-blue)',
  }
  const dark = {
    background: 'var(--glass-fill-dark)',
    border: 'var(--glass-border-dark)',
    color: 'rgba(255,255,255,.86)',
    // Headings default to the dark --text-heading; hand them this tone's
    // colour instead. See tokens/base.css.
    '--heading-ink': 'currentColor',
  }
  return (
    <div
      style={{
        borderRadius: 'var(--radius-glass)',
        padding,
        boxShadow: 'var(--shadow-glass)',
        backdropFilter: blur ? 'var(--glass-blur)' : undefined,
        WebkitBackdropFilter: blur ? 'var(--glass-blur)' : undefined,
        ...(tone === 'dark' ? dark : light),
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  )
}
