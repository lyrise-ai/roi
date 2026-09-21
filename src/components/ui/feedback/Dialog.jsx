import React from 'react'

export function Dialog({
  open,
  title,
  description,
  onClose,
  footer,
  width = 480,
  children,
}) {
  if (!open) return null
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'grid',
        placeItems: 'center',
        padding: 'clamp(var(--space-3), 3vw, var(--space-6))',
      }}
    >
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,34,.55)',
          backdropFilter: 'blur(6px)',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: width,
          maxHeight: 'calc(100dvh - var(--space-8))',
          overflowY: 'auto',
          background: 'var(--surface-card)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-lg)',
          padding: 'clamp(var(--space-5), 5vw, var(--space-8))',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 'var(--space-4)',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
              flex: 1,
            }}
          >
            {title && (
              <h3
                style={{
                  font: 'var(--type-h3)',
                  color: 'var(--text-heading)',
                  margin: 0,
                }}
              >
                {title}
              </h3>
            )}
            {description && (
              <p
                style={{
                  font: 'var(--type-body)',
                  color: 'var(--text-muted)',
                  margin: 0,
                }}
              >
                {description}
              </p>
            )}
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                width: 'var(--space-10)',
                height: 'var(--space-10)',
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                background: 'var(--neutral-100)',
                borderRadius: 'var(--radius-pill)',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                font: 'var(--weight-semibold) var(--text-lg)/1 var(--font-body)',
              }}
            >
              ×
            </button>
          )}
        </div>
        {children}
        {footer && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 'var(--space-3)',
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
