import React from 'react'

const tones = {
  success: ['var(--grow)', 'rgba(0,184,176,.10)'],
  error: ['var(--power)', 'rgba(238,49,36,.08)'],
  info: ['var(--lyrise-purple)', 'var(--purple-50)'],
}

export function Toast({
  tone = 'info',
  title,
  message,
  onDismiss,
  style,
  ...rest
}) {
  const [accent, bg] = tones[tone]
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-3)',
        background: 'var(--surface-card)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-md)',
        padding: 'var(--space-4)',
        minWidth: 280,
        maxWidth: 420,
        backgroundImage: 'linear-gradient(' + bg + ',' + bg + ')',
        ...style,
      }}
      {...rest}
    >
      <span
        style={{
          width: 8,
          height: 8,
          marginTop: 7,
          flex: '0 0 auto',
          borderRadius: 'var(--radius-pill)',
          background: accent,
        }}
      />
      <div
        style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}
      >
        {title && (
          <strong
            style={{ font: 'var(--type-label)', color: 'var(--text-heading)' }}
          >
            {title}
          </strong>
        )}
        {message && (
          <span
            style={{
              font: 'var(--weight-regular) var(--text-sm)/1.5 var(--font-body)',
              color: 'var(--text-muted)',
            }}
          >
            {message}
          </span>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            font: '600 14px/1 var(--font-body)',
          }}
        >
          ×
        </button>
      )}
    </div>
  )
}
