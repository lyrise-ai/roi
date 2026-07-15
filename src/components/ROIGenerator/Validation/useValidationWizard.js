import { useCallback, useMemo, useReducer, useRef } from 'react'
import { roiCalculator } from '@/src/lib/roi/pipeline/roiCalculator'

// Steps: 0 overview, 1 confirm workflows, 2 volume, 3 duration, 4 context,
// 5 feedback, 6 complete.
export const TOTAL_WIZARD_STEPS = 6

function emptyDecision() {
  return {
    kept: true,
    volumeAnswer: null, // 'same' | 'increase' | 'decrease'
    volumePct: 0,
    durationAnswer: null,
    durationPct: 0,
  }
}

function initDecisions(workflows) {
  return Object.fromEntries(workflows.map((w) => [w.name, emptyDecision()]))
}

function initState(workflows) {
  return {
    step: 0,
    baseline: workflows,
    decisions: initDecisions(workflows),
    workflowsAnswer: null, // 'yes' | 'no'
    additionalContext: '',
    feedback: { reportFitRating: 0, comment: '' },
    budgetTiming: null,
    xp: 0,
  }
}

function reducer(state, action) {
  switch (action.type) {
    case 'GO_STEP':
      return { ...state, step: action.step }
    case 'SET_WORKFLOWS_ANSWER':
      return { ...state, workflowsAnswer: action.value }
    case 'TOGGLE_KEEP': {
      const cur = state.decisions[action.name] ?? emptyDecision()
      return {
        ...state,
        decisions: {
          ...state.decisions,
          [action.name]: { ...cur, kept: !cur.kept },
        },
      }
    }
    case 'SET_VOLUME_ANSWER': {
      const cur = state.decisions[action.name] ?? emptyDecision()
      return {
        ...state,
        decisions: {
          ...state.decisions,
          [action.name]: {
            ...cur,
            volumeAnswer: action.value,
            volumePct:
              action.value === 'same'
                ? 0
                : cur.volumePct || (action.value === 'increase' ? 10 : -10),
          },
        },
      }
    }
    case 'BUMP_VOLUME_PCT': {
      const cur = state.decisions[action.name] ?? emptyDecision()
      return {
        ...state,
        decisions: {
          ...state.decisions,
          [action.name]: {
            ...cur,
            volumePct: cur.volumePct + action.delta,
          },
        },
      }
    }
    case 'SET_DURATION_ANSWER': {
      const cur = state.decisions[action.name] ?? emptyDecision()
      return {
        ...state,
        decisions: {
          ...state.decisions,
          [action.name]: {
            ...cur,
            durationAnswer: action.value,
            durationPct:
              action.value === 'same'
                ? 0
                : cur.durationPct || (action.value === 'increase' ? 10 : -10),
          },
        },
      }
    }
    case 'BUMP_DURATION_PCT': {
      const cur = state.decisions[action.name] ?? emptyDecision()
      return {
        ...state,
        decisions: {
          ...state.decisions,
          [action.name]: {
            ...cur,
            durationPct: cur.durationPct + action.delta,
          },
        },
      }
    }
    case 'SET_CONTEXT':
      return { ...state, additionalContext: action.value }
    case 'SET_FEEDBACK':
      return {
        ...state,
        feedback: { ...state.feedback, [action.field]: action.value },
      }
    case 'SET_BUDGET_TIMING':
      return { ...state, budgetTiming: action.value }
    case 'SET_XP':
      return { ...state, xp: Math.max(state.xp, action.value) }
    // A chat-panel edit (add_workflow / update_workflow) changed the
    // authoritative workflow list mid-wizard. Rebase: new baseline = the
    // fresh list, and reset any per-workflow % steppers so they compute
    // against the new numbers instead of silently compounding.
    case 'REBASE_FROM_CHAT': {
      const nextDecisions = { ...state.decisions }
      action.workflows.forEach((w) => {
        const cur = nextDecisions[w.name]
        nextDecisions[w.name] = cur
          ? { ...cur, volumePct: 0, durationPct: 0 }
          : emptyDecision()
      })
      // Drop decisions for workflows no longer present (removed via chat).
      Object.keys(nextDecisions).forEach((name) => {
        if (!action.workflows.some((w) => w.name === name)) {
          delete nextDecisions[name]
        }
      })
      return { ...state, baseline: action.workflows, decisions: nextDecisions }
    }
    default:
      return state
  }
}

