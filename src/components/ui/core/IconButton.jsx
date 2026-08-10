import React from 'react'

const sizes = { sm: 32, md: 40, lg: 48 }

export function IconButton({
  variant = 'ghost',
  size = 'md',
  label,
  disabled,
  children,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false)
  const base = {
    ghost: {
      background: 'transparent',
      color: 'var(--text-body)',
      border: '1px solid transparent',
    },
    outline: {
      background: 'var(--surface-card)',
      color: 'var(--text-heading)',
      border: '1px solid var(--border-subtle)',
    },
    solid: {
      background: 'var(--lyrise-purple)',
      color: 'var(--text-inverse)',
      border: '1px solid var(--lyrise-purple)',
    },
  }[variant]
  const hov = {
    ghost: { background: 'var(--neutral-100)' },
    outline: {
      borderColor: 'var(--lyrise-purple)',
      color: 'var(--lyrise-purple)',
    },
    solid: {
      background: 'var(--purple-700)',
      borderColor: 'var(--purple-700)',
    },
  }[variant]
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: sizes[size],
        height: sizes[size],
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 'var(--radius-pill)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'var(--transition-control)',
        ...base,
        ...(hover && !disabled ? hov : null),
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  )
}
