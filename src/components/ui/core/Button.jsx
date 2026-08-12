import React from 'react'

const sizes = {
  sm: {
    padding: '8px 16px',
    font: 'var(--weight-semibold) var(--text-sm)/1 var(--font-body)',
    gap: '6px',
  },
  md: {
    padding: '13px 26px',
    font: 'var(--weight-semibold) var(--text-base)/1 var(--font-body)',
    gap: '8px',
  },
  lg: {
    padding: '17px 34px',
    font: 'var(--weight-semibold) var(--text-md)/1 var(--font-body)',
    gap: '10px',
  },
}

const variants = {
  primary: {
    background: 'var(--lyrise-purple)',
    color: 'var(--text-inverse)',
    border: '1px solid var(--lyrise-purple)',
    boxShadow: 'var(--shadow-accent)',
  },
  secondary: {
    background: 'transparent',
    color: 'var(--lyrise-purple)',
    border: '1px solid var(--lyrise-purple)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--text-heading)',
    border: '1px solid transparent',
  },
  inverse: {
    background: 'var(--neutral-0)',
    color: 'var(--dark-blue)',
    border: '1px solid var(--neutral-0)',
  },
  glass: {
    background: 'var(--glass-fill)',
    color: 'var(--dark-blue)',
    border: 'var(--glass-border)',
    backdropFilter: 'var(--glass-blur)',
    WebkitBackdropFilter: 'var(--glass-blur)',
    boxShadow: 'var(--shadow-sm)',
  },
}

const hovers = {
  primary: {
    background: 'var(--purple-700)',
    borderColor: 'var(--purple-700)',
  },
  secondary: { background: 'var(--purple-50)' },
  ghost: { background: 'var(--neutral-100)' },
  inverse: {
    background: 'var(--brand-grey)',
    borderColor: 'var(--brand-grey)',
  },
  glass: {
    background:
      'linear-gradient(135deg,rgba(255,255,255,.75),rgba(255,255,255,.4))',
  },
}

/* `href` renders an <a> in the same chrome. A navigation dressed as a button
   still has to be a link: middle-click, open-in-new-tab and "copy link"
   are the difference between a control and a dead end. Wrapping the <button>
   in an <a> instead would nest interactive content, which is invalid.

   `as` swaps in something that renders its own anchor — `as={Link}` for an
   internal route, which is what `@next/next/no-html-link-for-pages` asks for
   and what keeps the navigation client-side. */
export function Button({
  variant = 'primary',
  size = 'md',
  disabled,
  fullWidth,
  iconLeft,
  iconRight,
  children,
  style,
  href,
  as: As,
  ...rest
}) {
  const [hover, setHover] = React.useState(false)
  const [press, setPress] = React.useState(false)
  const Tag = As || (href ? 'a' : 'button')
  return (
    <Tag
      href={href}
      type={href ? undefined : 'button'}
      disabled={href ? undefined : disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false)
        setPress(false)
      }}
      onMouseDown={() => setPress(true)}
      onMouseUp={() => setPress(false)}
      style={{
        display: fullWidth ? 'flex' : 'inline-flex',
        width: fullWidth ? '100%' : undefined,
        alignItems: 'center',
        justifyContent: 'center',
        ...sizes[size],
        borderRadius: 'var(--radius-control)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        textDecoration: 'none',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        transition: 'var(--transition-control)',
        letterSpacing: 'var(--tracking-snug)',
        ...variants[variant],
        ...(hover && !disabled ? hovers[variant] : null),
        transform: press && !disabled ? 'scale(var(--press-scale))' : 'none',
        opacity: disabled ? 0.4 : 1,
        ...style,
      }}
      {...rest}
    >
      {iconLeft}
      {children}
      {iconRight}
    </Tag>
  )
}
