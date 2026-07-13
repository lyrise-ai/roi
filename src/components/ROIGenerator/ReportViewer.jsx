import React, { useState, useRef, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { drainSSE } from '@/src/lib/drainSSE'
import { REPORT_CHAT_MESSAGE_LIMIT } from '@/src/lib/roi/constants'
import { loadSentryFeedback, setFeedbackSource } from '@/src/lib/sentryFeedback'
import { trackShareEvent } from '@/src/lib/trackShareEvent'
import { INTER_FONT_FAMILY } from '@/src/utilities/fonts'
import { useSpotlightTour } from '@/src/hooks/useSpotlightTour'
import SpotlightTourOverlay from '@/src/components/shared/SpotlightTourOverlay'
import ReportContent from './Report/ReportContent'
import TerminologyGuide from './Report/TerminologyGuide'
import { NAV_ITEMS } from './Report/navItems'

const TOUR_JOURNEY = [
  'Your Report',
  'Every Number, Explained',
  'Export & Share',
  'Refine with AI',
]

const SUGGEST_RE = /\[SUGGEST:\s*([^\]]+)\]$/
function parseSuggestions(content) {
  const m = content.match(SUGGEST_RE)
  if (!m) return { clean: content, chips: [] }
  return {
    clean: content.replace(SUGGEST_RE, '').trimEnd(),
    chips: m[1]
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean),
  }
}

function buildInitialMessage(state) {
  const isLow = state?.confidenceLevel === 'low'
  const inferredWfs =
    state?.researchOutput?.workflows?.filter(
      (w) => w.sourceType === 'inferred',
    ) ?? []
  const noRevenue = !state?.revenueAnchor
  const company = state?.assembled?.roi_data?.company ?? 'your company'

  const parts = []

  if (isLow) {
    parts.push(
      `Report ready for ${company}. Most figures are benchmarked estimates — not scraped from live data.`,
    )
  } else {
    parts.push(`Report ready for ${company}.`)
  }

  const gaps = []
  if (noRevenue) gaps.push('annual revenue (improves profit uplift accuracy)')
  inferredWfs
    .slice(0, 2)
    .forEach((w) =>
      gaps.push(`volume for "${w.name}" (currently estimated from benchmarks)`),
    )
  if (gaps.length) {
    parts.push(`To sharpen the numbers, you could share: ${gaps.join('; ')}.`)
  }

  parts.push(
    'Ask me to adjust any figures, rewrite sections, change the currency, or add more context.',
  )

  return parts.join(' ')
}

// Human-readable labels for each tool call
const TOOL_LABELS = {
  web_search: 'Searching the web…',
  fetch_page: 'Reading page…',
  search_evidence: 'Looking up sources…',
  set_research_output: 'Processing research findings…',
  run_financial_model: 'Running financial model…',
  set_report_copy: 'Writing report copy…',
  update_copy: 'Updating report copy…',
  update_workflow: 'Recalculating figures…',
  update_globals: 'Updating financial model…',
  scale_rates: 'Scaling figures…',
  set_currency: 'Updating currency…',
  add_workflow: 'Adding workflow…',
  remove_workflow: 'Removing workflow…',
}

// Maps the agent's own section keys (from AgentEvent's `changedSections`) to
// the report's nav-sidebar keys (see Report/navItems.js) — a single agent
// edit can touch more than one visible section (e.g. a globals/currency
// change recomputes both the hero metrics and the 3-year outlook).
const CHANGED_TO_NAV_KEYS = {
  financials: ['overview', 'outlook'],
  thesis: ['overview'],
  workflows: ['workflows'],
  profit_levers: ['uplift'],
  cost_of_delay: ['delay'],
  resilience_rows: ['resilience'],
  risks: ['risks'],
  pilot: ['roadmap'],
  cta: ['next'],
}

const NAV_LABEL_BY_KEY = Object.fromEntries(
  NAV_ITEMS.map(({ key, label }) => [key, label]),
)

