import React from 'react'

/* A researched suggestion offered next to the user's own input, and always
   visibly junior to it: dashed border, no fill, no shadow, small type.
   Three states, and the third one matters most:
   - resolved: the suggestion renders with its source and two actions;
   - loading: a quiet "Looking…" on the suggestion alone. It never disables or
     covers the field beside it — the user can always just type the answer;
   - empty / failed: renders nothing. An empty dashed box reads as broken. */

export function SuggestionBlock({
  state = 'resolved',
  label = 'From your website',
  suggestion,
  source,
  sourceUrl,
  actionLabel = 'Use this',
  onUse,
  dismissLabel = 'Not us',
  onDismiss,
  style,
  ...rest
}) {
  const [hoverUse, setHoverUse] = React.useState(false)
  const [hoverDismiss, setHoverDismiss] = React.useState(false)
  if (state === 'empty' || state === 'failed') return null
  if (state === 'resolved' && !suggestion) return null

  const shell = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    border: '1px dashed var(--purple-200)',
    borderRadius: 'var(--radius-lg)',
    background: 'transparent',
    padding: '14px 16px',
    ...style,
  }

  const eyebrow = (
    <span
      style={{
        font: 'var(--weight-semibold) var(--text-2xs)/1 var(--font-body)',
        letterSpacing: 'var(--tracking-caps)',
        textTransform: 'uppercase',
        color: 'var(--lyrise-purple)',
      }}
    >
      {label}
    </span>
  )

  if (state === 'loading') {
    return (
      <div aria-busy="true" style={shell} {...rest}>
        {eyebrow}
        <span
          style={{
            font: 'var(--weight-regular) var(--text-sm)/1.5 var(--font-body)',
            color: 'var(--text-muted)',
          }}
        >
          Looking&hellip;
        </span>
      </div>
    )
  }

  return (
    <div style={shell} {...rest}>
      {eyebrow}
      <p
        style={{
          margin: 0,
          font: 'var(--weight-regular) var(--text-sm)/1.55 var(--font-body)',
          color: 'var(--text-body)',
          textWrap: 'pretty',
        }}
      >
        {suggestion}
      </p>
      {source && (
        <span
          style={{
            font: 'var(--weight-regular) var(--text-xs)/1.4 var(--font-body)',
            color: 'var(--text-muted)',
          }}
        >
          {sourceUrl ? (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--text-link)' }}
            >
              {source}
            </a>
          ) : (
            source
          )}
        </span>
      )}
      {(onUse || onDismiss) && (
        <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
          {onUse && (
            <button
              type="button"
              onClick={onUse}
              onMouseEnter={() => setHoverUse(true)}
              onMouseLeave={() => setHoverUse(false)}
              style={{
                border: '1px solid var(--lyrise-purple)',
                background: hoverUse ? 'var(--purple-50)' : 'transparent',
                color: 'var(--lyrise-purple)',
                borderRadius: 'var(--radius-pill)',
                padding: '7px 15px',
                font: 'var(--weight-semibold) var(--text-xs)/1 var(--font-body)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'var(--transition-control)',
              }}
            >
              {actionLabel}
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              onMouseEnter={() => setHoverDismiss(true)}
              onMouseLeave={() => setHoverDismiss(false)}
              style={{
                border: '1px solid transparent',
                background: hoverDismiss ? 'var(--neutral-100)' : 'transparent',
                color: 'var(--text-heading)',
                borderRadius: 'var(--radius-pill)',
                padding: '7px 13px',
                font: 'var(--weight-semibold) var(--text-xs)/1 var(--font-body)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'var(--transition-control)',
              }}
            >
              {dismissLabel}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
