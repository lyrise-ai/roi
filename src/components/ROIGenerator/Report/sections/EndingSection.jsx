import { useEffect, useRef, useState } from 'react'
import { useEmailSendControl } from '@/src/hooks/useEmailSendControl'

const CHAT_TEXTAREA_SELECTOR =
  'textarea[placeholder="Ask me to change anything in the report…"]'

function ActionCard({ icon, title, body, children }) {
  return (
    <div className="flex flex-col rounded-[14px] border border-[#E5E7EB] bg-white px-[18px] pt-[18px] pb-5">
      <div className="mb-2 text-xl">{icon}</div>
      <div className="mb-1 text-[13.5px] font-bold text-[#0F172A]">{title}</div>
      <div className="mb-3.5 flex-1 text-xs leading-[1.55] text-[#9CA3AF]">
        {body}
      </div>
      {children}
    </div>
  )
}

export default function EndingSection({
  isAlpha,
  reportId,
  canManageShares,
  onDownload,
  downloadStatus,
  onAward,
  onCredibilityAnswer,
}) {
  // Mirrors the toolbar's Download PDF button and its status, so the two places
  // you can start a download never disagree with each other.
  const [downloadTriggered, setDownloadTriggered] = useState(false)
  const prevDownloadStatusRef = useRef(downloadStatus)
  useEffect(() => {
    if (
      downloadTriggered &&
      prevDownloadStatusRef.current === 'downloading' &&
      downloadStatus === 'idle'
    ) {
      onAward('+1 chat credit — thanks for grabbing a copy')
    }
    prevDownloadStatusRef.current = downloadStatus
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [downloadStatus])
  const downloaded = downloadTriggered && downloadStatus === 'idle'
  const handleDownloadClick = () => {
    setDownloadTriggered(true)
    onDownload()
  }
  const downloadLabel =
    downloadStatus === 'downloading'
      ? 'Generating PDF…'
      : downloadStatus === 'error'
        ? 'Download failed — retry'
        : downloaded
          ? 'Downloaded ✓'
          : 'Download PDF'

  // "Loop in a colleague" uses the same send-by-email machinery as the toolbar's
  // resend-to-myself button. The only difference is that this field starts
  // empty, because it is for someone else.
  const emailControl = useEmailSendControl({
    reportId,
    defaultEmail: '',
    onSent: () => {
      onAward('+1 chat credit — shared with a colleague')
      refreshShares()
    },
  })

  // The "shared with" list. Owner and staff only. Anyone with access can send a
  // new invite above, but only the owner or staff can see who currently has
  // access, or take it away.
  const [shares, setShares] = useState([])
  const [sharesLoaded, setSharesLoaded] = useState(false)
  const [revokingId, setRevokingId] = useState(null)

  const refreshShares = async () => {
    if (!canManageShares || !reportId) return
    try {
      const res = await fetch(
        `/api/roi-report-shares?reportId=${encodeURIComponent(reportId)}`,
      )
      if (!res.ok) return
      const data = await res.json()
      setShares(data.shares ?? [])
    } catch {
      // If this fails, never mind. The list is a convenience, not the point of
      // the page.
    } finally {
      setSharesLoaded(true)
    }
  }

  useEffect(() => {
    refreshShares()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId, canManageShares])

  const handleRevoke = async (grantId) => {
    setRevokingId(grantId)
    try {
      const res = await fetch('/api/roi-report-shares', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, grantId }),
      })
      if (res.ok) setShares((prev) => prev.filter((s) => s.id !== grantId))
    } catch {
      // if this fails, never mind
    } finally {
      setRevokingId(null)
    }
  }

  // Talk it through — plain outbound link, no fake slot-picker.
  const [callClicked, setCallClicked] = useState(false)
  const handleCallClick = () => {
    if (callClicked) return
    setCallClicked(true)
    onAward('+1 chat credit — booked a walkthrough')
  }

  // Credibility pulse (alpha-only)
  const [credChoice, setCredChoice] = useState(null)
  const [credFollowText, setCredFollowText] = useState('')
  const [credSubmitted, setCredSubmitted] = useState(false)
  const handleCred = (choice) => {
    setCredChoice(choice)
    if (choice !== 'Felt off') {
      onCredibilityAnswer({ choice, comment: null })
      onAward('+1 chat credit — thanks for the gut check')
    }
  }
  const handleSubmitCredFollow = () => {
    onCredibilityAnswer({
      choice: credChoice,
      comment: credFollowText.trim() || null,
    })
    onAward('+1 chat credit — thanks for the gut check')
    setCredSubmitted(true)
  }
  const handleSkipCredFollow = () => {
    onCredibilityAnswer({ choice: credChoice, comment: null })
    onAward('+1 chat credit — thanks for the gut check')
    setCredSubmitted(true)
  }

  const handleOpenChat = () => {
    const el = document.querySelector(CHAT_TEXTAREA_SELECTOR)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el.focus()
  }

  return (
    <div>
      {/* Soft divider */}
      <div className="my-1.5 flex items-center gap-3.5">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent to-[#D1D5DB]" />
        <span className="text-[10.5px] font-bold tracking-[0.1em] whitespace-nowrap text-[#9CA3AF] uppercase">
          End of report
        </span>
        <div className="h-px flex-1 bg-gradient-to-l from-transparent to-[#D1D5DB]" />
      </div>

      <div className="mb-3.5">
        <div className="mb-1 text-[19px] font-extrabold text-[#0F172A]">
          Now what?
        </div>
        <div className="text-[13px] text-[#6B7280]">
          Three quick things — each one helps you and tells us what&apos;s
          working.
        </div>
      </div>

      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-3.5">
        <ActionCard
          icon="📄"
          title="Keep a copy"
          body="Download the full report as a polished PDF."
        >
          <button
            type="button"
            onClick={handleDownloadClick}
            disabled={!reportId || downloadStatus === 'downloading'}
            className={`rounded-[9px] px-3.5 py-2.5 text-[12.5px] font-bold ${
              downloaded
                ? 'cursor-default border border-[#A7F3D0] bg-[#ECFDF5] text-[#059669]'
                : 'cursor-pointer border-none bg-[#5B48F8] text-white hover:bg-[#4A3CE8]'
            }`}
          >
            {downloadLabel}
          </button>
        </ActionCard>

        <ActionCard
          icon="🤝"
          title="Loop in a colleague"
          body="Forward it to whoever signs off — CFO, CEO, whoever needs convincing."
        >
          {!emailControl.expanded && !emailControl.sent && (
            <button
              type="button"
              onClick={emailControl.open}
              className="rounded-[9px] border-none bg-[#5B48F8] px-3.5 py-2.5 text-[12.5px] font-bold text-white hover:bg-[#4A3CE8]"
            >
              Send via email
            </button>
          )}
          {emailControl.expanded && (
            <div className="flex flex-col gap-2">
              <input
                type="email"
                value={emailControl.email}
                onChange={(e) => emailControl.setEmail(e.target.value)}
                placeholder="colleague@company.com"
                className="rounded-lg border border-[#E5E7EB] px-2.5 py-2 text-[12.5px] outline-none"
              />
              {emailControl.error && (
                <div className="text-[11px] text-[#DC2626]">
                  Couldn&apos;t send that — try again.
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
          {emailControl.sent && !emailControl.expanded && (
            <>
              <div className="mb-2 text-xs font-semibold text-[#059669]">
                Sent ✓
              </div>
              <div
                onClick={emailControl.open}
                className="cursor-pointer text-[11.5px] font-semibold text-[#5B48F8]"
              >
                Share with someone else
              </div>
            </>
          )}

          {canManageShares && sharesLoaded && shares.length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5 border-t border-[#F3F4F6] pt-3">
              <div className="text-[10.5px] font-bold tracking-[0.04em] text-[#9CA3AF] uppercase">
                Shared with
              </div>
              {shares.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="truncate text-[11.5px] text-[#374151]">
                    {s.invitedEmail}
                    {!s.claimed && (
                      <span className="text-[#9CA3AF]"> · pending</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRevoke(s.id)}
                    disabled={revokingId === s.id}
                    className="shrink-0 text-[11px] font-semibold text-[#DC2626] hover:text-[#991B1B]"
                  >
                    {revokingId === s.id ? '…' : 'Revoke'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </ActionCard>

        <ActionCard
          icon="📞"
          title="Talk it through"
          body="15 minutes with a specialist to pressure-test these numbers before you commit."
        >
          <a
            href="https://api.leadconnectorhq.com/widget/bookings/strategy-call-with-lyrisesivto9"
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleCallClick}
            className="inline-block rounded-[9px] bg-[#5B48F8] px-3.5 py-2.5 text-[12.5px] font-bold text-white hover:bg-[#4A3CE8]"
          >
            Book a walkthrough →
          </a>
        </ActionCard>
      </div>

      {isAlpha && (
        <div className="mb-5 rounded-[14px] border border-[#E5E7EB] bg-white px-[22px] py-[18px]">
          <div className="mb-0.5 text-[13.5px] font-bold text-[#0F172A]">
            Quick gut check
          </div>
          <div className="mb-3.5 text-xs text-[#9CA3AF]">
            Did the numbers in this report feel credible to you?
          </div>

          {!credChoice && (
            <div className="flex flex-wrap gap-2">
              {['Spot on', 'Roughly right', 'Felt off'].map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => handleCred(label)}
                  className="cursor-pointer rounded-[9px] border-[1.5px] border-[#E5E7EB] bg-white px-3.5 py-2.5 text-[12.5px] font-semibold text-[#374151]"
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {credChoice && (
            <>
              <div className="mb-2.5 text-[12.5px] font-semibold text-[#059669]">
                Thanks — noted.
              </div>
              {credChoice === 'Felt off' && !credSubmitted && (
                <>
                  <textarea
                    value={credFollowText}
                    onChange={(e) => setCredFollowText(e.target.value)}
                    placeholder="What felt off? One line is plenty."
                    className="mb-2 min-h-[56px] w-full resize-y rounded-lg border border-[#E5E7EB] px-2.5 py-2 text-[12.5px] text-[#111827] outline-none"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSkipCredFollow}
                      className="rounded-lg border border-[#E5E7EB] bg-transparent px-3 py-1.5 text-xs text-[#6B7280]"
                    >
                      Skip
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmitCredFollow}
                      className="rounded-lg border-none bg-[#0F172A] px-3.5 py-1.5 text-xs font-semibold text-white"
                    >
                      Submit
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      <div
        onClick={handleOpenChat}
        className="cursor-pointer text-center text-[12.5px] font-semibold text-[#5B48F8] hover:text-[#4A3CE8]"
      >
        Or keep chatting with your AI workflow advisor →
      </div>
    </div>
  )
}