// Render **bold** markdown from agent responses
function renderText(text) {
  return text
    .split(/(\*\*[^*]+\*\*)/)
    .map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : (
        part
      ),
    )
}

export default function ReportViewer({
  initialState,
  email,
  reportId,
  isEmployee,
  initialMessagesUsed = 0,
  initialChatHistory = [],
  backHref,
  batchContext,
  isShareLink = false,
  shareToken = null,
  validatedAt = null,
  forceTour = false,
  isAlpha = false,
}) {
  const [reportState, setReportState] = useState(initialState)
  const [chatHistory, setChatHistory] = useState(initialChatHistory)
  const [initialMessage] = useState(() => buildInitialMessage(initialState))
  const [streamingText, setStreamingText] = useState('')
  const [activeTool, setActiveTool] = useState(null)
  const [isAgentRunning, setIsAgentRunning] = useState(false)
  const [input, setInput] = useState('')
  const [emailStatus, setEmailStatus] = useState('idle')
  // Nav-sidebar keys touched by the most recent chat edit — persists until the
  // next message (drives the "Sections updated" chip row); `flashSections` is
  // the same set but auto-clears after a few seconds (drives the highlight
  // ring on the section itself).
  const [changedSections, setChangedSections] = useState([])
  const [flashSections, setFlashSections] = useState(new Set())
  const [limitReached, setLimitReached] = useState(
    initialMessagesUsed >= REPORT_CHAT_MESSAGE_LIMIT,
  )
  const [userSentCount, setUserSentCount] = useState(initialMessagesUsed)
  const [showCallPrompt, setShowCallPrompt] = useState(false)
  const [downloadStatus, setDownloadStatus] = useState('idle')
  const [creditsEarned, setCreditsEarned] = useState(0)
  const [toastMsg, setToastMsg] = useState(null)
  const toastTimerRef = useRef(null)

  useEffect(() => {
    if (!showCallPrompt) return undefined
    let cleanup
    let cancelled = false

    let el
    let onClick
    loadSentryFeedback()
      .then((feedback) => {
        if (cancelled || !feedback) return
        el = document.getElementById('proposal-feedback-btn')
        if (!el) return
        onClick = () => setFeedbackSource('proposal')
        el.addEventListener('click', onClick)
        cleanup = feedback.attachTo(el, {
          formTitle: 'Before you decide — anything unclear?',
          tags: { 'feedback.source': 'proposal' },
        })
      })
      .catch(() => {})

    return () => {
      cancelled = true
      el?.removeEventListener('click', onClick)
      cleanup?.()
    }
  }, [showCallPrompt])

  const messagesEndRef = useRef(null)
  const sectionNavRef = useRef(null)
  const terminologyGuideRef = useRef(null)
  const downloadRef = useRef(null)
  const resendEmailRef = useRef(null)
  const chatPanelRef = useRef(null)
  const scrollToSectionRef = useRef(null)

  // Share-link recipient tracking: when a prospect opens "Edit with chat" from
  // the email, record the open and how long they spend on the page (the chat
  // panel session). Only runs for share-link visitors; employees/owners are
  // not tracked. session-end uses sendBeacon (in trackShareEvent) so it fires
  // even as the tab closes.
  useEffect(() => {
    if (!isShareLink || !shareToken || !reportId) return undefined

    const startedAt = Date.now()
    trackShareEvent({ reportId, shareToken, type: 'chat_link_opened' })

    let sent = false
    const endSession = () => {
      if (sent) return
      sent = true
      trackShareEvent({
        reportId,
        shareToken,
        type: 'chat_session_end',
        durationMs: Date.now() - startedAt,
      })
    }

    // pagehide is the most reliable unload signal across browsers (incl. mobile
    // bfcache); visibilitychange→hidden catches tab switches/closes too.
    const onHide = () => endSession()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') endSession()
    }
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onVisibility)
      endSession()
    }
  }, [isShareLink, shareToken, reportId])

  const tourSteps = [
    {
      title: 'Your Report',
      body: 'This single scrolling view covers the full business case — hero metrics, workflows, sources, roadmap, and more. Use this nav to jump straight to any section.',
      placement: 'right',
      targetRef: sectionNavRef,
    },
    {
      title: 'Every number, explained',
      body: 'Hover any "?" for a plain-language definition, or click a headline number for the exact formula behind it. Use the Terminology Guide for a full glossary any time.',
      placement: 'bottom-end',
      targetRef: terminologyGuideRef,
    },
    {
      title: 'Take it with you',
      body: isShareLink
        ? 'Download as PDF to share with your team or attach to a board deck — it renders exactly as you see it here.'
        : "Download as PDF for your leadership team, or resend to your inbox after you've refined it with the AI assistant.",
      placement: 'bottom-end',
      targetRef: isShareLink ? downloadRef : resendEmailRef,
    },
    {
      title: 'The report is a conversation',
      body: 'Ask the assistant to change the currency, add a workflow, adjust an assumption, or rewrite any section. The report updates in real time — every edit is tracked so you can resend the latest version. Got thoughts on the report itself? The Feedback button in the corner is always there for that.',
      placement: 'left',
      targetRef: chatPanelRef,
    },
  ]

  const {
    tourStep,
    tourRect,
    isTourOpen,
    isLastStep,
    openTour,
    advanceTour,
    closeTour,
  } = useSpotlightTour({ steps: tourSteps, seenKey: 'lyrise_tour_seen' })

  useEffect(() => {
    if (forceTour) {
      // Share-link visitors should always see the tour on first arrival
      // from the email, even if a prior anon visit dismissed it.
      openTour()
      return
    }
    try {
      if (!localStorage.getItem('lyrise_tour_seen')) openTour()
    } catch {
      // private browsing
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceTour])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory, streamingText, activeTool])

  const handleSectionChipClick = useCallback((navKey) => {
    scrollToSectionRef.current?.(navKey)
  }, [])

  const handleReportContentReady = useCallback(({ scrollToSection }) => {
    scrollToSectionRef.current = scrollToSection
  }, [])

  // Auto-fade the highlight ring a few seconds after a chat edit lands — the
  // "Sections updated" chips (driven by `changedSections`) persist until the
  // next message, matching the pre-redesign behavior.
  useEffect(() => {
    if (flashSections.size === 0) return undefined
    const t = setTimeout(() => setFlashSections(new Set()), 5000)
    return () => clearTimeout(t)
  }, [flashSections])

  const company = reportState?.assembled?.roi_data?.company ?? ''

  const handleSend = useCallback(
    async (e, overrideMsg) => {
      e?.preventDefault()
      const msg = (overrideMsg ?? input).trim()
      if (!msg || isAgentRunning) return

      const newHistory = [...chatHistory, { role: 'user', content: msg }]
      setChatHistory(newHistory)
      if (!overrideMsg) setInput('')
      setIsAgentRunning(true)
      setChangedSections([])
      setFlashSections(new Set())
      setStreamingText('')
      setActiveTool(null)

      try {
        const res = await fetch('/api/roi-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'chat',
            message: msg,
            chatHistory: newHistory,
            state: reportState,
            reportId,
            ...(shareToken ? { shareToken } : {}),
          }),
        })

        if (res.status === 403) {
          const data = await res.json().catch(() => null)
          if (data?.error === 'limit_reached') {
            setLimitReached(true)
            setIsAgentRunning(false)
            return
          }
          throw new Error('HTTP 403')
        }

        const newCount = userSentCount + 1
        setUserSentCount(newCount)

        if (!res.ok) throw new Error(`HTTP ${res.status}`)

        let agentReply = ''
        const reader = res.body.getReader()
        const decoder = new TextDecoder()

        await drainSSE(reader, decoder, (event) => {
          if (event.type === 'text_delta') {
            agentReply += event.delta
            setStreamingText(agentReply)
          } else if (event.type === 'tool_start') {
            setActiveTool(TOOL_LABELS[event.tool] ?? event.tool)
          } else if (event.type === 'report_update') {
            const navKeys = [
              ...new Set(
                (event.changedSections ?? []).flatMap(
                  (k) => CHANGED_TO_NAV_KEYS[k] ?? [],
                ),
              ),
            ]
            setChangedSections(navKeys)
            setFlashSections(new Set(navKeys))
            setReportState(event.state)
            setActiveTool(null)
          } else if (event.type === 'done') {
            const { clean } = parseSuggestions(agentReply)
            const nextMessages =
              event.messages ??
              (agentReply ? [{ role: 'assistant', content: clean }] : [])
            if (nextMessages.length) {
              setChatHistory([...newHistory, ...nextMessages])
            }
            if (newCount >= REPORT_CHAT_MESSAGE_LIMIT) {
              setLimitReached(true)
            }
            if (!isEmployee && newCount === REPORT_CHAT_MESSAGE_LIMIT) {
              setShowCallPrompt(true)
            }
            setStreamingText('')
            setIsAgentRunning(false)
            setActiveTool(null)
          } else if (event.type === 'error') {
            setStreamingText('')
            setIsAgentRunning(false)
            setActiveTool(null)
          }
        })
      } catch {
        setIsAgentRunning(false)
        setActiveTool(null)
      }
    },
    [
      input,
      isAgentRunning,
      chatHistory,
      reportState,
      reportId,
      userSentCount,
      isEmployee,
      shareToken,
    ],
  )

  const handleDownload = useCallback(async () => {
    if (!reportId || downloadStatus === 'downloading') return
    setDownloadStatus('downloading')
    try {
      const res = await fetch('/api/roi-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const cd = res.headers.get('content-disposition') || ''
      const match = cd.match(/filename="([^"]+)"/)
      const filename = match?.[1] || 'ROI_Report.pdf'

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      if (isShareLink && shareToken) {
        trackShareEvent({
          reportId,
          shareToken,
          type: 'pdf_downloaded_share',
        })
      }

      setDownloadStatus('idle')
    } catch (err) {
      console.error('[ReportViewer] PDF download failed:', err)
      setDownloadStatus('error')
      setTimeout(() => setDownloadStatus('idle'), 3000)
    }
  }, [downloadStatus, reportId, isShareLink, shareToken])

  // Cosmetic delight loop for the report-ending panel — mirrors how credits
  // already behave elsewhere in the product (ValidationWizard's XP is
  // likewise never actually redeemed against REPORT_CHAT_MESSAGE_LIMIT).
  const award = useCallback((msg) => {
    setCreditsEarned((c) => c + 1)
    setToastMsg(msg)
    clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToastMsg(null), 2600)
  }, [])

  const handleCredibilityAnswer = useCallback(
    async ({ choice, comment }) => {
      if (!isAlpha) return
      try {
        const token = localStorage.getItem('alpha_token')
        if (!token) return
        const { createClient } = await import('@/src/lib/supabase-browser')
        await createClient()
          .from('alpha_feedback')
          .upsert(
            {
              alpha_token: token,
              step_credibility_choice: choice,
              step_credibility_comment: comment ?? null,
            },
            { onConflict: 'alpha_token' },
          )
      } catch (err) {
        console.error('[alpha] credibility pulse tracking failed:', err)
      }
    },
    [isAlpha],
  )

  const handleResendEmail = useCallback(async () => {
    if (!reportId || emailStatus === 'sending') return
    setEmailStatus('sending')
    try {
      const res = await fetch('/api/roi-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setEmailStatus('sent')
      setTimeout(() => setEmailStatus('idle'), 3000)
    } catch {
      setEmailStatus('error')
      setTimeout(() => setEmailStatus('idle'), 3000)
    }
  }, [emailStatus, reportId])

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  const styles = {
    bubble: {
      user: {
        maxWidth: '82%',
        padding: '9px 13px',
        fontSize: 13,
        lineHeight: 1.5,
        wordBreak: 'break-word',
        borderRadius: '14px 14px 3px 14px',
        background: '#0B1528',
        color: '#fff',
        boxShadow: '0 1px 3px rgba(11,21,40,0.18)',
      },
      assistant: {
        maxWidth: '92%',
        padding: '9px 13px',
        fontSize: 13,
        lineHeight: 1.55,
        wordBreak: 'break-word',
        borderRadius: '14px 14px 14px 3px',
        background: '#fff',
        color: '#1a1a1a',
        border: '1px solid #d0d0d0',
      },
    },
    dot: {
      display: 'inline-block',
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: '#5B48F8',
      marginRight: 5,
      verticalAlign: 'middle',
      animation: 'pulse 1s infinite',
    },
    cursor: {
      display: 'inline-block',
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: '#5B48F8',
      marginLeft: 4,
      verticalAlign: 'middle',
      animation: 'pulse 1s infinite',
    },
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        fontFamily: INTER_FONT_FAMILY,
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
        textRendering: 'optimizeLegibility',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderBottom: '1px solid #e2e8f0',
          background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          zIndex: 10,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {backHref && (
            <Link
              href={backHref}
              style={{
                fontSize: 13,
                color: '#6b7280',
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              ← Back
            </Link>
          )}
          <div style={{ fontWeight: 600, fontSize: 14, color: '#0F172A' }}>
            {company ? `${company} — Profit Map` : 'Profit Map'}
          </div>
          {batchContext && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#5B48F8',
                background: '#EBF0F8',
                borderRadius: 999,
                padding: '3px 10px',
                letterSpacing: '0.02em',
              }}
            >
              BULK · {batchContext.currentIndex + 1} of {batchContext.total}
            </span>
          )}
          {validatedAt && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#059669',
                background: '#ECFDF5',
                borderRadius: 999,
                padding: '3px 10px',
                letterSpacing: '0.02em',
              }}
              title={`Validated by you on ${new Date(validatedAt).toLocaleDateString()}`}
            >
              ✓ Validated{' '}
              {new Date(validatedAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div
            role="button"
            tabIndex={0}
            onClick={() => scrollToSectionRef.current?.('ending')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ')
                scrollToSectionRef.current?.('ending')
            }}
            style={{
              fontSize: 12.5,
              color: '#6b7280',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#5B48F8'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#6b7280'
            }}
          >
            Wrap up →
          </div>
          {creditsEarned > 0 && (
            <div
              style={{
                background: '#F5F3FF',
                color: '#5B48F8',
                borderRadius: 999,
                padding: '5px 12px',
                fontSize: 11.5,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <span>⚡</span>
              <span>
                {creditsEarned} chat credit{creditsEarned === 1 ? '' : 's'}{' '}
                earned
              </span>
            </div>
          )}
          <button
            ref={downloadRef}
            type="button"
            onClick={handleDownload}
            disabled={!reportId || downloadStatus === 'downloading'}
            style={{
              padding: '6px 14px',
              fontSize: 13,
              fontWeight: 500,
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              background: '#fff',
              color: '#374151',
              cursor:
                !reportId || downloadStatus === 'downloading'
                  ? 'not-allowed'
                  : 'pointer',
              opacity: !reportId || downloadStatus === 'downloading' ? 0.6 : 1,
            }}
          >
            {downloadStatus === 'downloading'
              ? 'Generating PDF…'
              : downloadStatus === 'error'
                ? 'Download failed — retry'
                : 'Download PDF'}
          </button>
          <button
            type="button"
            onClick={openTour}
            title="Take a tour"
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              border: '1px solid #e2e8f0',
              background: '#fff',
              color: '#6b7280',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            ?
          </button>
          <TerminologyGuide triggerRef={terminologyGuideRef} />
          {!isShareLink && (
            <button
              ref={resendEmailRef}
              type="button"
              onClick={handleResendEmail}
              disabled={!reportId || emailStatus === 'sending'}
              style={{
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: 500,
                border: '1px solid #5B48F8',
                borderRadius: 6,
                background:
                  emailStatus === 'sent'
                    ? '#dcfce7'
                    : emailStatus === 'error'
                      ? '#fee2e2'
                      : '#5B48F8',
                color:
                  emailStatus === 'sent'
                    ? '#166534'
                    : emailStatus === 'error'
                      ? '#991b1b'
                      : '#fff',
                cursor:
                  !reportId || emailStatus === 'sending'
                    ? 'not-allowed'
                    : 'pointer',
                opacity: !reportId || emailStatus === 'sending' ? 0.7 : 1,
              }}
            >
              {emailStatus === 'sending'
                ? 'Sending…'
                : emailStatus === 'sent'
                  ? 'Email Sent!'
                  : emailStatus === 'error'
                    ? 'Send Failed'
                    : 'Re-send Email'}
            </button>
          )}
          {batchContext &&
            (batchContext.currentIndex + 1 < batchContext.total ? (
              <button
                type="button"
                onClick={batchContext.onNext}
                disabled={!batchContext.isNextReady}
                title={
                  batchContext.isNextReady
                    ? 'Open the next report'
                    : 'Next report is still generating…'
                }
                style={{
                  padding: '6px 14px',
                  fontSize: 13,
                  fontWeight: 600,
                  border: '1px solid #2C2C2C',
                  borderRadius: 6,
                  background: batchContext.isNextReady ? '#2C2C2C' : '#f3f4f6',
                  color: batchContext.isNextReady ? '#fff' : '#9ca3af',
                  cursor: batchContext.isNextReady ? 'pointer' : 'not-allowed',
                }}
              >
                {batchContext.isNextReady
                  ? 'Next file →'
                  : batchContext.isNextFailed
                    ? 'Review next (failed)'
                    : 'Next generating…'}
              </button>
            ) : (
              <button
                type="button"
                onClick={batchContext.onFinish}
                style={{
                  padding: '6px 14px',
                  fontSize: 13,
                  fontWeight: 600,
                  border: '1px solid #2C2C2C',
                  borderRadius: 6,
                  background: '#2C2C2C',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                Finish
              </button>
            ))}
          {batchContext && batchContext.onCancel && (
            <button
              type="button"
              onClick={batchContext.onCancel}
              title="Stop the bulk batch — already-generated reports stay in your dashboard"
              style={{
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: 500,
                border: '1px solid #dc2626',
                borderRadius: 6,
                background: '#fff',
                color: '#dc2626',
                cursor: 'pointer',
              }}
            >
              Cancel batch
            </button>
          )}
        </div>
      </div>

      {/* Main content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <ReportContent
          reportState={reportState}
          highlightedSections={flashSections}
          navRef={sectionNavRef}
          onReady={handleReportContentReady}
          isAlpha={isAlpha}
          reportId={reportId}
          onDownload={handleDownload}
          downloadStatus={downloadStatus}
          onAward={award}
          onCredibilityAnswer={handleCredibilityAnswer}
        />

        {/* Chat panel */}
        <div
          ref={chatPanelRef}
          style={{
            flex: '0 0 334px',
            display: 'flex',
            flexDirection: 'column',
            background: '#F8F7F5',
            borderLeft: '1px solid #E5E7EB',
          }}
        >
          {/* Chat header */}
          <div
            style={{
              padding: '13px 16px 11px',
              background: '#fff',
              borderBottom: '1px solid #E5E7EB',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: '#0F172A',
                letterSpacing: '-0.2px',
              }}
            >
              Refine the Business Case
            </div>
            <div
              style={{
                fontSize: 11,
                color: '#6B7280',
                marginTop: 2,
              }}
            >
              Ask me to adjust, rewrite, or share →
            </div>
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {/* Initial insight panel */}
            <div
              style={{
                background: '#EFF6FF',
                borderRadius: 8,
                padding: 14,
                borderLeft: '3px solid #5B48F8',
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: '#5B48F8',
                  marginBottom: 6,
                }}
              >
                Profit Map Ready
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: '#374151',
                  lineHeight: 1.55,
                }}
              >
                {initialMessage}
              </div>
            </div>

            {/* Prompt chips — shown before first user message */}
            {chatHistory.filter((m) => m.role === 'user').length === 0 && (
              <div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: '#9CA3AF',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    marginBottom: 10,
                  }}
                >
                  Guided actions
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 6,
                  }}
                >
                  {[
                    'Show assumptions',
                    'Change currency',
                    'Rank by payback',
                    'Rewrite for CFO',
                    'Draft email to decision-maker',
                    'Show first sprint',
                    'Adjust team size',
                    'Make board-ready',
                  ].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => handleSend(null, chip)}
                      disabled={isAgentRunning}
                      style={{
                        padding: '8px 10px',
                        fontSize: 11,
                        fontWeight: 500,
                        color: '#5B21B6',
                        background: '#F5F3FF',
                        border: 'none',
                        borderRadius: 6,
                        cursor: isAgentRunning ? 'not-allowed' : 'pointer',
                        fontFamily: 'inherit',
                        textAlign: 'left',
                        opacity: isAgentRunning ? 0.5 : 1,
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        if (!isAgentRunning)
                          e.currentTarget.style.background = '#EDE9FE'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#F5F3FF'
                      }}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Conversation history */}
            {chatHistory.map((msg, i) => {
              if (msg.role === 'tool') return null
              const text =
                typeof msg.content === 'string'
                  ? msg.content
                  : Array.isArray(msg.content)
                    ? msg.content
                        .filter((p) => p.type === 'text')
                        .map((p) => p.text)
                        .join('')
                        .trim()
                    : ''
              if (!text) return null
              const isUser = msg.role === 'user'
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: isUser ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div
                    style={
                      isUser ? styles.bubble.user : styles.bubble.assistant
                    }
                  >
                    {isUser ? text : renderText(text)}
                  </div>
                </div>
              )
            })}

            {/* Schedule-a-call prompt — shown after 5th message response */}
            {showCallPrompt && !isEmployee && (
              <div
                style={{
                  background: '#F5F3FF',
                  border: '1px solid #C4B5FD',
                  borderRadius: 12,
                  padding: '12px 14px',
                }}
              >
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#0F172A',
                    margin: '0 0 5px',
                    letterSpacing: '-0.2px',
                  }}
                >
                  Ready to validate these findings?
                </p>
                <p
                  style={{
                    fontSize: 13,
                    color: '#374151',
                    lineHeight: 1.55,
                    margin: '0 0 10px',
                  }}
                >
                  Book a free 30-min call with a LyRise specialist to walk
                  through your Profit Map and identify the first workflow to
                  fix.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <a
                    href="https://api.leadconnectorhq.com/widget/bookings/strategy-call-with-lyrisesivto9"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-block',
                      padding: '8px 16px',
                      background: '#5B48F8',
                      color: '#fff',
                      borderRadius: 10,
                      fontSize: 13,
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    Book a validation call →
                  </a>
                  <button
                    id="proposal-feedback-btn"
                    type="button"
                    style={{
                      padding: '8px 14px',
                      background: 'transparent',
                      color: '#6B7280',
                      border: '1px solid #E5E7EB',
                      borderRadius: 10,
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    Anything unclear?
                  </button>
                </div>
              </div>
            )}

            {/* Changed sections chips — shown after agent finishes */}
            {!isAgentRunning && changedSections.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 5,
                  paddingLeft: 2,
                }}
              >
                <span style={{ fontSize: 11, color: '#8a8aaa', flexShrink: 0 }}>
                  Sections updated:
                </span>
                {changedSections.map((navKey) => (
                  <button
                    key={navKey}
                    type="button"
                    onClick={() => handleSectionChipClick(navKey)}
                    title={`Scroll to "${NAV_LABEL_BY_KEY[navKey] ?? navKey}"`}
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      background: '#EDE9FE',
                      color: '#2957ff',
                      border: '1px solid #C4B5FD',
                      borderRadius: 4,
                      padding: '2px 7px',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {NAV_LABEL_BY_KEY[navKey] ?? navKey}
                  </button>
                ))}
              </div>
            )}

            {/* Agent working — tool label as pill, streaming text in bubble */}
            {activeTool && !streamingText && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    padding: '5px 11px',
                    background: '#EDE9FE',
                    border: '1px solid #5B48F8',
                    borderRadius: 12,
                    fontSize: 11,
                    color: '#5B48F8',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  <span style={styles.dot} />
                  {activeTool}
                </div>
              </div>
            )}
            {streamingText && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={styles.bubble.assistant}>
                  {renderText(streamingText)}
                  <span style={styles.cursor} />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div
            style={{
              padding: '12px 14px 14px',
              background: '#fff',
              borderTop: '1px solid #E5E7EB',
            }}
          >
            {reportId && (
              <div
                style={{
                  padding: '6px 14px 0',
                  textAlign: 'right',
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    color: limitReached ? '#f59e0b' : '#94a3b8',
                  }}
                >
                  {Math.min(userSentCount, REPORT_CHAT_MESSAGE_LIMIT)} /{' '}
                  {REPORT_CHAT_MESSAGE_LIMIT} messages used
                </span>
              </div>
            )}
            {limitReached ? (
              <div
                style={{
                  padding: '12px 14px',
                  background: '#fffbeb',
                  textAlign: 'center',
                }}
              >
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#92400e',
                    margin: '0 0 4px',
                  }}
                >
                  You&apos;ve used your {REPORT_CHAT_MESSAGE_LIMIT} refinements.
                </p>
                {isEmployee ? (
                  <p style={{ fontSize: 12, color: '#92400e', margin: 0 }}>
                    This report is capped for the alpha release.
                  </p>
                ) : (
                  <a
                    href="https://api.leadconnectorhq.com/widget/bookings/strategy-call-with-lyrisesivto9"
                    style={{ fontSize: 12, color: '#5B48F8' }}
                  >
                    Contact LyRise to continue →
                  </a>
                )}
              </div>
            ) : (
              <div style={{ padding: '10px 14px 12px' }}>
                <form
                  onSubmit={handleSend}
                  style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}
                >
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask me to change anything in the report…"
                    disabled={isAgentRunning}
                    rows={2}
                    style={{
                      flex: 1,
                      padding: '9px 12px',
                      border: '1.5px solid #E5E7EB',
                      borderRadius: 10,
                      fontSize: 13,
                      lineHeight: 1.5,
                      resize: 'none',
                      outline: 'none',
                      fontFamily: 'inherit',
                      color: '#0F172A',
                      background: isAgentRunning ? '#F9F9F9' : '#fff',
                      transition: 'border-color 0.15s, box-shadow 0.15s',
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#5B48F8'
                      e.target.style.boxShadow =
                        '0 0 0 2px rgba(91, 72, 248, 0.15)'
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#E5E7EB'
                      e.target.style.boxShadow = 'none'
                    }}
                  />
                  <button
                    type="submit"
                    disabled={isAgentRunning || !input.trim()}
                    style={{
                      padding: '9px 18px',
                      borderRadius: 10,
                      border: 'none',
                      background:
                        isAgentRunning || !input.trim() ? '#E5E7EB' : '#111827',
                      color:
                        isAgentRunning || !input.trim() ? '#9CA3AF' : '#fff',
                      fontWeight: 600,
                      fontSize: 13,
                      cursor:
                        isAgentRunning || !input.trim()
                          ? 'not-allowed'
                          : 'pointer',
                      flexShrink: 0,
                      fontFamily: 'inherit',
                      transition: 'background 0.15s',
                    }}
                  >
                    Send →
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>

      {isTourOpen && (
        <SpotlightTourOverlay
          tourRect={tourRect}
          step={tourSteps[tourStep]}
          stepIndex={tourStep}
          journeyLabels={TOUR_JOURNEY}
          isLastStep={isLastStep}
          onNext={advanceTour}
          onClose={closeTour}
          lastStepLabel="Got it"
        />
      )}

      {toastMsg && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            background: '#0F172A',
            color: '#fff',
            padding: '12px 18px',
            borderRadius: 10,
            fontSize: 12.5,
            fontWeight: 600,
            boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
            zIndex: 100,
          }}
        >
          ⚡ {toastMsg}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
