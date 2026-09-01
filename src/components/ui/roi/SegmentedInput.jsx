import React from 'react'

/* Three equal-weight ways to answer one number question.
   Equal weight is the whole point: the segments are identical in size, weight
   and colour, no option carries an icon, a badge or a "recommended" hint, and
   the AI path is never the shortest label. If "Let AI estimate" ever looks
   easier than "Exact", the estimates stop being challenged. */

/* TODO(agent) — 'exact' and 'range' are free-text boxes: whatever the user
   types lands as a string and is read by a regex in
   src/lib/roi/v2/answerBridge.ts, which rejects most of the ways people write
   a number ("70k a year", "about a third", "1.5 days"). That parse belongs to
   an agent; see the TODO(agent) block in answerBridge.ts. */

const MODES = [
  { value: 'exact', label: 'Exact' },
  { value: 'range', label: 'A range' },
  { value: 'estimate', label: 'Let AI estimate' },
]

const SOURCE_LABELS = {
  scraped: 'Scraped',
  benchmarked: 'Benchmarked',
  estimated: 'Estimated',
}

function Field({ prefix, suffix, ...rest }) {
  const [focus, setFocus] = React.useState(false)
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flex: 1,
        minWidth: 0,
        background: 'var(--surface-card)',
        borderRadius: 'var(--radius-field)',
        border:
          '1px solid ' +
          (focus ? 'var(--lyrise-purple)' : 'var(--border-subtle)'),
        boxShadow: focus ? '0 0 0 3px var(--focus-ring)' : 'none',
        padding: '0 14px',
        transition: 'var(--transition-control)',
      }}
    >
      {prefix && (
        <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>
          {prefix}
        </span>
      )}
      <input
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          flex: 1,
          minWidth: 0,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          padding: '13px 0',
          font: 'var(--type-body)',
          color: 'var(--text-heading)',
        }}
        {...rest}
      />
      {suffix && (
        <span
          style={{
            font: 'var(--weight-regular) var(--text-sm)/1 var(--font-body)',
            color: 'var(--text-muted)',
          }}
        >
          {suffix}
        </span>
      )}
    </div>
  )
}

