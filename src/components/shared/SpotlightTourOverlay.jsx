import { popoverPositionFor } from '@/src/lib/tourPopover'

// Draws one step of a tour: the dimmed background, the highlighted cut-out and
// the pop-up. Keeping track of which step we are on lives in
// src/hooks/useSpotlightTour.js. This component only draws, so it can be reused
// by any tour.
export default function SpotlightTourOverlay({
  tourRect,
  step,
  stepIndex,
  journeyLabels,
  isLastStep,
  onNext,
  onClose,
  onSkip,
  skipLabel = 'Skip',
  nextLabel = 'Next →',
  lastStepLabel = 'Got it',
  accentColor = '#5B48F8',
  glowColor = 'rgba(91, 72, 248, 0.55)',
  popoverWidth = 300,
}) {
  if (!tourRect) return null

  const dimStyle = {
    position: 'fixed',
    background: 'rgba(15, 23, 42, 0.72)',
    zIndex: 1000,
    transition: 'all 0.25s ease',
  }

  return (
    <>
      {/* The four dark panels that leave a hole around the highlighted
          element */}
      <div
        style={{
          ...dimStyle,
          top: 0,
          left: 0,
          right: 0,
          height: Math.max(0, tourRect.top - 6),
        }}
      />
      <div
        style={{
          ...dimStyle,
          top: tourRect.top + tourRect.height + 6,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      />
      <div
        style={{
          ...dimStyle,
          top: Math.max(0, tourRect.top - 6),
          left: 0,
          width: Math.max(0, tourRect.left - 6),
          height: tourRect.height + 12,
        }}
      />
      <div
        style={{
          ...dimStyle,
          top: Math.max(0, tourRect.top - 6),
          left: tourRect.left + tourRect.width + 6,
          right: 0,
          height: tourRect.height + 12,
        }}
      />

      {/* Spotlight ring */}
      <div
        style={{
          position: 'fixed',
          top: tourRect.top - 6,
          left: tourRect.left - 6,
          width: tourRect.width + 12,
          height: tourRect.height + 12,
          borderRadius: 10,
          boxShadow: `0 0 0 2px rgba(255,255,255,0.45) inset, 0 0 24px ${glowColor}`,
          pointerEvents: 'none',
          zIndex: 1001,
          transition: 'all 0.25s ease',
        }}
      />

      {/* Popover */}
      <div
        style={{
          position: 'fixed',
          ...popoverPositionFor(step.placement, tourRect, popoverWidth),
          width: popoverWidth,
          background: '#fff',
          borderRadius: 10,
          padding: '16px 18px 14px',
          boxShadow:
            '0 16px 40px rgba(0,0,0,0.35), 0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 1002,
          transition: 'all 0.25s ease',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close tour"
          style={{
            position: 'absolute',
            top: 8,
            right: 10,
            width: 24,
            height: 24,
            border: 'none',
            background: 'transparent',
            color: '#94a3b8',
            fontSize: 18,
            cursor: 'pointer',
            padding: 0,
            lineHeight: 1,
          }}
        >
          ×
        </button>

        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: '#0F172A',
            marginBottom: 6,
            paddingRight: 18,
          }}
        >
          {step.title}
        </div>
        <div
          style={{
            fontSize: 13,
            color: '#475569',
            lineHeight: 1.5,
            marginBottom: 14,
          }}
        >
          {step.body}
        </div>

        {journeyLabels && (
          <>
            <div style={{ display: 'flex', gap: 4, marginBottom: 5 }}>
              {journeyLabels.map((label, i) => (
                <div
                  key={label}
                  title={label}
                  style={{
                    flex: 1,
                    height: 3,
                    borderRadius: 2,
                    background: i <= stepIndex ? accentColor : '#e2e8f0',
                    transition: 'background 0.2s',
                  }}
                />
              ))}
            </div>
            <div
              style={{
                fontSize: 11,
                color: '#94a3b8',
                marginBottom: 12,
                fontWeight: 500,
              }}
            >
              {journeyLabels[stepIndex]}
            </div>
          </>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: onSkip ? 'space-between' : 'flex-end',
          }}
        >
          {onSkip && (
            <button
              type="button"
              onClick={onSkip}
              style={{
                padding: '6px 10px',
                background: 'transparent',
                color: '#6b7280',
                border: 'none',
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {skipLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onNext}
            style={{
              padding: '7px 16px',
              background: accentColor,
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {isLastStep ? lastStepLabel : nextLabel}
          </button>
        </div>
      </div>
    </>
  )
}
