export default function ContextStep({
  wizard,
  onSendChat,
  onBack,
  onContinue,
}) {
  const handleContinue = () => {
    const text = wizard.additionalContext.trim()
    if (text) {
      onSendChat(
        `Validation wizard: additional context from the user for this report — "${text}". Update the model or report copy if this changes anything material, otherwise just acknowledge.`,
      )
    }
    onContinue()
  }

  return (
    <div>
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#5B48F8]">
        Step 4 of 4 — Final context
      </div>
      <h2 className="mb-1.5 text-[22px] font-extrabold text-[#0F172A]">
        Anything else we should know?
      </h2>
      <p className="mb-5 text-[13.5px] leading-[1.6] text-[#6B7280]">
        Seasonality, upcoming headcount changes, tooling constraints — anything
        that would sharpen the model. Optional.
      </p>

      <textarea
        value={wizard.additionalContext}
        onChange={(e) => wizard.setContext(e.target.value)}
        placeholder="e.g. We're hiring 2 more reps next quarter, and lead volume doubles in Q4…"
        className="mb-5 min-h-[140px] w-full rounded-xl border border-[#E5E7EB] px-[18px] py-4 text-[13.5px] text-[#111827] outline-none"
      />

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-[10px] border border-[#E5E7EB] px-5 py-3 text-[13.5px] text-[#6B7280]"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={handleContinue}
          className="rounded-[10px] bg-[#5B48F8] px-6 py-3 text-[13.5px] font-bold text-white"
        >
          Continue — Quick feedback
        </button>
      </div>
    </div>
  )
}
