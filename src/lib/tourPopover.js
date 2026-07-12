// Shared positioning math for spotlight-tour popovers (see
// src/hooks/useSpotlightTour.js and src/components/shared/SpotlightTourOverlay.jsx).
// `rect` is a DOMRect-like object ({ top, left, width, height }) for the
// spotlighted target, already relative to the viewport (fixed positioning).
export function popoverPositionFor(placement, rect, width = 300) {
  const gap = 14
  switch (placement) {
    case 'bottom-start':
      return { top: rect.top + rect.height + gap, left: Math.max(8, rect.left) }
    case 'bottom-end':
      return {
        top: rect.top + rect.height + gap,
        left: Math.max(8, rect.left + rect.width - width),
      }
    case 'left':
      return {
        top: Math.max(8, rect.top + 24),
        left: Math.max(16, rect.left - width - gap),
      }
    case 'right':
      return {
        top: Math.max(8, rect.top + 24),
        left: rect.left + rect.width + gap,
      }
    case 'top-start':
      return {
        bottom: window.innerHeight - rect.top + gap,
        left: Math.max(8, rect.left),
      }
    case 'top-end':
      return {
        bottom: window.innerHeight - rect.top + gap,
        left: Math.max(8, rect.left + rect.width - width),
      }
    case 'inside-top-right':
      return {
        top: rect.top + 20,
        left: Math.max(8, rect.left + rect.width - width - 20),
      }
    default:
      return { top: rect.top + rect.height + gap, left: rect.left }
  }
}
