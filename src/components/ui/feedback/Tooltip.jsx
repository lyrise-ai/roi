import React from 'react'

export function Tooltip({ label, placement = 'top', children }) {
  const [show, setShow] = React.useState(false)
  const pos = {
    top: { bottom: '100%', left: '50%', transform: 'translate(-50%,-8px)' },
    bottom: { top: '100%', left: '50%', transform: 'translate(-50%,8px)' },
    left: { right: '100%', top: '50%', transform: 'translate(-8px,-50%)' },
    right: { left: '100%', top: '50%', transform: 'translate(8px,-50%)' },
  }[placement]
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      <span
        role="tooltip"
        style={{
          position: 'absolute',
          ...pos,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          background: 'var(--dark-blue)',
          color: '#fff',
          padding: '7px 11px',
          borderRadius: 'var(--radius-sm)',
          font: 'var(--weight-regular) var(--text-xs)/1 var(--font-body)',
          boxShadow: 'var(--shadow-md)',
          opacity: show ? 1 : 0,
          transition: 'opacity var(--duration-fast) var(--ease-out)',
          zIndex: 40,
        }}
      >
        {label}
      </span>
    </span>
  )
}
