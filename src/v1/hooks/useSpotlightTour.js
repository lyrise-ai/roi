import { useCallback, useEffect, useState } from 'react'

function resolveTourTarget(step) {
  if (step.targetRef) return step.targetRef.current
  if (step.targetId) return document.getElementById(step.targetId)
  return null
}

// Runs a step-by-step product tour that spotlights parts of the page. It keeps
// track of which step is active and where the highlighted element is on screen,
// working that out again when the window resizes or scrolls. It hands back
// controls to open, advance and close the tour. Use it with
// <SpotlightTourOverlay />, which does the actual dimming and pop-ups.
export function useSpotlightTour({ steps, onComplete, onClose, seenKey }) {
  const [tourStep, setTourStep] = useState(-1)
  const [tourRect, setTourRect] = useState(null)
  const length = steps.length

  useEffect(() => {
    if (tourStep < 0 || tourStep >= length) {
      setTourRect(null)
      return undefined
    }
    const recompute = () => {
      const el = resolveTourTarget(steps[tourStep])
      if (!el) {
        setTourRect(null)
        return
      }
      const r = el.getBoundingClientRect()
      setTourRect({
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
      })
    }
    recompute()
    window.addEventListener('resize', recompute)
    // The highlighted element can move as things scroll — the report scrolls
    // inside its own box — so we check regularly rather than relying only on
    // resize and scroll events.
    const poll = setInterval(recompute, 300)
    return () => {
      window.removeEventListener('resize', recompute)
      clearInterval(poll)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourStep, length])

  const markSeen = useCallback(() => {
    if (!seenKey) return
    try {
      localStorage.setItem(seenKey, '1')
    } catch {
      /* private browsing */
    }
  }, [seenKey])

  const openTour = useCallback(() => setTourStep(0), [])

  const advanceTour = useCallback(() => {
    setTourStep((s) => {
      const next = s + 1
      if (next >= length) {
        markSeen()
        onComplete?.()
        return -1
      }
      return next
    })
  }, [length, markSeen, onComplete])

  const closeTour = useCallback(() => {
    markSeen()
    onClose?.(tourStep)
    setTourStep(-1)
  }, [markSeen, onClose, tourStep])

  const isTourOpen = tourStep >= 0 && tourStep < length && tourRect !== null
  const isLastStep = tourStep === length - 1

  return {
    tourStep,
    tourRect,
    isTourOpen,
    isLastStep,
    openTour,
    advanceTour,
    closeTour,
  }
}
