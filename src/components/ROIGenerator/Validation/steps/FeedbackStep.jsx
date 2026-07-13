function StarRating({ value, onChange }) {
  return (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className="transition-transform hover:scale-110"
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
        >
          <svg
            viewBox="0 0 20 20"
            className="h-7 w-7"
            fill={n <= value ? '#F59E0B' : '#E5E7EB'}
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </button>
      ))}
    </div>
  )
}

export default function FeedbackStep({ wizard, onSkip, onSubmit }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#5B48F8]">
        Step 5 of 5 — Quick feedback
      </div>
      <h2 className="mb-1.5 text-[22px] font-extrabold text-[#0F172A]">
        Before you see the full report — 3 quick questions.
      </h2>
      <p className="mb-5 text-[13.5px] leading-[1.6] text-[#6B7280]">
        30 seconds. This directly shapes the next version of the tool.
      </p>

      <div className="mb-5 rounded-2xl border border-[#E5E7EB] bg-white px-6 py-[22px]">
        <div className="mb-5">
          <div className="mb-2 text-[13px] text-[#374151]">
            How clearly did this validation process communicate the value on the
            table?
          </div>
          <StarRating
            value={wizard.feedback.reportFitRating}
            onChange={(v) => wizard.setFeedback('reportFitRating', v)}
          />
        </div>
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
          onClick={onSkip}
          className="rounded-[10px] border border-[#E5E7EB] px-5 py-3 text-[13.5px] text-[#6B7280]"
        >
          Skip for now
        </button>
        <button
          type="button"
          onClick={onSubmit}
          className="rounded-[10px] bg-[#5B48F8] px-6 py-3 text-[13.5px] font-bold text-white"
        >
          Submit — Finish
        </button>
      </div>
    </div>
  )
}
