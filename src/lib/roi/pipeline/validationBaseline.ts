// Snapshot of the AI's pre-validation modeled values, keyed by workflow
// name. Captured at report generation (source: 'generation' —
// pages/api/roi-agent.js, before any chat edit or validation wizard
// interaction can touch the report) so that later diffs against it can tell
// apart workflows the AI originally proposed from ones the user added via
// chat. For reports generated before that hook existed, validate-finalize.js
// captures one as a fallback (source: 'finalize-fallback').
//
// Runs inline in the report-generation insert, which is the money path for
// every user — must never throw. Malformed/missing input just yields a
// smaller (possibly empty) snapshot rather than aborting the caller.
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