export function SegmentedInput({
  label,
  hint,
  prefix,
  suffix,
  placeholder,
  value = {},
  onChange,
  estimate,
  estimateBasis,
  estimateSource = 'estimated',
  estimateLoading = false,
  escapeLabel = "I'll give the real number",
  onEscape,
  bands,
  style,
  ...rest
}) {
  const mode = value.mode || 'exact'

  const set = (patch) => {
    if (!onChange) return
    const nextMode = patch.mode || mode
    onChange({ mode: nextMode, ...patch })
  }

  const DEFAULT_BANDS = [
    { label: 'under 20', low: 0, high: 20 },
    { label: '20–100', low: 20, high: 100 },
    { label: '100–500', low: 100, high: 500 },
    { label: '500 or more', low: 500, high: 1000 },
  ]
  const activeBands = bands || DEFAULT_BANDS

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        ...style,
      }}
      {...rest}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{ font: 'var(--type-label)', color: 'var(--text-heading)' }}
        >
          {label}
        </span>
        {hint && (
          <span
            style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}
          >
            {hint}
          </span>
        )}
      </div>

      <div
        role="radiogroup"
        aria-label={label}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 4,
          padding: 3,
          background: 'var(--surface-subtle)',
          borderRadius: 'var(--radius-pill)',
        }}
      >
        {MODES.map((m) => {
          const selected = mode === m.value
          return (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => set({ mode: m.value })}
              style={{
                border: 0,
                cursor: 'pointer',
                padding: '8px 12px',
                borderRadius: 'var(--radius-pill)',
                font: 'var(--type-label)',
                textAlign: 'center',
                background: selected ? 'var(--surface-card)' : 'transparent',
                color: selected ? 'var(--text-heading)' : 'var(--text-muted)',
                boxShadow: selected ? 'var(--shadow-xs)' : 'none',
                transition: 'var(--transition-control)',
              }}
            >
              {m.label}
            </button>
          )
        })}
      </div>

      {mode === 'exact' && (
        <Field
          prefix={prefix}
          suffix={suffix}
          placeholder={placeholder}
          value={value.exact || ''}
          onChange={(e) => set({ exact: e.target.value })}
        />
      )}

      {mode === 'range' && (
        <div
          role="radiogroup"
          aria-label={`${label || 'Range'} options`}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
            gap: 8,
          }}
        >
          {activeBands.map((b) => {
            const labelStr = typeof b === 'string' ? b : b.label
            const lowVal = typeof b === 'string' ? undefined : b.low
            const highVal = typeof b === 'string' ? undefined : b.high
            const isSelected =
              value.band === labelStr ||
              (value.low === lowVal &&
                value.high === highVal &&
                lowVal !== undefined)
            return (
              <button
                key={labelStr}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() =>
                  set({
                    mode: 'range',
                    band: labelStr,
                    low: lowVal,
                    high: highVal,
                  })
                }
                style={{
                  border:
                    '1px solid ' +
                    (isSelected
                      ? 'var(--lyrise-purple)'
                      : 'var(--border-subtle)'),
                  cursor: 'pointer',
                  padding: '9px 12px',
                  borderRadius: 'var(--radius-field)',
                  font: 'var(--type-label)',
                  textAlign: 'center',
                  background: 'var(--surface-card)',
                  color: isSelected
                    ? 'var(--text-heading)'
                    : 'var(--text-muted)',
                  boxShadow: isSelected
                    ? '0 0 0 1px var(--lyrise-purple)'
                    : 'none',
                  transition: 'var(--transition-control)',
                }}
              >
                {labelStr}
              </button>
            )
          })}
        </div>
      )}

      {mode === 'estimate' && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            padding: '16px 18px',
            background: 'var(--purple-50)',
            border: '1px solid var(--purple-100)',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          {estimateLoading ? (
            <span
              style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}
            >
              Looking&hellip;
            </span>
          ) : (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'wrap',
                }}
              >
                <span
                  style={{
                    font: 'var(--weight-extrabold) var(--text-xl)/1 var(--font-display)',
                    letterSpacing: 'var(--tracking-tight)',
                    color: 'var(--text-heading)',
                  }}
                >
                  {estimate}
                </span>
                <span
                  style={{
                    font: 'var(--weight-semibold) var(--text-2xs)/1 var(--font-body)',
                    letterSpacing: 'var(--tracking-caps)',
                    textTransform: 'uppercase',
                    background: 'var(--purple-100)',
                    color: 'var(--purple-700)',
                    padding: '5px 9px',
                    borderRadius: 'var(--radius-pill)',
                  }}
                >
                  {SOURCE_LABELS[estimateSource] || estimateSource}
                </span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    font: 'var(--weight-regular) var(--text-xs)/1 var(--font-body)',
                    color: 'var(--text-muted)',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 'var(--radius-pill)',
                      border: '1px solid var(--neutral-400)',
                    }}
                  />
                  Not confirmed by you
                </span>
              </div>
              {estimateBasis && (
                <p
                  style={{
                    margin: 0,
                    font: 'var(--weight-regular) var(--text-xs)/1.5 var(--font-body)',
                    color: 'var(--text-muted)',
                    maxWidth: '52ch',
                    textWrap: 'pretty',
                  }}
                >
                  {estimateBasis}
                </p>
              )}
              <button
                type="button"
                onClick={escape}
                style={{
                  alignSelf: 'flex-start',
                  marginTop: 2,
                  background: 'transparent',
                  border: '1px solid var(--lyrise-purple)',
                  color: 'var(--lyrise-purple)',
                  borderRadius: 'var(--radius-pill)',
                  padding: '8px 16px',
                  font: 'var(--weight-semibold) var(--text-sm)/1 var(--font-body)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'var(--transition-control)',
                }}
              >
                {escapeLabel}
              </button>
            </>
          )}
        </div>
      )}

      {hint && (
        <span
          style={{
            font: 'var(--weight-regular) var(--text-xs)/1.4 var(--font-body)',
            color: 'var(--text-muted)',
          }}
        >
          {hint}
        </span>
      )}
    </div>
  )
}
