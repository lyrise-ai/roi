import { useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import clsx from 'clsx'
import { createAdminClient } from '../../src/lib/supabase-server'
import ReportViewerWithBatch from '../../src/components/ROIGenerator/BulkUpload/ReportViewerWithBatch'
import { buildStateFromReportRow } from '@/src/lib/roi/reportState'
import { resolveReportViewerAccess } from '@/src/lib/roi/reportViewerAccess'
import { motion } from 'framer-motion'
import { useRouter } from 'next/router'
import { trackReportAccess } from '@/src/lib/roi/services/reportAccess'
import ErrorBoundary from '../../src/components/shared/ErrorBoundary'
import NumberScale from '../../src/components/ROIGenerator/NumberScale'
import { INTER_FONT_FAMILY } from '@/src/utilities/fonts'

export async function getServerSideProps({
  req,
  res,
  params,
  query,
  resolvedUrl,
}) {
  const access = await resolveReportViewerAccess({
    req,
    res,
    params,
    query,
    resolvedUrl,
  })
  if (access.redirect) return access

  const {
    report,
    isShareLink,
    isEmployee,
    isBulk,
    viewerUserId,
    viewerEmail,
    isAlpha,
    token,
  } = access

  // Self-serve prospects confirm the AI's assumptions in the validation
  // wizard before seeing the polished report. Share-link recipients (already
  // finished, reviewing by email) and bulk-outbound reports (an employee's
  // own internal review flow) bypass this redirect. Employees still get
  // redirected to the wizard for their own reports — they just get the
  // `canSkip` button there (see pages/report/[id]/validate.jsx) instead of
  // bypassing it outright.
  if (!isShareLink && !isBulk && !report.validated_at) {
    return {
      redirect: {
        destination: `/report/${report.id}/validate`,
        permanent: false,
      },
    }
  }

  const admin = createAdminClient()
  const initialState = buildStateFromReportRow(report)

  // Load chat history and usage count in parallel.
  // Share-link visitors see the full thread so they have the owner's prior
  // context; their per-report cap lives on reports.share_message_count, not
  // chat_usage.
  let msgQuery = admin
    .from('chat_messages')
    .select('role, content')
    .eq('report_id', report.id)
    .order('created_at', { ascending: true })
    .limit(20)
  if (!isShareLink && !isEmployee) {
    msgQuery = msgQuery.eq('user_id', viewerUserId)
  }

  let initialMessagesUsed = 0
  if (isShareLink) {
    initialMessagesUsed = report.share_message_count ?? 0
  }

  const [{ data: messages }, usageResult] = await Promise.all([
    msgQuery,
    isShareLink
      ? Promise.resolve({ data: null })
      : admin
          .from('chat_usage')
          .select('message_count')
          .eq('user_id', viewerUserId)
          .eq('report_id', report.id)
          .single(),
  ])

  if (!isShareLink) {
    initialMessagesUsed = usageResult.data?.message_count ?? 0
  }

  const initialChatHistory = (messages ?? [])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .filter((m) => m.content && m.content.trim() !== '')

  await trackReportAccess({
    admin,
    req,
    report,
    reportId: report.id,
    token: isShareLink ? token : null,
    viewerEmail: isShareLink ? report.email : viewerEmail,
    viewerUserId,
    isShareLink,
    isAlpha,
    isEmployee,
  })

  return {
    props: {
      initialState,
      email: report.email,
      reportId: report.id,
      isEmployee,
      isAlpha,
      initialMessagesUsed,
      initialChatHistory,
      isShareLink,
      shareToken: isShareLink ? token : null,
      validatedAt: report.validated_at ?? null,
    },
  }
}

const UNCLEAR_OPTIONS = [
  'The numbers',
  'The workflow table',
  'What to do next',
  'The terminology',
  'Something else',
]

function categorizeChatMessages(messages) {
  if (!messages || messages.length === 0) return []
  return messages
    .map((m) => {
      const content = String(m.content || '').trim()
      if (!content || content.length < 3) return null
      const lower = content.toLowerCase()
      let category = 'other'
      if (
        lower.match(
          /what|why|how|explain|mean|means|understand|confused|unclear/,
        )
      ) {
        category = 'confusion'
      } else if (
        lower.match(/change|update|modify|adjust|switch|convert|make it|set/)
      ) {
        category = 'modification'
      } else if (lower.match(/add|include|insert|append|more detail|expand/)) {
        category = 'content_request'
      } else if (
        lower.match(/calculate|where|source|basis|assumption|number|figure/)
      ) {
        category = 'clarification'
      }
      return { content, category }
    })
    .filter(Boolean)
    .slice(0, 50)
}

export default function ReportPage({
  initialState,
  email,
  reportId,
  isEmployee,
  isAlpha,
  initialMessagesUsed,
  initialChatHistory,
  isShareLink,
  shareToken,
  validatedAt,
}) {
  const { push } = useRouter()

  // Tour-exit modal state — shown when tester clicks "Share feedback"
  const [showTourExit, setShowTourExit] = useState(false)
  const feedbackButtonRef = useRef(null)
  const [reportClarity, setReportClarity] = useState(0)
  const [unclearReason, setUnclearReason] = useState(null)
  const [unclearNote, setUnclearNote] = useState('')
  const [tourExitSubmitting, setTourExitSubmitting] = useState(false)
  const [showNudge, setShowNudge] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  // Nudge the tester to share feedback exactly once, tied to a meaningful
  // moment (having scrolled through most of the report) rather than a
  // repeating timer. The report scrolls inside its own container
  // (id="report-scroll-container", rendered by ReportContent) rather than
  // the outer window, so we poll for that element and listen on it directly.
  useEffect(() => {
    if (!isAlpha) return undefined

    const onScroll = (e) => {
      const el = e.target
      if ((el.scrollTop + el.clientHeight) / el.scrollHeight >= 0.8) {
        setScrolled(true)
        setShowNudge(true)
        setTimeout(() => setShowNudge(false), 3000)
        el.removeEventListener('scroll', onScroll)
      }
    }

    let scrollEl = null
    let poll = null
    const findScrollContainer = () => {
      const el = document.getElementById('report-scroll-container')
      if (!el) return false
      scrollEl = el
      el.addEventListener('scroll', onScroll)
      return true
    }

    if (!findScrollContainer()) {
      poll = setInterval(() => {
        if (findScrollContainer()) clearInterval(poll)
      }, 300)
    }

    return () => {
      if (poll) clearInterval(poll)
      scrollEl?.removeEventListener('scroll', onScroll)
    }
  }, [isAlpha])

  // Track that the tester reached and loaded the report page
  useEffect(() => {
    if (!isAlpha) return
    try {
      const token = localStorage.getItem('alpha_token')
      if (!token) return
      fetch('/api/alpha/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_token: token,
          reached_generation: true,
        }),
      })
        .then((res) => {
          if (!res.ok) {
            console.error(
              '[alpha] generation page tracking failed:',
              res.status,
            )
          }
        })
        .catch((err) => {
          console.error('[alpha] generation page tracking failed:', err)
        })
    } catch (err) {
      console.error('[alpha] generation page tracking failed:', err)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAlpha])

  // Handler for the tour-exit modal submit
  const handleTourExitSubmit = async () => {
    setTourExitSubmitting(true)
    try {
      const token = localStorage.getItem('alpha_token')
      const { createClient } = await import('../../src/lib/supabase-browser')
      const supabase = createClient()

      if (token) {
        const res = await fetch('/api/alpha/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_token: token,
            reached_report: true,
            report_clarity: reportClarity || null,
            unclear_reason:
              reportClarity > 0 && reportClarity <= 3
                ? unclearReason || null
                : null,
            unclear_note:
              reportClarity > 0 && reportClarity <= 3
                ? unclearNote.trim() || null
                : null,
          }),
        })
        if (!res.ok) {
          console.error('[alpha] tour exit tracking failed:', res.status)
        }
      }

      // Extract keywords from this report's chat messages and save them to
      // alpha_feedback matched on report_id (more reliable than alpha_token,
      // which can be missing from localStorage in some sessions).
      console.log('reportId:', reportId)
      const { data: messages } = await supabase
        .from('chat_messages')
        .select('content')
        .eq('report_id', reportId)
        .eq('role', 'user')
        .limit(100)

      console.log('messages found:', messages?.length)
      localStorage.setItem(
        'alpha_chat_keywords',
        JSON.stringify(categorizeChatMessages(messages || [])),
      )
    } catch (err) {
      console.error('[alpha] tour exit tracking failed:', err)
    } finally {
      setTourExitSubmitting(false)
    }
    const alphaEmail = localStorage.getItem('alpha_email') || ''
    push(
      `/alpha-survey?reportId=${reportId}&email=${encodeURIComponent(alphaEmail)}`,
    )
  }

  // Inject a short usage hint just above the chat textarea when alpha is active.
  // Uses DOM injection because the textarea lives inside ReportViewerWithBatch.
  useEffect(() => {
    if (!isAlpha) return undefined

    const injectChatHint = () => {
      if (document.getElementById('alpha-chat-hint')) return
      const textarea = document.querySelector(
        'textarea[placeholder="Ask me to change anything in the report…"]',
      )
      if (!textarea) return
      const form = textarea.closest('form')
      if (!form) return
      const hint = document.createElement('div')
      hint.id = 'alpha-chat-hint'
      hint.style.cssText = [
        'color:#2957FF;font-size:11px;padding:4px 14px 2px;',
        'line-height:1.5;font-family:inherit',
      ].join('')
      hint.textContent =
        '💡 Try: change currency to EGP · adjust team size · rewrite a section'
      form.parentNode.insertBefore(hint, form)
    }

    const t = setTimeout(injectChatHint, 800)
    return () => clearTimeout(t)
  }, [isAlpha])

  return (
    <ErrorBoundary
      isEmployee={isEmployee}
      pageContext={{ page: 'report', reportId }}
    >
      <Head>
        <title>ROI Report | LyRise</title>
      </Head>
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <ReportViewerWithBatch
          key={reportId}
          initialState={initialState}
          email={email}
          reportId={reportId}
          isEmployee={isEmployee}
          initialMessagesUsed={initialMessagesUsed}
          initialChatHistory={initialChatHistory}
          isShareLink={isShareLink}
          shareToken={shareToken}
          forceTour={isShareLink}
          backHref={isShareLink ? null : '/dashboard'}
          validatedAt={validatedAt}
        />
      </motion.div>

      {/* Alpha-only overlays — all use fixed positioning clear of the chat panel */}
      {isAlpha && (
        <>
          {/* Finish tour button — left side, clear of chat panel */}
          <div
            style={{
              position: 'fixed',
              left: '16px',
              bottom: '96px',
              zIndex: 50,
            }}
          >
            <div
              style={{
                position: 'absolute',
                bottom: 'calc(100% + 8px)',
                left: '50%',
                opacity: showNudge ? 1 : 0,
                transition: 'opacity 0.3s ease',
              }}
            >
              <svg
                width="44"
                height="38"
                viewBox="0 0 44 38"
                fill="none"
                style={{
                  animation: 'alpha-bubble-float 1.8s ease-in-out infinite',
                }}
              >
                <rect
                  x="1"
                  y="1"
                  width="42"
                  height="28"
                  rx="8"
                  fill="#5B48F8"
                />
                <polygon points="16,28 22,36 28,28" fill="#5B48F8" />
                <circle
                  cx="12"
                  cy="15"
                  r="3"
                  fill="#fff"
                  style={{
                    animation: 'alpha-dot-bounce 1.4s ease-in-out infinite',
                    animationDelay: '0s',
                  }}
                />
                <circle
                  cx="22"
                  cy="15"
                  r="3"
                  fill="#fff"
                  style={{
                    animation: 'alpha-dot-bounce 1.4s ease-in-out infinite',
                    animationDelay: '0.15s',
                  }}
                />
                <circle
                  cx="32"
                  cy="15"
                  r="3"
                  fill="#fff"
                  style={{
                    animation: 'alpha-dot-bounce 1.4s ease-in-out infinite',
                    animationDelay: '0.3s',
                  }}
                />
              </svg>
            </div>
            <button
              ref={feedbackButtonRef}
              type="button"
              onClick={() => setShowTourExit(true)}
              style={{
                background: '#5B48F8',
                color: '#fff',
                borderRadius: '12px',
                padding: '10px 16px',
                fontSize: '14px',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(91,72,248,0.35)',
                ...(scrolled
                  ? { animation: 'alpha-btn-glow 2s ease-in-out 3' }
                  : {}),
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#4a3ce8'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#5B48F8'
              }}
            >
              Finish Tour →
            </button>
          </div>
          <style>{`
            @keyframes alpha-btn-glow {
              0%, 100% { box-shadow: 0 4px 14px rgba(91,72,248,0.35); }
              50% { box-shadow: 0 4px 32px rgba(91,72,248,0.85), 0 0 0 10px rgba(91,72,248,0.2); }
            }
            @keyframes alpha-dot-bounce {
              0%, 80%, 100% { transform: translateY(0); }
              40% { transform: translateY(-4px); }
            }
            @keyframes alpha-bubble-float {
              0%, 100% { transform: translateX(-50%) translateY(0); }
              50% { transform: translateX(-50%) translateY(-5px); }
            }
          `}</style>

          {/* Tour-exit modal — collect report clarity before redirecting */}
          {showTourExit && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
                <h3 className="font-bold text-lg text-slate-900 mb-1">
                  Before you go…
                </h3>
                <p className="text-xs text-slate-400 mb-5">
                  One quick question — takes 10 seconds.
                </p>

                {/* Q: Report clarity */}
                <p
                  style={{
                    fontFamily: INTER_FONT_FAMILY,
                    letterSpacing: '-0.2px',
                  }}
                  className="text-[14.5px] font-normal text-slate-800 mb-2"
                >
                  How clearly did the report communicate value to you?
                </p>
                <div className="mb-2">
                  <NumberScale
                    value={reportClarity}
                    onChange={setReportClarity}
                    lowLabel="Not clear"
                    highLabel="Very clear"
                  />
                </div>

                {/* Q: What was unclear (only when clarity rated 3 or below) */}
                {reportClarity > 0 && reportClarity <= 3 && (
                  <div className="mb-5">
                    <p
                      style={{
                        fontFamily: INTER_FONT_FAMILY,
                        letterSpacing: '-0.2px',
                      }}
                      className="text-sm font-medium text-slate-700 mb-2"
                    >
                      What was unclear?
                    </p>
                    <div className="flex flex-col gap-1.5 mb-3">
                      {UNCLEAR_OPTIONS.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setUnclearReason(opt)}
                          style={{ fontFamily: INTER_FONT_FAMILY }}
                          className={clsx(
                            'text-left px-3 py-2 rounded-lg border text-sm transition-colors',
                            unclearReason === opt
                              ? 'border-[#5B48F8] bg-[#F5F3FF] text-[#5B48F8] font-semibold'
                              : 'border-slate-200 text-slate-600 hover:border-slate-400',
                          )}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={unclearNote}
                      onChange={(e) => setUnclearNote(e.target.value)}
                      placeholder="Anything else? (optional)"
                      rows={2}
                      style={{ fontFamily: INTER_FONT_FAMILY }}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-[#5B48F8] resize-none"
                    />
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowTourExit(false)}
                    className="flex-1 py-2.5 text-sm font-medium text-slate-500 border border-slate-200 rounded-xl hover:border-slate-400 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleTourExitSubmit}
                    disabled={reportClarity === 0 || tourExitSubmitting}
                    className="flex-1 py-2.5 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {tourExitSubmitting ? 'Saving…' : 'Continue to survey →'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </ErrorBoundary>
  )
}
