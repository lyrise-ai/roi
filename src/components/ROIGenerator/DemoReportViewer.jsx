import React, { useState, useRef, useCallback, useEffect } from 'react'

const TOUR_LENGTH = 6

const JOURNEY_LABELS = [
  'The Report',
  'The Numbers',
  'The Full Picture',
  'Ask Anything',
  'Take It With You',
  'Your Turn',
]

const SCRIPTED_CHAT = [
  { role: 'user', content: 'How confident are these numbers?' },
  {
    role: 'assistant',
    content:
      "High confidence for this demo — all workflows are grounded in real consulting industry benchmarks (Glassdoor, LinkedIn Salary data) and Meridian's profile mirrors a typical 120-person US firm.\n\n**Your report** will use live research from your actual company — websites, job listings, LinkedIn headcount — so every number will reflect your specific billing rates and workflow volumes.",
  },
]

const CHIP_LABEL = 'What if we focused only on Proposal Writing?'

const CHIP_REPLY =
  'Scoped to **Proposal Writing Automation** only — the report has updated to a single-workflow analysis.\n\nFewer hours recovered overall, but a simpler implementation: one team, one deliverable, one quality gate. The payback period still fits within the first two quarters.\n\n**Your report** will scope to whatever workflows your data shows are the highest-leverage starting point.'

function getSessionId() {
  try {
    let id = sessionStorage.getItem('lyrise_demo_session')
    if (!id) {
      id =
        (typeof crypto !== 'undefined' && crypto.randomUUID?.()) ||
        Math.random().toString(36).slice(2) + Date.now().toString(36)
      sessionStorage.setItem('lyrise_demo_session', id)
    }
    return id
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36)
  }
}

function renderMarkdown(text) {
  return text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      part
    ),
  )
}

function popoverPositionFor(placement, rect) {
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
  // Popover inside the spotlight area, top-right corner — used for large targets
  if (placement === 'inside-top-right') {
    return { top: rect.top + 20, left: Math.max(8, rect.left + rect.width - w - 20) }
  }
  return { top: rect.top + rect.height + gap, left: rect.left }
}

