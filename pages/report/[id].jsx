import { useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import { createClient, createAdminClient } from '../../src/lib/supabase-server'
import { createClient as createBrowserClient } from '../../src/lib/supabase-browser'
import ReportViewerWithBatch from '../../src/components/ROIGenerator/BulkUpload/ReportViewerWithBatch'
import { buildStateFromReportRow } from '@/src/lib/roi/reportState'
import { motion } from 'framer-motion'
import { useRouter } from 'next/router'
import { trackReportAccess } from '@/src/lib/roi/services/reportAccess'
import ErrorBoundary from '../../src/components/shared/ErrorBoundary'
import { isEmployeeUser } from '@/src/lib/isEmployee'

export async function getServerSideProps({ req, res, params, query }) {
  const supabase = createClient(req, res)
  const admin = createAdminClient()

  const token = typeof query?.t === 'string' ? query.t : null
  let isAlpha = false

  // Always fetch the report once with its share fields so we can decide
  // whether to grant share-link access before requiring a Supabase session.
  const { data: report } = await admin
    .from('reports')
    .select(
      'id, company_name, email, status, state_data, user_id, share_token, share_revoked_at, share_message_count',
    )
    .eq('id', params.id)
    .single()

  if (!report) {
    return { redirect: { destination: '/dashboard', permanent: false } }
  }

  const isShareLink =
    !!token &&
    !!report.share_token &&
    token === report.share_token &&
    !report.share_revoked_at

  let isEmployee = false
  let viewerUserId = null
  let viewerEmail = null

  if (!isShareLink) {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { redirect: { destination: '/login', permanent: false } }
    }

    const { data: userData } = await admin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    isEmployee = isEmployeeUser(user, userData)
    viewerUserId = user.id
    viewerEmail = user.email ?? null
    isAlpha = user.user_metadata?.alpha === true

    if (!isEmployee && report.user_id !== user.id) {
      return { redirect: { destination: '/dashboard', permanent: false } }
    }

    if (!isEmployee && report.status !== 'SUCCESS') {
      return { redirect: { destination: '/dashboard', permanent: false } }
    }
  }

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
    },
  }
}

