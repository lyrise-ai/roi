import React from 'react'

export function Tag({ removable, onRemove, children, style, ...rest }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        background: 'var(--surface-card)',
        border: '1px solid var(--border-subtle)',
        color: 'var(--text-body)',
        padding: removable ? '5px 6px 5px 12px' : '6px 12px',
        borderRadius: 'var(--radius-pill)',
        font: 'var(--weight-regular) var(--text-sm)/1 var(--font-body)',
        ...style,
      }}
      {...rest}
    >
      {children}
      {removable && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove"
          style={{
            width: 18,
            height: 18,
            display: 'grid',
            placeItems: 'center',
            border: 'none',
            borderRadius: 'var(--radius-pill)',
            background: 'var(--neutral-100)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            font: '600 12px/1 var(--font-body)',
          }}
        >
          ×
        </button>
      )}
    </span>
  )
}
