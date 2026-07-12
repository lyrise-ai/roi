import { useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import { createAdminClient } from '../../src/lib/supabase-server'
import ReportViewerWithBatch from '../../src/components/ROIGenerator/BulkUpload/ReportViewerWithBatch'
import { buildStateFromReportRow } from '@/src/lib/roi/reportState'
import { resolveReportViewerAccess } from '@/src/lib/roi/reportViewerAccess'
import { motion } from 'framer-motion'
import { useRouter } from 'next/router'
import { trackReportAccess } from '@/src/lib/roi/services/reportAccess'
import ErrorBoundary from '../../src/components/shared/ErrorBoundary'

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
  // Shared with ReportViewer so tour step 5 can spotlight this exact button
  const feedbackButtonRef = useRef(null)
  const [reportClarity, setReportClarity] = useState(0)
  const [chatRating, setChatRating] = useState(0)
  const [clarityHover, setClarityHover] = useState(0)
  const [chatHover, setChatHover] = useState(0)
  const [tourExitSubmitting, setTourExitSubmitting] = useState(false)
  const [showNudge, setShowNudge] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  // Periodically nudge the tester to share feedback via a small tooltip
  // above the Share feedback button.
  useEffect(() => {
    if (!isAlpha) return undefined
    const interval = setInterval(() => {
      setShowNudge(true)
      setTimeout(() => setShowNudge(false), 3000)
    }, 20000)
    return () => clearInterval(interval)
  }, [isAlpha])

  // Trigger a glow on the Share feedback button once the tester has scrolled
  // through most of the report. The report scrolls inside its own container
  // (id="report-scroll-container", rendered by ReportContent) rather than
  // the outer window, so we poll for that element and listen on it directly.
  useEffect(() => {
    if (!isAlpha) return undefined

    const onScroll = (e) => {
      const el = e.target
      if ((el.scrollTop + el.clientHeight) / el.scrollHeight >= 0.8) {
        setScrolled(true)
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
      import('../../src/lib/supabase-browser').then(({ createClient }) => {
        createClient()
          .from('alpha_feedback')
          .upsert(
            { alpha_token: token, step_generation_completed: true },
            { onConflict: 'alpha_token' },
          )
          .then(({ error }) => {
            if (error) console.error('[alpha] generation page tracking:', error)
          })
      })
    } catch {
      /* non-critical */
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
        await supabase.from('alpha_feedback').upsert(
          {
            alpha_token: token,
            step_report_completed: true,
            step3_report_clarity: reportClarity || null,
            step4_chat_rating: chatRating || null,
          },
          { onConflict: 'alpha_token' },
        )
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
    } catch {
      /* non-critical */
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
          feedbackButtonRef={feedbackButtonRef}
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
                  ? { animation: 'alpha-btn-glow 2s ease-in-out infinite' }
                  : {}),
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#4a3ce8'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#5B48F8'
              }}
            >
              Share feedback →
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

          {/* Tour-exit modal — collect report clarity + chat rating before redirecting */}
          {showTourExit && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
                <h3 className="font-bold text-lg text-slate-900 mb-1">
                  Before you go…
                </h3>
                <p className="text-xs text-slate-400 mb-5">
                  Two quick questions — takes 20 seconds.
                </p>

                {/* Q: Report clarity */}
                <p className="text-sm font-medium text-slate-700 mb-2">
                  How clearly did the report communicate value to you?
                </p>
                <div className="flex gap-2 mb-5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setReportClarity(s)}
                      onMouseEnter={() => setClarityHover(s)}
                      onMouseLeave={() => setClarityHover(0)}
                      aria-label={`${s} star${s > 1 ? 's' : ''}`}
                      className="focus:outline-none transition-transform hover:scale-110"
                    >
                      <svg
                        viewBox="0 0 20 20"
                        className="w-8 h-8"
                        fill={
                          s <= (clarityHover || reportClarity)
                            ? '#fbbf24'
                            : '#e2e8f0'
                        }
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    </button>
                  ))}
                </div>

                {/* Q: Chat rating (optional) */}
                <p className="text-sm font-medium text-slate-700 mb-1">
                  How smooth was editing the report with AI?
                </p>
                <p className="text-xs text-slate-400 mb-2">
                  Skip if you didn&apos;t use the chat
                </p>
                <div className="flex gap-2 mb-6">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setChatRating(s)}
                      onMouseEnter={() => setChatHover(s)}
                      onMouseLeave={() => setChatHover(0)}
                      aria-label={`${s} star${s > 1 ? 's' : ''}`}
                      className="focus:outline-none transition-transform hover:scale-110"
                    >
                      <svg
                        viewBox="0 0 20 20"
                        className="w-8 h-8"
                        fill={
                          s <= (chatHover || chatRating) ? '#fbbf24' : '#e2e8f0'
                        }
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    </button>
                  ))}
                </div>

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
