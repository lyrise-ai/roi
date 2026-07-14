export default function FeedbackStep({
  wizard,
  onSkip,
  onSubmit,
  isAlpha,
  reportId,
}) {
  // Alpha tour tracking — best-effort, fire-and-forget. Must never block
  // leaving this step: it fires right before onSkip/onSubmit, never awaited.
  // trust_after is tracked separately, from CompleteStep, where the
  // validated numbers are actually visible.
  const trackValidationNote = () => {
    if (!isAlpha) return
    try {
      const token = localStorage.getItem('alpha_token')
      if (!token) return
      fetch('/api/alpha/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_token: token,
          report_id: reportId,
          validation_note: wizard.feedback.comment?.trim() || null,
        }),
      })
        .then((res) => {
          if (!res.ok) {
            console.error(
              '[alpha] validation_note tracking failed:',
              res.status,
            )
          }
        })
        .catch((err) => {
          console.error('[alpha] validation_note tracking failed:', err)
        })
    } catch (err) {
      console.error('[alpha] validation_note tracking failed:', err)
    }
  }

  const handleSkip = () => {
    trackValidationNote()
    onSkip()
  }

  const handleSubmit = () => {
    trackValidationNote()
    onSubmit()
  }

  return (
    <div>
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#5B48F8]">
        Step 5 of 5 — Quick feedback
      </div>
      <h2 className="mb-1.5 text-[22px] font-extrabold text-[#0F172A]">
        Before you see the full report — 1 quick question.
      </h2>
      <p className="mb-5 text-[13.5px] leading-[1.6] text-[#6B7280]">
        30 seconds. This directly shapes the next version of the tool.
      </p>

      <div className="mb-5 rounded-2xl border border-[#E5E7EB] bg-white px-6 py-[22px]">
        <div>
          <div className="mb-2 text-[13px] text-[#374151]">
            What would make this validation step better?{' '}
            <span className="font-normal text-[#9CA3AF]">(optional)</span>
          </div>
          <textarea
            value={wizard.feedback.comment}
            onChange={(e) => wizard.setFeedback('comment', e.target.value)}
            placeholder="A quick note helps us a lot…"
            className="min-h-[70px] w-full rounded-lg border border-[#E5E7EB] px-3 py-2.5 text-[13px] text-[#111827] outline-none"
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handleSkip}
          className="rounded-[10px] border border-[#E5E7EB] px-5 py-3 text-[13.5px] text-[#6B7280]"
        >
          Skip for now
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          className="rounded-[10px] bg-[#5B48F8] px-6 py-3 text-[13.5px] font-bold text-white"
        >
          Submit — Finish
        </button>
      </div>
    </div>
  )
}
