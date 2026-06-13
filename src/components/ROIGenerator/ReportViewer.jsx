import React, { useState, useRef, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { drainSSE } from '@/src/lib/drainSSE'
import { trackShareEvent } from '@/src/lib/trackShareEvent'

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

// Per-tab heading shown to the user. Each entry mirrors the actual <h2> text
// in the corresponding template; a missing key for a tab means the section
// doesn't exist there (clicking the chip auto-switches to the other tab).
const SECTION_INFO = {
  financials: { exec: 'KPI Bar', full: 'Executive Summary' },
  thesis: { exec: 'The Pattern Underneath', full: 'The Pattern Underneath' },
  workflows: {
    exec: 'Where the Operational Dividend Comes From',
    full: 'Proposed AI Workflows',
  },
  profit_levers: {
    exec: 'Where the Profit Uplift Comes From',
    full: 'Profit Uplift Analysis',
  },
  cost_of_delay: { exec: 'Cost of Delay', full: 'Cost of Delay' },
  cta: { exec: 'What Happens Next', full: 'Next Steps' },
  resilience_rows: { full: 'Resilience Positioning' },
  risks: { full: 'Risks & Mitigations' },
  pilot: { full: 'Recommended Starting Point' },
}

function getSectionLabel(key, activeTab) {
  const info = SECTION_INFO[key]
  if (!info) return key
  return info[activeTab] ?? info.exec ?? info.full ?? key
}

function getTargetTab(key, activeTab) {
  const info = SECTION_INFO[key]
  if (!info) return activeTab
  if (info[activeTab]) return activeTab
  return info.exec ? 'exec' : 'full'
}

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
  forceTour = false,
}) {
  const [reportState, setReportState] = useState(initialState)
  const [htmlLoading, setHtmlLoading] = useState(
    !initialState?.renderedHtml && !initialState?.renderedFullHtml,
  )
  const [chatHistory, setChatHistory] = useState(initialChatHistory)
  const [initialMessage] = useState(() => buildInitialMessage(initialState))
  const [streamingText, setStreamingText] = useState('')
  const [activeTool, setActiveTool] = useState(null)
  const [isAgentRunning, setIsAgentRunning] = useState(false)
  const [input, setInput] = useState('')
  const [emailStatus, setEmailStatus] = useState('idle')
  const [activeTab, setActiveTab] = useState('exec')
  const [lastChangedSections, setLastChangedSections] = useState([])
  const [limitReached, setLimitReached] = useState(initialMessagesUsed >= 5)
  const [userSentCount, setUserSentCount] = useState(initialMessagesUsed)
  const [showCallPrompt, setShowCallPrompt] = useState(false)
  const [downloadStatus, setDownloadStatus] = useState('idle')
  const [tourStep, setTourStep] = useState(-1)
  const [tourRect, setTourRect] = useState(null)

  const iframeRef = useRef(null)
  const messagesEndRef = useRef(null)
  const pendingHighlightsRef = useRef([])
  const execTabRef = useRef(null)
  const fullTabRef = useRef(null)
  const downloadRef = useRef(null)
  const resendEmailRef = useRef(null)
  const chatPanelRef = useRef(null)

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

  const TOUR_JOURNEY = ['Your Report', 'Full Analysis', 'Export & Share', 'Refine with AI']

  const TOUR_STEPS = [
    {
      title: 'Your Executive Summary',
      body: 'This single-page view is built for decision-makers — total hours returned, Operational Dividend, and Total Financial Gain, all sourced from live research about your company. Share it directly with leadership.',
      placement: 'bottom-start',
      targetRef: execTabRef,
    },
    {
      title: 'The complete business case',
      body: 'Switch to the Full Report for the deep dive: every workflow modelled line by line, the source behind each billing rate, a 10-week implementation roadmap, resilience positioning, and risk mitigations.',
      placement: 'bottom-start',
      targetRef: fullTabRef,
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
      body: 'Ask the assistant to change the currency, add a workflow, adjust an assumption, or rewrite any section. The report updates in real time — every edit is tracked so you can resend the latest version.',
      placement: 'left',
      targetRef: chatPanelRef,
    },
  ]

  useEffect(() => {
    if (!htmlLoading) return
    fetch(`/api/reports/${reportId}`)
      .then((r) => r.json())
      .then(({ renderedHtml, renderedFullHtml }) => {
        setReportState((prev) => ({ ...prev, renderedHtml, renderedFullHtml }))
        setHtmlLoading(false)
      })
      .catch(() => setHtmlLoading(false))
  }, [reportId, htmlLoading])

  useEffect(() => {
    if (forceTour) {
      // Share-link visitors should always see the tour on first arrival
      // from the email, even if a prior anon visit dismissed it.
      setTourStep(0)
      return
    }
    try {
      if (!localStorage.getItem('lyrise_tour_seen')) setTourStep(0)
    } catch {
      /* private browsing */
    }
  }, [forceTour])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory, streamingText, activeTool])

  const applySectionHighlights = useCallback((doc, sections) => {
    if (!doc?.body?.querySelector('[data-section]')) return false
    sections.forEach((section) => {
      doc.querySelectorAll(`[data-section="${section}"]`).forEach((el) => {
        el.classList.add('section-highlighted')
      })
    })
    return true
  }, [])

  // Scrolls the iframe to the first element matching the given data-section,
  // applies the highlight class, and pulses focus. Returns true if the target
  // was found in the current iframe document.
  const scrollIframeToSection = useCallback((section) => {
    const doc = iframeRef.current?.contentDocument
    const el = doc?.querySelector(`[data-section="${section}"]`)
    if (!el) return false
    el.classList.add('section-highlighted')
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return true
  }, [])

  const pendingScrollRef = useRef(null)

  // Drains queued highlights and a queued scroll target. Called from both
  // the iframe onLoad event (when srcDoc actually changes) and from a
  // post-render effect (fallback when the same srcDoc is reused).
  const drainPendingActions = useCallback(() => {
    const sections = pendingHighlightsRef.current
    if (sections.length) {
      const doc = iframeRef.current?.contentDocument
      if (applySectionHighlights(doc, sections)) {
        pendingHighlightsRef.current = []
      }
    }
    const pendingScroll = pendingScrollRef.current
    if (pendingScroll && scrollIframeToSection(pendingScroll)) {
      pendingScrollRef.current = null
    }
  }, [applySectionHighlights, scrollIframeToSection])

  useEffect(() => {
    drainPendingActions()
  }, [reportState, activeTab, drainPendingActions])

  const handleSectionChipClick = useCallback(
    (section) => {
      const targetTab = getTargetTab(section, activeTab)
      if (targetTab !== activeTab) {
        pendingScrollRef.current = section
        setActiveTab(targetTab)
        return
      }
      // Same tab — scroll immediately. Fall back to queueing if the iframe
      // hasn't rendered the new srcDoc yet.
      if (!scrollIframeToSection(section)) {
        pendingScrollRef.current = section
      }
    },
    [activeTab, scrollIframeToSection],
  )

  useEffect(() => {
    if (tourStep < 0 || tourStep >= TOUR_STEPS.length) {
      setTourRect(null)
      return undefined
    }
    const recompute = () => {
      const el = TOUR_STEPS[tourStep]?.targetRef?.current
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
    return () => window.removeEventListener('resize', recompute)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourStep])

  const advanceTour = useCallback(() => {
    setTourStep((s) => {
      const next = s + 1 >= TOUR_STEPS.length ? -1 : s + 1
      if (next === -1) {
        try {
          localStorage.setItem('lyrise_tour_seen', '1')
        } catch {
          /* private browsing */
        }
      }
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const closeTour = useCallback(() => {
    try {
      localStorage.setItem('lyrise_tour_seen', '1')
    } catch {
      /* private browsing */
    }
    setTourStep(-1)
  }, [])

  const handleTabSelect = useCallback((tab) => {
    setActiveTab(tab)
  }, [])

  const activeHtml =
    activeTab === 'exec'
      ? reportState?.renderedHtml ?? initialState?.renderedHtml
      : reportState?.renderedFullHtml ?? initialState?.renderedFullHtml
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
      setLastChangedSections([])
      // Clear any section highlights from the previous agent response
      iframeRef.current?.contentDocument
        ?.querySelectorAll('.section-highlighted')
        .forEach((el) => el.classList.remove('section-highlighted'))
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
          setLimitReached(true)
          setIsAgentRunning(false)
          return
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
            pendingHighlightsRef.current = event.changedSections ?? []
            setLastChangedSections((prev) => [
              ...new Set([...prev, ...(event.changedSections ?? [])]),
            ])
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
            if (!isEmployee && newCount === 5) setShowCallPrompt(true)
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

  const handleIframeLoad = useCallback(() => {
    drainPendingActions()
  }, [drainPendingActions])

  const handleDownload = useCallback(async () => {
    if (!reportId || downloadStatus === 'downloading') return
    setDownloadStatus('downloading')
    try {
      const res = await fetch('/api/roi-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, reportType: activeTab }),
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
  }, [downloadStatus, reportId, activeTab, isShareLink, shareToken])

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
        background: '#003f87',
        color: '#fff',
        boxShadow: '0 1px 2px rgba(0, 63, 135, 0.18)',
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
      background: '#003f87',
      marginRight: 5,
      verticalAlign: 'middle',
      animation: 'pulse 1s infinite',
    },
    cursor: {
      display: 'inline-block',
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: '#003f87',
      marginLeft: 4,
      verticalAlign: 'middle',
      animation: 'pulse 1s infinite',
    },
  }

  const popoverPositionFor = (placement, rect) => {
    const w = 300
    const gap = 14
    if (placement === 'bottom-start') {
      return { top: rect.top + rect.height + gap, left: Math.max(8, rect.left) }
    }
    if (placement === 'bottom-end') {
      return {
        top: rect.top + rect.height + gap,
        left: Math.max(8, rect.left + rect.width - w),
      }
    }
    if (placement === 'left') {
      return {
        top: Math.max(8, rect.top + 24),
        left: Math.max(16, rect.left - w - gap),
      }
    }
    return { top: rect.top + rect.height + gap, left: rect.left }
  }
  const isTourOpen =
    tourStep >= 0 && tourStep < TOUR_STEPS.length && tourRect !== null
  const isLastStep = tourStep === TOUR_STEPS.length - 1

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        fontFamily:
          "Calibri, 'Carlito', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
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
          <div style={{ fontWeight: 600, fontSize: 14, color: '#1a1a1a' }}>
            {company} — AI ROI Report
          </div>
          {batchContext && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#2957FF',
                background: '#EBF0F8',
                borderRadius: 999,
                padding: '3px 10px',
                letterSpacing: '0.02em',
              }}
            >
              BULK · {batchContext.currentIndex + 1} of {batchContext.total}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative' }}>
            <div
              style={{
                display: 'flex',
                gap: 2,
                border: '1px solid #e2e8f0',
                borderRadius: 6,
                overflow: 'hidden',
              }}
            >
              <button
                ref={execTabRef}
                type="button"
                onClick={() => handleTabSelect('exec')}
                style={{
                  padding: '6px 12px',
                  fontSize: 13,
                  fontWeight: 500,
                  border: 'none',
                  background: activeTab === 'exec' ? '#2957FF' : '#fff',
                  color: activeTab === 'exec' ? '#fff' : '#374151',
                  cursor: 'pointer',
                }}
              >
                Executive Summary
              </button>
              <button
                ref={fullTabRef}
                type="button"
                onClick={() => handleTabSelect('full')}
                style={{
                  padding: '6px 12px',
                  fontSize: 13,
                  fontWeight: 500,
                  border: 'none',
                  background: activeTab === 'full' ? '#2957FF' : '#fff',
                  color: activeTab === 'full' ? '#fff' : '#374151',
                  cursor: 'pointer',
                }}
              >
                Full Report
              </button>
            </div>
          </div>
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
            onClick={() => setTourStep(0)}
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
                border: '1px solid #2957FF',
                borderRadius: 6,
                background:
                  emailStatus === 'sent'
                    ? '#dcfce7'
                    : emailStatus === 'error'
                    ? '#fee2e2'
                    : '#2957FF',
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
        {/* Report iframe (65% width) */}
        <div
          style={{
            flex: '0 0 65%',
            overflow: 'hidden',
            borderRight: '1px solid #e2e8f0',
            background: '#f1f5f9',
            position: 'relative',
          }}
        >
          {htmlLoading && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 16,
                background: '#f1f5f9',
                zIndex: 2,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  border: '3px solid #e2e8f0',
                  borderTopColor: '#2957FF',
                  borderRadius: '50%',
                  animation: 'spin 0.75s linear infinite',
                }}
              />
              <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>
                Loading report…
              </span>
            </div>
          )}
          <iframe
            ref={iframeRef}
            srcDoc={activeHtml ?? ''}
            onLoad={handleIframeLoad}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              opacity: htmlLoading ? 0 : 1,
            }}
            title="ROI Report Preview"
          />
        </div>

        {/* Chat panel */}
        <div
          ref={chatPanelRef}
          style={{
            flex: '0 0 35%',
            display: 'flex',
            flexDirection: 'column',
            background: '#f5f5f5',
          }}
        >
          {/* Chat header */}
          <div
            style={{
              padding: '12px 16px 10px',
              background: '#fff',
              borderBottom: '2.5px solid #003f87',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 0.8,
                color: '#003f87',
              }}
            >
              AI Assistant
            </div>
            <div
              style={{
                fontSize: 11,
                color: '#5a5a6e',
                marginTop: 2,
              }}
            >
              Refine the report with natural language
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
            {/* Initial assistant message — rendered as insight panel */}
            <div
              style={{
                display: 'flex',
                background: '#fff',
                border: '1px solid #d0d0d0',
                marginRight: 8,
              }}
            >
              <div style={{ width: 4, background: '#003f87', flexShrink: 0 }} />
              <div
                style={{
                  padding: '10px 14px',
                  fontSize: 13,
                  color: '#1a1a1a',
                  lineHeight: 1.55,
                  flex: 1,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 0.6,
                    color: '#003f87',
                    marginBottom: 4,
                  }}
                >
                  Report Ready
                </div>
                {initialMessage}
              </div>
            </div>

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
                  background: '#f0f4ff',
                  border: '1px solid #c7d2fe',
                  borderRadius: 12,
                  padding: '12px 14px',
                }}
              >
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#1e3a8a',
                    margin: '0 0 5px',
                  }}
                >
                  Want to walk through these findings with our team?
                </p>
                <p
                  style={{
                    fontSize: 13,
                    color: '#374151',
                    lineHeight: 1.5,
                    margin: '0 0 10px',
                  }}
                >
                  Book a free 30-min call with a LyRise specialist to explore
                  next steps for your ROI strategy.
                </p>
                <a
                  href="https://api.leadconnectorhq.com/widget/bookings/strategy-call-with-lyrisesivto9"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-block',
                    padding: '7px 14px',
                    background: '#2957FF',
                    color: '#fff',
                    borderRadius: 7,
                    fontSize: 13,
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  Schedule a free call →
                </a>
              </div>
            )}

            {/* Changed sections chips — shown after agent finishes */}
            {!isAgentRunning && lastChangedSections.length > 0 && (
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
                {[...new Set(lastChangedSections)]
                  .filter((s) => SECTION_INFO[s])
                  .map((s) => {
                    const targetTab = getTargetTab(s, activeTab)
                    const label = getSectionLabel(s, targetTab)
                    const willSwitchTab = targetTab !== activeTab
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => handleSectionChipClick(s)}
                        title={
                          willSwitchTab
                            ? `Switches to ${
                                targetTab === 'exec'
                                  ? 'Executive Summary'
                                  : 'Full Report'
                              } and scrolls to "${label}"`
                            : `Scroll to "${label}"`
                        }
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          background: '#eef2ff',
                          color: '#2957ff',
                          border: '1px solid #c7d2fe',
                          borderRadius: 4,
                          padding: '2px 7px',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        {label}
                      </button>
                    )
                  })}
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
                    background: '#ebf0f8',
                    border: '1px solid #003f87',
                    borderRadius: 12,
                    fontSize: 11,
                    color: '#003f87',
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
              borderTop: '1px solid #d0d0d0',
            }}
          >
            {reportId && !isEmployee && (
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
                  {Math.min(userSentCount, 5)} / 5 messages used
                </span>
              </div>
            )}
            {!isEmployee && limitReached ? (
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
                  You&apos;ve used your 5 free messages.
                </p>
                <a
                  href="https://api.leadconnectorhq.com/widget/bookings/strategy-call-with-lyrisesivto9"
                  style={{ fontSize: 12, color: '#2957FF' }}
                >
                  Contact LyRise to continue →
                </a>
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
                      border: '1px solid #d0d0d0',
                      borderRadius: 6,
                      fontSize: 13,
                      lineHeight: 1.5,
                      resize: 'none',
                      outline: 'none',
                      fontFamily: 'inherit',
                      color: '#1a1a1a',
                      background: isAgentRunning ? '#f5f5f5' : '#fff',
                      transition: 'border-color 0.15s, box-shadow 0.15s',
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#003f87'
                      e.target.style.boxShadow =
                        '0 0 0 2px rgba(0, 63, 135, 0.15)'
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#d0d0d0'
                      e.target.style.boxShadow = 'none'
                    }}
                  />
                  <button
                    type="submit"
                    disabled={isAgentRunning || !input.trim()}
                    style={{
                      padding: '9px 18px',
                      borderRadius: 6,
                      border: 'none',
                      background:
                        isAgentRunning || !input.trim() ? '#d0d0d0' : '#003f87',
                      color:
                        isAgentRunning || !input.trim() ? '#5a5a6e' : '#fff',
                      fontWeight: 700,
                      fontSize: 12,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      cursor:
                        isAgentRunning || !input.trim()
                          ? 'not-allowed'
                          : 'pointer',
                      flexShrink: 0,
                      transition: 'background 0.15s',
                    }}
                  >
                    Send
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>

      {isTourOpen && (
        <>
          {/* Top dim */}
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              height: Math.max(0, tourRect.top - 6),
              background: 'rgba(15, 23, 42, 0.72)',
              zIndex: 1000,
              transition: 'all 0.25s ease',
            }}
          />
          {/* Bottom dim */}
          <div
            style={{
              position: 'fixed',
              top: tourRect.top + tourRect.height + 6,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(15, 23, 42, 0.72)',
              zIndex: 1000,
              transition: 'all 0.25s ease',
            }}
          />
          {/* Left dim */}
          <div
            style={{
              position: 'fixed',
              top: Math.max(0, tourRect.top - 6),
              left: 0,
              width: Math.max(0, tourRect.left - 6),
              height: tourRect.height + 12,
              background: 'rgba(15, 23, 42, 0.72)',
              zIndex: 1000,
              transition: 'all 0.25s ease',
            }}
          />
          {/* Right dim */}
          <div
            style={{
              position: 'fixed',
              top: Math.max(0, tourRect.top - 6),
              left: tourRect.left + tourRect.width + 6,
              right: 0,
              height: tourRect.height + 12,
              background: 'rgba(15, 23, 42, 0.72)',
              zIndex: 1000,
              transition: 'all 0.25s ease',
            }}
          />
          {/* Spotlight outline */}
          <div
            style={{
              position: 'fixed',
              top: tourRect.top - 6,
              left: tourRect.left - 6,
              width: tourRect.width + 12,
              height: tourRect.height + 12,
              borderRadius: 10,
              boxShadow:
                '0 0 0 2px rgba(255,255,255,0.45) inset, 0 0 24px rgba(41, 87, 255, 0.55)',
              pointerEvents: 'none',
              zIndex: 1001,
              transition: 'all 0.25s ease',
            }}
          />
          {/* Popover */}
          <div
            style={{
              position: 'fixed',
              ...popoverPositionFor(TOUR_STEPS[tourStep].placement, tourRect),
              width: 300,
              background: '#fff',
              borderRadius: 10,
              padding: '16px 18px 14px',
              boxShadow:
                '0 16px 40px rgba(0,0,0,0.35), 0 4px 12px rgba(0,0,0,0.15)',
              zIndex: 1002,
              transition: 'all 0.25s ease',
            }}
          >
            <button
              type="button"
              onClick={closeTour}
              aria-label="Close"
              style={{
                position: 'absolute',
                top: 8,
                right: 10,
                width: 24,
                height: 24,
                border: 'none',
                background: 'transparent',
                color: '#94a3b8',
                fontSize: 18,
                cursor: 'pointer',
                padding: 0,
                lineHeight: 1,
              }}
            >
              ×
            </button>
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: '#0a2540',
                marginBottom: 6,
                paddingRight: 18,
              }}
            >
              {TOUR_STEPS[tourStep].title}
            </div>
            <div
              style={{
                fontSize: 13,
                color: '#475569',
                lineHeight: 1.5,
                marginBottom: 14,
              }}
            >
              {TOUR_STEPS[tourStep].body}
            </div>
            {/* Named journey progress bar */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 5 }}>
              {TOUR_JOURNEY.map((label, i) => (
                <div
                  key={label}
                  title={label}
                  style={{
                    flex: 1,
                    height: 3,
                    borderRadius: 2,
                    background: i <= tourStep ? '#2957FF' : '#e2e8f0',
                    transition: 'background 0.2s',
                  }}
                />
              ))}
            </div>
            <div
              style={{
                fontSize: 11,
                color: '#94a3b8',
                marginBottom: 12,
                fontWeight: 500,
              }}
            >
              {TOUR_JOURNEY[tourStep]}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                onClick={advanceTour}
                style={{
                  padding: '7px 16px',
                  background: '#2957FF',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {isLastStep ? 'Got it' : 'Next →'}
              </button>
            </div>
          </div>
        </>
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