export function useValidationWizard(initialWorkflows, globals, company) {
  const [state, dispatch] = useReducer(reducer, initialWorkflows, initState)
  const lastSavedRef = useRef(null)

  const keptWorkflows = useMemo(
    () => state.baseline.filter((w) => state.decisions[w.name]?.kept !== false),
    [state.baseline, state.decisions],
  )

  // Live-patched workflow list (baseline × decision %) — recomputed locally,
  // no network round-trip. Mirrors the arithmetic applied server-side at
  // finalize (pages/api/reports/[id]/validate-finalize.js) so the preview
  // never disagrees with the saved result.
  const liveWorkflows = useMemo(
    () =>
      keptWorkflows.map((w) => {
        const d = state.decisions[w.name] ?? emptyDecision()
        return {
          ...w,
          monthlyVolume: Math.max(
            1,
            Math.round(w.monthlyVolume * (1 + d.volumePct / 100)),
          ),
          minutesPerItemBefore: Math.max(
            1,
            Math.round(w.minutesPerItemBefore * (1 + d.durationPct / 100)),
          ),
        }
      }),
    [keptWorkflows, state.decisions],
  )

  const liveCalcOutput = useMemo(() => {
    if (!globals || !company || liveWorkflows.length === 0) return null
    try {
      return roiCalculator(liveWorkflows, globals, company)
    } catch (err) {
      console.error('[ValidationWizard] live roiCalculator failed:', err)
      return null
    }
  }, [liveWorkflows, globals, company])

  const goStep = useCallback((step) => dispatch({ type: 'GO_STEP', step }), [])
  const setWorkflowsAnswer = useCallback(
    (value) => dispatch({ type: 'SET_WORKFLOWS_ANSWER', value }),
    [],
  )
  const toggleKeep = useCallback(
    (name) => dispatch({ type: 'TOGGLE_KEEP', name }),
    [],
  )
  const setVolumeAnswer = useCallback(
    (name, value) => dispatch({ type: 'SET_VOLUME_ANSWER', name, value }),
    [],
  )
  const bumpVolumePct = useCallback(
    (name, delta) => dispatch({ type: 'BUMP_VOLUME_PCT', name, delta }),
    [],
  )
  const setDurationAnswer = useCallback(
    (name, value) => dispatch({ type: 'SET_DURATION_ANSWER', name, value }),
    [],
  )
  const bumpDurationPct = useCallback(
    (name, delta) => dispatch({ type: 'BUMP_DURATION_PCT', name, delta }),
    [],
  )
  const setContext = useCallback(
    (value) => dispatch({ type: 'SET_CONTEXT', value }),
    [],
  )
  const setFeedback = useCallback(
    (field, value) => dispatch({ type: 'SET_FEEDBACK', field, value }),
    [],
  )
  const setBudgetTiming = useCallback(
    (value) => dispatch({ type: 'SET_BUDGET_TIMING', value }),
    [],
  )
  const setXp = useCallback((value) => dispatch({ type: 'SET_XP', value }), [])
  const rebaseFromChat = useCallback(
    (workflows) => dispatch({ type: 'REBASE_FROM_CHAT', workflows }),
    [],
  )

  // Debounced draft autosave — refresh-resilience only, not correctness
  // critical (see pages/api/reports/[id]/validation.js).
  const saveDraft = useCallback(
    (reportId) => {
      const payload = {
        workflowDecisions: state.decisions,
        additionalContext: state.additionalContext,
        feedback: state.feedback,
        budgetTiming: state.budgetTiming,
        xp: state.xp,
      }
      const serialized = JSON.stringify(payload)
      if (serialized === lastSavedRef.current) return
      lastSavedRef.current = serialized
      fetch(`/api/reports/${reportId}/validation`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ validationData: payload }),
      }).catch((err) => {
        console.error('[validation] draft autosave failed:', err)
      })
    },
    [
      state.decisions,
      state.additionalContext,
      state.feedback,
      state.budgetTiming,
      state.xp,
    ],
  )

  return {
    ...state,
    keptWorkflows,
    liveWorkflows,
    liveCalcOutput,
    goStep,
    setWorkflowsAnswer,
    toggleKeep,
    setVolumeAnswer,
    bumpVolumePct,
    setDurationAnswer,
    bumpDurationPct,
    setContext,
    setFeedback,
    setBudgetTiming,
    setXp,
    rebaseFromChat,
    saveDraft,
  }
}
