// A copy of the numbers the AI produced, taken before the user checks them over,
// filed by workflow name.
//
// We take it as the report is generated (pages/api/roi-agent.js), before any
// chat edit or wizard change can touch anything. Comparing against it later
// tells us which workflows the AI proposed itself and which ones the user added
// through chat. For reports made before that hook existed,
// validate-finalize.js takes one instead, marked as a fallback.
//
// This runs inside the same step that saves a new report — the path that
// matters for every paying user — so it must never throw. Bad or missing input
// simply produces a smaller, possibly empty, copy rather than stopping the
// caller.
export function buildBaselineSnapshot(workflows, capturedAt, source) {
  const snapshot = {}
  try {
    if (Array.isArray(workflows)) {
      workflows.forEach((w) => {
        if (!w || typeof w.name !== 'string' || !w.name) return
        const entry: { monthlyVolume?: number; minutesPerItemBefore?: number } =
          {}
        if (
          typeof w.monthlyVolume === 'number' &&
          Number.isFinite(w.monthlyVolume)
        ) {
          entry.monthlyVolume = w.monthlyVolume
        }
        if (
          typeof w.minutesPerItemBefore === 'number' &&
          Number.isFinite(w.minutesPerItemBefore)
        ) {
          entry.minutesPerItemBefore = w.minutesPerItemBefore
        }
        snapshot[w.name] = entry
      })
    }
  } catch (err) {
    console.error(
      '[validationBaseline] buildBaselineSnapshot failed, returning partial snapshot:',
      err,
    )
  }
  return { capturedAt, source, workflows: snapshot }
}