export default function DemoReportViewer({ email, companyName, onFinish, onSkip }) {
  const [execHtml, setExecHtml] = useState(null)
  const [fullHtml, setFullHtml] = useState(null)
  const [execHtmlAlt, setExecHtmlAlt] = useState(null)
  const [fullHtmlAlt, setFullHtmlAlt] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('exec')
  const [variant, setVariant] = useState('base')
  const [chatHistory, setChatHistory] = useState(SCRIPTED_CHAT)
  const [chipUsed, setChipUsed] = useState(false)
  const [chipLoading, setChipLoading] = useState(false)
  const [tourStep, setTourStep] = useState(0)
  const [tourRect, setTourRect] = useState(null)

  const sessionIdRef = useRef(getSessionId())
  const execTabRef = useRef(null)
  const fullTabRef = useRef(null)
  const iframeContainerRef = useRef(null)
  const chatPanelRef = useRef(null)
  const actionButtonsRef = useRef(null)
  const ctaRef = useRef(null)
  const messagesEndRef = useRef(null)

  const trackEvent = useCallback(
    (eventType, extra = {}) => {
      fetch('/api/analytics/demo-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: eventType,
          session_id: sessionIdRef.current,
          company_name: companyName || null,
          email: email || null,
          ...extra,
        }),
      }).catch(() => {})
    },
    [companyName, email],
  )

  const TOUR_STEPS = [
    {
      title: 'Welcome to your ROI report',
      body: "This is exactly what your report will look like — built with the same AI pipeline from live research about your company. Meridian Consulting Group is our sample; your report will use your actual workflows, billing rates, and industry data.",
      placement: 'bottom-start',
      targetRef: execTabRef,
    },
    {
      title: 'Your financial impact, quantified',
      body: "The Executive Summary shows your total hours returned, Operational Dividend (direct labor value recaptured), and Total Financial Gain. Every number comes from modelling real workflow volumes against grounded billing rate data.",
      placement: 'inside-top-right',
      targetRef: iframeContainerRef,
    },
    {
      title: 'Every assumption, explained',
      body: "The Full Report reveals the complete analysis: each workflow modelled line by line, the source behind every billing rate, a 10-week implementation roadmap, resilience positioning, and risk mitigations.",
      placement: 'bottom-start',
      targetRef: fullTabRef,
    },
    {
      title: 'Your report is a conversation',
      body: "The AI assistant edits any part of the report in real time — change the currency, add a workflow, adjust an assumption, or ask a strategic question. Try the suggestion chip below to see it in action.",
      placement: 'left',
      targetRef: chatPanelRef,
    },
    {
      title: 'Download & share',
      body: "Export as PDF for your leadership team, or resend to your inbox after you've refined it. The PDF renders exactly as you see it — ready for a board deck or CFO conversation.",
      placement: 'bottom-end',
      targetRef: actionButtonsRef,
    },
    {
      title: 'Ready to see your real numbers?',
      body: "That's the full experience. Your report will be generated from live research about your actual company — your workflows, your billing rates, your industry context. Click below to get started.",
      placement: 'bottom-end',
      targetRef: ctaRef,
    },
  ]

  // Load base variant on mount, then silently pre-fetch alt
  useEffect(() => {
    let mounted = true
    trackEvent('demo_tour_started')
    fetch('/api/demo-report?variant=base')
      .then((r) => r.json())
      .then(({ execHtml: eh, fullHtml: fh }) => {
        if (!mounted) return null
        setExecHtml(eh)
        setFullHtml(fh)
        setIsLoading(false)
        return fetch('/api/demo-report?variant=alt')
      })
      .then((r) => r?.json())
      .then((data) => {
        if (!mounted || !data) return
        setExecHtmlAlt(data.execHtml)
        setFullHtmlAlt(data.fullHtml)
      })
      .catch(() => {
        if (mounted) setIsLoading(false)
      })
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-switch tabs at relevant tour steps
  useEffect(() => {
    if (tourStep === 2) setActiveTab('full')
    else if (tourStep <= 1) setActiveTab('exec')
  }, [tourStep])

  // Scroll chat to bottom when history changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory, chipLoading])

  // Recompute spotlight rect whenever tour step changes
  useEffect(() => {
    if (tourStep < 0 || tourStep >= TOUR_LENGTH) {
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
      setTourRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    recompute()
    window.addEventListener('resize', recompute)
    return () => window.removeEventListener('resize', recompute)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourStep])

  const advanceTour = useCallback(() => {
    setTourStep((s) => {
      const next = s + 1
      if (next >= TOUR_LENGTH) {
        trackEvent('demo_tour_completed')
        try {
          localStorage.setItem('lyrise_tour_seen', '1')
        } catch {
          /* private browsing */
        }
        onFinish?.()
        return -1
      }
      trackEvent('demo_tour_step_view', { step_index: next })
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onFinish, trackEvent])

  const skipTour = useCallback(() => {
    setTourStep((s) => {
      trackEvent('demo_tour_skipped', { step_index: s })
      return -1
    })
    onSkip?.()
  }, [onSkip, trackEvent])

  const handleChipClick = useCallback(() => {
    if (chipUsed || chipLoading) return
    setChipUsed(true)
    setChipLoading(true)
    trackEvent('demo_tour_chip_clicked')
    setChatHistory((prev) => [...prev, { role: 'user', content: CHIP_LABEL }])
    setTimeout(() => {
      setChatHistory((prev) => [
        ...prev,
        { role: 'assistant', content: CHIP_REPLY },
      ])
      setVariant('alt')
      setChipLoading(false)
    }, 1800)
  }, [chipUsed, chipLoading, trackEvent])

  const activeHtml =
    variant === 'alt'
      ? activeTab === 'exec'
        ? execHtmlAlt
        : fullHtmlAlt
      : activeTab === 'exec'
      ? execHtml
      : fullHtml

  const isTourOpen = tourStep >= 0 && tourStep < TOUR_LENGTH && tourRect !== null
  const isLastStep = tourStep === TOUR_LENGTH - 1

  const bubbleUser = {
    maxWidth: '82%',
    padding: '9px 13px',
    fontSize: 13,
    lineHeight: 1.5,
    wordBreak: 'break-word',
    borderRadius: '14px 14px 3px 14px',
    background: '#003f87',
    color: '#fff',
    boxShadow: '0 1px 2px rgba(0,63,135,0.18)',
  }
  const bubbleAssistant = {
    maxWidth: '92%',
    padding: '9px 13px',
    fontSize: 13,
    lineHeight: 1.55,
    wordBreak: 'break-word',
    borderRadius: '14px 14px 14px 3px',
    background: '#fff',
    color: '#1a1a1a',
    border: '1px solid #d0d0d0',
  }

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
      }}
    >
      {/* ── Toolbar ── */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: '#1a1a1a' }}>
            Meridian Consulting Group — AI ROI Report
          </div>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: '#2957FF',
              background: '#EBF0F8',
              borderRadius: 999,
              padding: '2px 9px',
              letterSpacing: '0.06em',
            }}
          >
            DEMO
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Tab switcher */}
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
              onClick={() => setActiveTab('exec')}
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
              onClick={() => setActiveTab('full')}
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

          {/* Disabled action buttons — visible so users know the feature exists */}
          <div ref={actionButtonsRef} style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              disabled
              title="Available in your own report"
              style={{
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: 500,
                border: '1px solid #e2e8f0',
                borderRadius: 6,
                background: '#f8fafc',
                color: '#94a3b8',
                cursor: 'not-allowed',
              }}
            >
              Download PDF
            </button>
            <button
              type="button"
              disabled
              title="Available in your own report"
              style={{
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: 500,
                border: '1px solid #c7d2fe',
                borderRadius: 6,
                background: '#f8fafc',
                color: '#94a3b8',
                cursor: 'not-allowed',
              }}
            >
              Re-send Email
            </button>
          </div>

          {/* Primary CTA */}
          <button
            ref={ctaRef}
            type="button"
            onClick={() => onFinish?.()}
            style={{
              padding: '7px 16px',
              fontSize: 13,
              fontWeight: 600,
              border: 'none',
              borderRadius: 6,
              background: '#003f87',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            Generate my report →
          </button>

          {/* Skip */}
          <button
            type="button"
            onClick={skipTour}
            style={{
              padding: '6px 10px',
              fontSize: 12,
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              background: '#fff',
              color: '#6b7280',
              cursor: 'pointer',
            }}
          >
            Skip demo
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Report iframe (65%) */}
        <div
          ref={iframeContainerRef}
          style={{
            flex: '0 0 65%',
            overflow: 'hidden',
            borderRight: '1px solid #e2e8f0',
            background: '#f1f5f9',
            position: 'relative',
          }}
        >
          {isLoading && (
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
                Building demo report…
              </span>
            </div>
          )}
          <iframe
            srcDoc={activeHtml ?? ''}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              opacity: isLoading ? 0 : 1,
            }}
            title="Demo ROI Report — Meridian Consulting Group"
          />
        </div>

        {/* Chat panel (35%) */}
        <div
          ref={chatPanelRef}
          style={{
            flex: '0 0 35%',
            display: 'flex',
            flexDirection: 'column',
            background: '#f5f5f5',
          }}
        >
          {/* Header */}
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
            <div style={{ fontSize: 11, color: '#5a5a6e', marginTop: 2 }}>
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
            {/* Initial insight panel */}
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
                  Demo Report Ready
                </div>
                This is a sample report for{' '}
                <strong>Meridian Consulting Group</strong> — a 120-person US
                management consulting firm. Your report will be generated with
                the same depth from live research about your actual company.
              </div>
            </div>

            {/* Scripted chat history */}
            {chatHistory.map((msg, i) => {
              const isUser = msg.role === 'user'
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: isUser ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div style={isUser ? bubbleUser : bubbleAssistant}>
                    {isUser ? msg.content : renderMarkdown(msg.content)}
                  </div>
                </div>
              )
            })}

            {/* Loading indicator when chip response is being "generated" */}
            {chipLoading && (
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
                  <span
                    style={{
                      display: 'inline-block',
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: '#003f87',
                      marginRight: 3,
                      animation: 'pulse 1s infinite',
                    }}
                  />
                  Recalculating…
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Suggestion chip */}
          {!chipUsed && (
            <div
              style={{
                padding: '10px 14px',
                background: '#fff',
                borderTop: '1px solid #e2e8f0',
                flexShrink: 0,
              }}
            >
              <div style={{ fontSize: 11, color: '#8a8aaa', marginBottom: 6 }}>
                Try asking:
              </div>
              <button
                type="button"
                onClick={handleChipClick}
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  background: '#eef2ff',
                  color: '#2957ff',
                  border: '1px solid #c7d2fe',
                  borderRadius: 4,
                  padding: '4px 10px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {CHIP_LABEL}
              </button>
            </div>
          )}

          {/* Disabled chat input */}
          <div
            style={{
              padding: '12px 14px 14px',
              background: '#fff',
              borderTop: '1px solid #d0d0d0',
            }}
          >
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'flex-end',
                opacity: 0.5,
                pointerEvents: 'none',
              }}
            >
              <textarea
                disabled
                placeholder="Chat available in your generated report…"
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
                  color: '#94a3b8',
                  background: '#f8fafc',
                }}
              />
              <button
                type="button"
                disabled
                style={{
                  padding: '9px 18px',
                  borderRadius: 6,
                  border: 'none',
                  background: '#d0d0d0',
                  color: '#5a5a6e',
                  fontWeight: 700,
                  fontSize: 12,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  cursor: 'not-allowed',
                  flexShrink: 0,
                }}
              >
                Send
              </button>
            </div>
            <p
              style={{
                fontSize: 11,
                color: '#94a3b8',
                textAlign: 'center',
                margin: '8px 0 0',
              }}
            >
              Full chat unlocked in your generated report
            </p>
          </div>
        </div>
      </div>

      {/* ── Spotlight tour overlay ── */}
      {isTourOpen && (
        <>
          {/* Dim panels that create the spotlight cutout */}
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              height: Math.max(0, tourRect.top - 6),
              background: 'rgba(15,23,42,0.72)',
              zIndex: 1000,
              transition: 'all 0.25s ease',
            }}
          />
          <div
            style={{
              position: 'fixed',
              top: tourRect.top + tourRect.height + 6,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(15,23,42,0.72)',
              zIndex: 1000,
              transition: 'all 0.25s ease',
            }}
          />
          <div
            style={{
              position: 'fixed',
              top: Math.max(0, tourRect.top - 6),
              left: 0,
              width: Math.max(0, tourRect.left - 6),
              height: tourRect.height + 12,
              background: 'rgba(15,23,42,0.72)',
              zIndex: 1000,
              transition: 'all 0.25s ease',
            }}
          />
          <div
            style={{
              position: 'fixed',
              top: Math.max(0, tourRect.top - 6),
              left: tourRect.left + tourRect.width + 6,
              right: 0,
              height: tourRect.height + 12,
              background: 'rgba(15,23,42,0.72)',
              zIndex: 1000,
              transition: 'all 0.25s ease',
            }}
          />

          {/* Spotlight ring */}
          <div
            style={{
              position: 'fixed',
              top: tourRect.top - 6,
              left: tourRect.left - 6,
              width: tourRect.width + 12,
              height: tourRect.height + 12,
              borderRadius: 10,
              boxShadow:
                '0 0 0 2px rgba(255,255,255,0.45) inset, 0 0 24px rgba(41,87,255,0.55)',
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
              transition: 'top 0.25s ease, left 0.25s ease',
            }}
          >
            <button
              type="button"
              onClick={skipTour}
              aria-label="Skip demo"
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
              {JOURNEY_LABELS.map((label, i) => (
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
              {JOURNEY_LABELS[tourStep]}
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <button
                type="button"
                onClick={skipTour}
                style={{
                  padding: '6px 10px',
                  background: 'transparent',
                  color: '#6b7280',
                  border: 'none',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Skip demo
              </button>
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
                  fontFamily: 'inherit',
                }}
              >
                {isLastStep ? 'Generate my report →' : 'Next →'}
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
