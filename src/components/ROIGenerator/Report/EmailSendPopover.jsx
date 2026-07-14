import { useEffect, useRef } from 'react'
import { useEmailSendControl } from '@/src/hooks/useEmailSendControl'

// Toolbar "Send via email" button + dropdown — same self-contained pattern
// as TerminologyGuide (owns its own open/close state and click-outside
// handling), so it stays anchored in the toolbar instead of pushing other
// buttons around when expanded.
export default function EmailSendPopover({
  reportId,
  defaultEmail,
  triggerRef,
}) {
  const emailControl = useEmailSendControl({ reportId, defaultEmail })
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!emailControl.expanded) return undefined
    const onPointerDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        emailControl.cancel()
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailControl.expanded])

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={
          emailControl.expanded ? emailControl.cancel : emailControl.open
        }
        disabled={!reportId}
        className={`flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium ${
          emailControl.sent
            ? 'border-[#A7F3D0] bg-[#ECFDF5] text-[#059669]'
            : 'border-[#5B48F8] bg-[#5B48F8] text-white hover:bg-[#4A3CE8]'
        }`}
      >
        {emailControl.sent ? 'Sent ✓' : 'Send via email'}
      </button>
      {emailControl.expanded && (
        <div className="absolute top-[calc(100%+10px)] right-0 z-[90] w-72 rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.18)]">
          <div className="mb-2 text-[12.5px] font-bold text-[#0F172A]">
            Send via email
          </div>
          <input
            type="email"
            value={emailControl.email}
            onChange={(e) => emailControl.setEmail(e.target.value)}
            placeholder="name@company.com"
            className="mb-2 w-full rounded-lg border border-[#E5E7EB] px-2.5 py-2 text-[12.5px] outline-none"
          />
          {emailControl.error && (
            <div className="mb-2 text-[11px] text-[#DC2626]">
              Failed to send — try again.
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={emailControl.cancel}
              className="flex-1 rounded-lg border border-[#E5E7EB] bg-transparent px-2.5 py-2 text-xs text-[#6B7280]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={emailControl.send}
              disabled={!emailControl.email.trim() || emailControl.sending}
              className={`flex-1 rounded-lg px-2.5 py-2 text-xs font-semibold text-white ${
                emailControl.email.trim()
                  ? 'cursor-pointer bg-[#0F172A]'
                  : 'cursor-not-allowed bg-[#D1D5DB]'
              }`}
            >
              {emailControl.sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
