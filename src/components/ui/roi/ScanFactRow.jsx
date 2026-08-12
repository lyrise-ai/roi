import React from 'react'
import { Icon } from '../core/Icon'

/* One verified fact from the company scan, with the source always in view.
   Built for stacking: hairline between rows, no card per fact, so a panel of
   eight reads as a list rather than eight boxes.
   The design system draws the tick as the literal ✓ character because its
   preview harness has no icon set; here we have one, so this uses the Icon
   primitive (P11) and picks up its stroke weight with everything else.

   `stacked` is the same row in a column narrow enough that fact, value and
   source can't share a line — the interview's scan panel. Wrapping three
   columns would interleave them; stacking keeps the reading order. */

export function ScanFactRow({
  fact,
  value,
  source,
  sourceUrl,
  verified = true,
  last = false,
  stacked = false,
  style,
  ...rest
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 'var(--space-3)',
        padding: '11px 0',
        borderBottom: last ? 'none' : '1px solid var(--border-subtle)',
        ...style,
      }}
      {...rest}
    >
      {verified ? (
        <span
          style={{
            flex: '0 0 auto',
            width: 14,
            display: 'inline-flex',
            justifyContent: 'center',
            color: 'var(--lyrise-purple)',
          }}
        >
          <Icon name="check" size={14} strokeWidth={2.5} />
        </span>
      ) : (
        <span
          aria-hidden="true"
          style={{
            flex: '0 0 auto',
            width: 14,
            display: 'inline-flex',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 'var(--radius-pill)',
              border: '1px solid var(--neutral-400)',
            }}
          />
        </span>
      )}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: stacked ? 'column' : 'row',
          alignItems: stacked ? 'flex-start' : 'baseline',
          gap: stacked ? 2 : 'var(--space-3)',
        }}
      >
        <span
          style={{
            flex: stacked ? 'none' : '0 0 34%',
            font: 'var(--weight-regular) var(--text-xs)/1.4 var(--font-body)',
            color: 'var(--text-muted)',
          }}
        >
          {fact}
        </span>
        <span
          style={{
            flex: stacked ? 'none' : 1,
            minWidth: 0,
            font: 'var(--weight-semibold) var(--text-sm)/1.4 var(--font-body)',
            color: verified ? 'var(--text-heading)' : 'var(--text-muted)',
          }}
        >
          {value}
        </span>
        {source && (
          <span
            style={{
              flex: '0 0 auto',
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
      </div>
    </div>
  )
}