// ── Alpha terminology guide data ─────────────────────────────────────────────
// Rendered in a toolbar dropdown when the viewer is an alpha tester.
const ALPHA_TERMS = [
  {
    term: 'Hours Returned',
    def: 'Total hours/year your team gets back when AI handles repetitive tasks',
  },
  {
    term: 'Operational Dividend',
    def: 'Dollar value of those freed hours at your blended rate. Measurable from day one.',
  },
  {
    term: 'Profit Uplift',
    def: 'What freed hours produce when redirected to higher-value work.',
  },
  {
    term: 'Total Financial Gain',
    def: 'Operational Dividend + Profit Uplift. Full annual value.',
  },
  {
    term: 'Hypothesis-Driven Projection',
    def: 'Estimated from benchmarks, not your internal data. Needs validation.',
  },
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
}) {
  const { push } = useRouter()

  // Controls the terminology guide dropdown panel
  const [guideOpen, setGuideOpen] = useState(false)

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

  // FIX 1 — Inject "📖 Terminology Guide" button into the ReportViewer toolbar,
  // next to the existing "Take a tour" (?) button. Uses a window bridge so the
  // DOM-injected button can toggle guideOpen React state.
  useEffect(() => {
    if (!isAlpha) return undefined

    // Expose toggle function so the DOM-injected button can reach React state
    window.__alphaGuideToggle = () => setGuideOpen((v) => !v)

    const injectBtn = () => {
      if (document.getElementById('alpha-guide-btn')) return true
      const tourBtn = document.querySelector('button[title="Take a tour"]')
      if (!tourBtn) return false
      const btn = document.createElement('button')
      btn.id = 'alpha-guide-btn'
      btn.type = 'button'
      btn.textContent = '📖 Terminology Guide'
      btn.style.cssText = [
        'padding:6px 12px;font-size:13px;font-weight:500;',
        'border:1px solid #e2e8f0;border-radius:6px;',
        'background:#fff;color:#374151;cursor:pointer;font-family:inherit;',
      ].join('')
      btn.onclick = () => window.__alphaGuideToggle?.()
      tourBtn.parentNode.insertBefore(btn, tourBtn)
      return true
    }

    // Try immediately; if the toolbar hasn't mounted yet, retry after a short delay
    if (!injectBtn()) {
      const t = setTimeout(injectBtn, 600)
      return () => {
        clearTimeout(t)
        document.getElementById('alpha-guide-btn')?.remove()
        delete window.__alphaGuideToggle
      }
    }
    return () => {
      document.getElementById('alpha-guide-btn')?.remove()
      delete window.__alphaGuideToggle
    }
  }, [isAlpha])

  // FIX 2 — Auto-trigger the existing product tour for alpha testers.
  // Simulates a click on the "Take a tour" button after the page has rendered.
  // The button itself is unchanged so users can replay the tour manually.
  useEffect(() => {
    if (!isAlpha) return undefined
    const t = setTimeout(() => {
      document.querySelector('button[title="Take a tour"]')?.click()
    }, 800)
    return () => clearTimeout(t)
  }, [isAlpha])

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

  // Trigger a glow on the Share feedback button once the tester has
  // scrolled through most of the report. The report itself scrolls inside
  // the iframe (the outer window doesn't), so we reach into the iframe's
  // document once it's loaded rather than listening on window.
  useEffect(() => {
    if (!isAlpha) return undefined

    let scrollEl = null

    const onScroll = () => {
      if (!scrollEl) return
      if (
        (scrollEl.scrollTop + scrollEl.clientHeight) / scrollEl.scrollHeight >=
        0.8
      ) {
        console.log('scroll threshold reached')
        setScrolled(true)
        scrollEl.ownerDocument?.removeEventListener('scroll', onScroll)
      }
    }

    const attachToIframe = (iframe) => {
      const onLoad = () => {
        const doc = iframe.contentDocument
        if (!doc) return
        scrollEl = doc.documentElement
        doc.addEventListener('scroll', onScroll)
      }
      iframe.addEventListener('load', onLoad)
      // The iframe may already be loaded by the time we find it
      if (iframe.contentDocument?.readyState === 'complete') onLoad()
      return () => iframe.removeEventListener('load', onLoad)
    }

    let detachLoadListener = null
    const findIframe = () => {
      const iframe = document.querySelector(
        'iframe[title="ROI Report Preview"]',
      )
      if (!iframe) return false
      detachLoadListener = attachToIframe(iframe)
      return true
    }

    let poll = null
    if (!findIframe()) {
      poll = setInterval(() => {
        if (findIframe()) clearInterval(poll)
      }, 300)
    }

    return () => {
      if (poll) clearInterval(poll)
      detachLoadListener?.()
      scrollEl?.ownerDocument?.removeEventListener('scroll', onScroll)
    }
  }, [isAlpha])

  // Track that the tester reached and loaded the report page
  useEffect(() => {
    if (!isAlpha) return
    try {
      const token = localStorage.getItem('alpha_token')
      if (!token) return
      createBrowserClient()
        .from('alpha_feedback')
        .upsert(
          { alpha_token: token, step_generation_completed: true },
          { onConflict: 'alpha_token' },
        )
        .then(({ error }) => {
          if (error) console.error('[alpha] generation page tracking:', error)
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
      const supabase = createBrowserClient()

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
        />
      </motion.div>

      {/* Alpha-only overlays — all use fixed positioning clear of the chat panel */}
      {isAlpha && (
        <>
          {/* Terminology guide dropdown — toggled by the injected toolbar button */}
          {guideOpen && (
            <div
              className="fixed z-50 bg-white border border-slate-200 rounded-xl shadow-xl w-80 overflow-hidden"
              style={{ top: '54px', right: '16px' }}
            >
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <span className="font-semibold text-slate-800 text-sm">
                  📖 Terminology Guide
                </span>
                <button
                  type="button"
                  onClick={() => setGuideOpen(false)}
                  className="text-slate-400 hover:text-slate-600 text-xl leading-none"
                  aria-label="Close guide"
                >
                  &times;
                </button>
              </div>
              <div className="px-4 py-3 space-y-4 max-h-80 overflow-y-auto">
                {ALPHA_TERMS.map(({ term, def }) => (
                  <div key={term}>
                    <p className="font-semibold text-slate-800 text-xs">
                      {term}
                    </p>
                    <p className="text-slate-500 text-xs mt-0.5 leading-relaxed">
                      {def}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

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
