import React, { useState, useCallback, useEffect, useRef } from 'react'
import Head from 'next/head'
import { motion, AnimatePresence } from 'framer-motion'
import { FaCheckCircle } from 'react-icons/fa'
import clsx from 'clsx'
import MainHeader from '../src/layout/MainHeader'
import ReportLoadingScreen from '../src/components/ROIGenerator/ReportLoadingScreen'
import ReportViewer from '../src/components/ROIGenerator/ReportViewer'
import DemoReportViewer from '../src/components/ROIGenerator/DemoReportViewer'
import GeneratingView from '../src/components/ROIGenerator/GeneratingView'
import { drainSSE } from '../src/lib/drainSSE'
import { PIPELINE_LOG_TOOL_NAMES } from '../src/lib/roi/constants'
import { useRouter } from 'next/router'
import ErrorBoundary from '../src/components/shared/ErrorBoundary'

// ── Constants ─────────────────────────────────────────────────────────────────

const INDUSTRY_OPTS = [
  'Technology / SaaS',
  'Financial Services',
  'Legal & Professional Services',
  'Healthcare',
  'Real Estate',
  'Retail & E-Commerce',
  'Consulting & Advisory',
  'Manufacturing',
  'Logistics & Supply Chain',
  'Education',
  'Government & Public Sector',
  'Other',
]
const CURRENCIES = [
  'USD – US Dollar (USD)',
  'EUR – Euro (EUR)',
  'GBP – British Pound (GBP)',
  'SAR – Saudi Riyal (SAR)',
  'AED – UAE Dirham (AED)',
  'QAR – Qatari Riyal (QAR)',
  'KWD – Kuwaiti Dinar (KWD)',
  'BHD – Bahraini Dinar (BHD)',
  'OMR – Omani Rial (OMR)',
  'EGP – Egyptian Pound (EGP)',
  'NGN – Nigerian Naira (NGN)',
  'ZAR – South African Rand (ZAR)',
]
// Aligned with the regions handled in roiCalculator.ts → toRegion(): UAE,
// Saudi, Qatar/Kuwait/Bahrain/Oman (GCC peers), US, UK, Egypt. Anything else
// falls through to the DEFAULT band.
const COUNTRY_OPTS = [
  'Egypt',
  'United Arab Emirates',
  'Saudi Arabia',
  'Qatar',
  'Kuwait',
  'Bahrain',
  'Oman',
  'United States',
  'United Kingdom',
  'Other',
]
const TEAM_SIZE_OPTS = [
  '1–10',
  '11–50',
  '51–200',
  '201–500',
  '501–1,000',
  '1,001–5,000',
  '5,000+',
]
const REVENUE_OPTS = [
  'Under $1M',
  '$1M – $5M',
  '$5M – $20M',
  '$20M – $50M',
  '$50M – $200M',
  '$200M+',
  'Prefer not to say',
]
const TOTAL_STEPS = 2
const IS_DEV = process.env.NODE_ENV === 'development'
// Minimum time the loader stays visible (ms). Override via NEXT_PUBLIC_ROI_MIN_LOADER_MS.
const MIN_VISIBLE_DURATION =
  Number(process.env.NEXT_PUBLIC_ROI_MIN_LOADER_MS) || 3500
const VIEW_STATES = {
  FORM: 'form',
  LOADING: 'loading',
  CHOICE: 'choice',
  DEMO: 'demo',
  GENERATING: 'generating',
  FINALISING: 'finalising',
  COMPLETE: 'complete',
  SUCCESS: 'success',
  ERROR: 'error',
}
const DEV_STEP1_PRESET = {
  companyName: 'LyRise',
  website: 'lyrise.ai',
  whatYouDo: 'selling ai solutions for businesses',
  industry: 'Technology / SaaS',
  country: 'Egypt',
  teamSize: '11–50',
  revenueRange: '$1M – $5M',
}
const DEV_STEP2_PRESET = {
  email: 'yousef@lyrise.ai',
  recipientName: 'Yousef',
  recipientTitle: 'COO',
  currency: 'SAR – Saudi Riyal (SAR)',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function validateStep(step, s1, s2) {
  const errors = {}
  if (
    step === 1 &&
    (!s1.companyName.trim() || s1.companyName.trim().length < 2)
  ) {
    errors.companyName = 'Please enter your company name'
  }
  if (step === 2) {
    if (!s2.email.trim() || !/\S+@\S+\.\S+/.test(s2.email)) {
      errors.email = 'Please enter a valid work email'
    }
    if (!s2.currency) errors.currency = 'Please select a currency'
  }
  return errors
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

function Pill({ label, active, onClick, dimmed }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={dimmed}
      className={clsx(
        'px-3.5 py-1.5 rounded-full border text-[13px] font-medium transition-all duration-100',
        active
          ? 'bg-gray-900 border-gray-900 text-white'
          : dimmed
          ? 'border-gray-200 text-gray-400 opacity-40 cursor-not-allowed'
          : 'border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-900 cursor-pointer',
      )}
    >
      {label}
    </button>
  )
}

function PillGroup({ options, value, onChange, error }) {
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <Pill
            key={opt}
            label={opt}
            active={value === opt}
            onClick={() => onChange(value === opt ? '' : opt)}
          />
        ))}
      </div>
      {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
    </div>
  )
}

function TextInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  optional,
  error,
  autoComplete,
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[12.5px] font-semibold text-gray-800">
        {label}
        {optional && (
          <span className="font-normal text-gray-400"> — optional</span>
        )}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={clsx(
          'w-full border rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition-colors',
          error
            ? 'border-red-400 bg-red-50'
            : 'border-gray-200 hover:border-gray-300 focus:border-gray-500',
        )}
      />
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}

// ── Step 1 ────────────────────────────────────────────────────────────────────

function Step1({ data, onChange, errors }) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
          Your company
        </p>
        <h2 className="mb-1 text-xl font-bold text-gray-900">
          Let&apos;s start with the basics
        </h2>
        <p className="text-sm text-gray-500">
          Takes under a minute — we research the rest automatically.
        </p>
      </div>
      <TextInput
        id="companyName"
        label="Company name"
        value={data.companyName}
        onChange={(v) => onChange('companyName', v)}
        placeholder="e.g. Acme Corp"
        autoComplete="organization"
        error={errors.companyName}
      />
      <TextInput
        id="website"
        label="Company website"
        value={data.website}
        onChange={(v) => onChange('website', v)}
        placeholder="e.g. acmecorp.com"
        optional
        autoComplete="url"
      />
      <TextInput
        id="whatYouDo"
        label="What does your company sell or deliver?"
        value={data.whatYouDo}
        onChange={(v) => onChange('whatYouDo', v)}
        placeholder="e.g. B2B management consulting for operations and strategy"
        optional
      />
      <div className="space-y-2">
        <label className="text-[12.5px] font-semibold text-gray-800">
          Industry{' '}
          <span className="font-normal text-gray-400">
            — helps us benchmark faster
          </span>
        </label>
        <PillGroup
          options={INDUSTRY_OPTS}
          value={data.industry}
          onChange={(v) => onChange('industry', v)}
        />
      </div>
      <div className="space-y-2">
        <label className="text-[12.5px] font-semibold text-gray-800">
          Country{' '}
          <span className="font-normal text-gray-400">
            — anchors regional salary benchmarks
          </span>
        </label>
        <PillGroup
          options={COUNTRY_OPTS}
          value={data.country}
          onChange={(v) => onChange('country', v)}
        />
      </div>
      <div className="space-y-2">
        <label className="text-[12.5px] font-semibold text-gray-800">
          Team size{' '}
          <span className="font-normal text-gray-400">
            — drives realistic workflow volumes
          </span>
        </label>
        <PillGroup
          options={TEAM_SIZE_OPTS}
          value={data.teamSize}
          onChange={(v) => onChange('teamSize', v)}
        />
      </div>
      <div className="space-y-2">
        <label className="text-[12.5px] font-semibold text-gray-800">
          Estimated annual revenue{' '}
          <span className="font-normal text-gray-400">
            — sets the 5–20% Total Financial Gain band
          </span>
        </label>
        <PillGroup
          options={REVENUE_OPTS}
          value={data.revenueRange}
          onChange={(v) => onChange('revenueRange', v)}
        />
      </div>
    </div>
  )
}

// ── Step 2 ────────────────────────────────────────────────────────────────────

function Step2({ data, onChange, errors, isDev }) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
          Delivery
        </p>
        <h2 className="mb-1 text-xl font-bold text-gray-900">
          Where should we send your report?
        </h2>
        <p className="text-sm text-gray-500">
          Your report is generated and emailed — usually ready in 60 seconds.
        </p>
        {isDev && (
          <p className="mt-2 text-xs text-amber-600">
            Dev mode is on: the form is prefilled, email/PDF are skipped, and
            you can use a fast mock preview.
          </p>
        )}
      </div>
      <TextInput
        id="email"
        label="Work email"
        type="email"
        value={data.email}
        onChange={(v) => onChange('email', v)}
        placeholder="you@company.com"
        autoComplete="email"
        error={errors.email}
      />
      <TextInput
        id="recipientName"
        label="Your name"
        value={data.recipientName}
        onChange={(v) => onChange('recipientName', v)}
        placeholder="e.g. Sarah Al-Rashid"
        optional
        autoComplete="name"
      />
      <TextInput
        id="recipientTitle"
        label="Your title"
        value={data.recipientTitle}
        onChange={(v) => onChange('recipientTitle', v)}
        placeholder="e.g. COO, Head of Operations"
        optional
      />
      <div className="space-y-2">
        <label className="text-[12.5px] font-semibold text-gray-800">
          Operating currency <span className="text-red-500">*</span>
        </label>
        <PillGroup
          options={CURRENCIES}
          value={data.currency}
          onChange={(v) => onChange('currency', v)}
          error={errors.currency}
        />
      </div>
    </div>
  )
}

// ── Generating & Success views ────────────────────────────────────────────────

function ErrorView({ message, onRetry, onUseEstimates, isEmployee }) {
  const isResearchFailure =
    message?.includes('Stages done: none') ||
    message?.includes('no assembled report') ||
    message?.includes("couldn't research") ||
    message?.includes('retrieve specific web pages')

  const displayMessage =
    isEmployee || isResearchFailure
      ? message
      : 'Something went wrong. Our team has been notified and will look into it.'

  return (
    <div className="px-8 py-10 text-center">
      <div
        className="flex items-center justify-center w-12 h-12 mx-auto mb-5 border rounded-full"
        style={{ background: '#fff7ed', borderColor: '#fed7aa' }}
      >
        <span style={{ fontSize: 22 }}>⚠</span>
      </div>
      <h2 className="mb-2 text-xl font-bold text-gray-900">
        {isResearchFailure
          ? "Couldn't gather company data online"
          : 'Generation incomplete'}
      </h2>
      {isResearchFailure ? (
        <>
          <p className="max-w-sm mx-auto mb-6 text-sm leading-relaxed text-gray-500">
            The agent had trouble finding public data for this company. You can
            retry with web search, or generate a report instantly using your
            questionnaire inputs and industry benchmarks.
          </p>
          <div className="flex flex-col max-w-xs gap-3 mx-auto">
            <button
              type="button"
              onClick={onUseEstimates}
              className="w-full px-5 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-700 transition-colors"
            >
              Use industry benchmarks (instant) →
            </button>
            <button
              type="button"
              onClick={onRetry}
              className="w-full px-5 py-2.5 text-gray-700 text-sm font-medium rounded-lg border border-gray-200 hover:border-gray-400 transition-colors"
            >
              Retry with web search
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="max-w-sm mx-auto mb-6 text-sm text-gray-500">
            {displayMessage || 'Something went wrong. Please try again.'}
          </p>
          <div className="flex flex-col max-w-xs gap-3 mx-auto">
            <button
              type="button"
              onClick={onRetry}
              className="w-full px-5 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-700 transition-colors"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={onUseEstimates}
              className="w-full px-5 py-2.5 text-gray-700 text-sm font-medium rounded-lg border border-gray-200 hover:border-gray-400 transition-colors"
            >
              Use industry benchmarks instead
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function SuccessView({ email, reportId, isEmployee }) {
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [limitReached, setLimitReached] = useState(false)
  const bottomRef = useRef(null)

  const userSentCount = messages.filter((m) => m.role === 'user').length

  // Load existing conversation from DB when reportId is set
  useEffect(() => {
    if (!reportId) return
    fetch(`/api/chat?reportId=${reportId}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.messages) && data.messages.length > 0) {
          setMessages(data.messages)
        }
      })
      .catch(() => {})
  }, [reportId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isSending])

  const sendMessage = async () => {
    const trimmed = inputValue.trim()
    if (!trimmed || isSending || limitReached || !reportId) return

    const updated = [...messages, { role: 'user', content: trimmed }]
    setMessages(updated)
    setInputValue('')
    setIsSending(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, message: trimmed }),
      })

      if (res.status === 403) {
        setLimitReached(true)
        return
      }
      if (res.status === 429) {
        // Remove the optimistic user message we added
        setMessages((prev) => prev.slice(0, -1))
        setInputValue(trimmed)
        return
      }

      const data = await res.json()
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.reply },
      ])
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Something went wrong. Please try again.',
        },
      ])
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="p-8">
      {/* ── Success header ── */}
      <div className="pb-8 text-center border-b border-gray-100">
        <div className="flex items-center justify-center mx-auto mb-6 border border-green-100 rounded-full w-14 h-14 bg-green-50">
          <FaCheckCircle className="text-3xl text-green-500" />
        </div>
        <h2 className="mb-3 text-2xl font-bold text-gray-900">
          Report on its way
        </h2>
        <p className="max-w-sm mx-auto mb-4 text-sm leading-relaxed text-gray-600">
          Your personalised AI ROI analysis has been generated and is being
          emailed to:
        </p>
        <div className="inline-block px-4 py-2 mb-6 text-sm font-semibold bg-gray-100 rounded-lg">
          {email}
        </div>
        <p className="max-w-sm mx-auto mb-6 text-sm text-gray-500">
          Want to walk through the findings with our team? Book a free 30-min
          call.
        </p>
        <a
          href="https://api.leadconnectorhq.com/widget/bookings/strategy-call-with-lyrisesivto9"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-700 transition-colors"
        >
          Book a 30-min call →
        </a>
      </div>

      {/* ── Chat ── */}
      <div className="pt-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">
            Ask about your report
          </h3>
          {!isEmployee && (
            <span
              className={`text-xs font-mono ${
                limitReached ? 'text-amber-500 font-semibold' : 'text-gray-400'
              }`}
            >
              {Math.min(userSentCount, 5)} / 5 messages used
            </span>
          )}
        </div>

        {/* Message history */}
        {messages.length > 0 && (
          <div className="pr-1 mb-4 space-y-3 overflow-y-auto max-h-72">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-[#2957FF] text-white'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {isSending && (
              <div className="flex justify-start">
                <div className="px-4 py-3 bg-gray-100 rounded-2xl">
                  <div className="flex items-center gap-1">
                    {[0, 150, 300].map((delay) => (
                      <span
                        key={delay}
                        className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: `${delay}ms` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}

        {/* Limit reached banner */}
        {limitReached ? (
          <div className="p-5 text-center border bg-amber-50 border-amber-200 rounded-xl">
            <p className="mb-2 font-mono text-xs font-semibold text-amber-500">
              5 / 5 messages used
            </p>
            <p className="mb-1 text-sm font-semibold text-amber-800">
              You&apos;ve used your 5 free messages.
            </p>
            <p className="mb-4 text-xs text-amber-600">
              Want unlimited edits? Contact LyRise to refine your ROI strategy.
            </p>
            <a
              href="https://api.leadconnectorhq.com/widget/bookings/strategy-call-with-lyrisesivto9"
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-xs font-semibold rounded-lg hover:bg-amber-700 transition-colors"
            >
              Contact Sales →
            </a>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage()
                }
              }}
              disabled={isSending}
              placeholder="Ask a question about your ROI report…"
              className="flex-1 text-sm border border-gray-200 rounded-xl px-3.5 py-2.5 outline-none focus:border-[#2957FF] transition-colors bg-white"
            />
            <button
              type="button"
              onClick={sendMessage}
              disabled={!inputValue.trim() || isSending}
              className="px-4 py-2.5 bg-[#2957FF] text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              Send
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function getServerSideProps({ req, res }) {
  const { createClient, createAdminClient } = await import(
    '../src/lib/supabase-server'
  )
  const supabase = createClient(req, res)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { redirect: { destination: '/auth/login', permanent: false } }
  }

  const admin = createAdminClient()
  const { data: userData } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  const isEmployee =
    userData?.role === 'EMPLOYEE' || user.email?.endsWith('@lyrise.ai')

  return { props: { isEmployee } }
}

// Tools with pipeline_log coverage emit their own messages from the server-side
// execute function. Returning null here prevents a duplicate tool_start entry
// from flooding the log before the classified pipeline_log message arrives.
const PIPELINE_LOG_TOOLS = new Set(PIPELINE_LOG_TOOL_NAMES)

function sseEventToLogLine(event) {
  if (event.type !== 'tool_start') return null
  if (PIPELINE_LOG_TOOLS.has(event.tool)) return null
  const labels = {
    search_evidence: 'Searching evidence base…',
    update_copy: 'Updating report section…',
    update_workflow: 'Updating workflow assumptions…',
    add_workflow: 'Adding workflow…',
    remove_workflow: 'Removing workflow…',
    scale_rates: 'Adjusting salary rates…',
    set_currency: 'Setting currency…',
    update_globals: 'Updating global inputs…',
  }
  return labels[event.tool] ?? `[${event.tool}]`
}

function ROIReportInner({ isEmployee }) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [viewState, setViewState] = useState(VIEW_STATES.FORM)

  const [isGenerationComplete, setIsGenerationComplete] = useState(false)
  const generationStartedAt = useRef(Date.now())
  const [generationLog, setGenerationLog] = useState('')
  const [sseEvents, setSseEvents] = useState([])
  const [reportState, setReportState] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [reportId, setReportId] = useState(null)
  const [initialMessagesUsed, setInitialMessagesUsed] = useState(0)

  const [s1, setS1] = useState(
    IS_DEV
      ? DEV_STEP1_PRESET
      : {
          companyName: '',
          website: '',
          whatYouDo: '',
          industry: '',
          country: '',
          teamSize: '',
          revenueRange: '',
        },
  )
  const [s2, setS2] = useState(
    IS_DEV
      ? DEV_STEP2_PRESET
      : { email: '', recipientName: '', recipientTitle: '', currency: '' },
  )
  const [errors, setErrors] = useState({})

  const handleGenerationError = useCallback(
    (message) => {
      setErrorMessage(message)
      setViewState(VIEW_STATES.ERROR)
      if (!isEmployee) {
        fetch('/api/notify-error', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: message,
            context: { page: 'roi-report', company: s1.companyName || '(unknown)' },
            url: typeof window !== 'undefined' ? window.location.href : undefined,
          }),
        }).catch(() => {})
      }
    },
    [isEmployee, s1.companyName],
  )

  const changeS1 = useCallback((key, val) => {
    setS1((prev) => ({ ...prev, [key]: val }))
    setErrors((prev) => ({ ...prev, [key]: '' }))
  }, [])

  const changeS2 = useCallback((key, val) => {
    setS2((prev) => ({ ...prev, [key]: val }))
    setErrors((prev) => ({ ...prev, [key]: '' }))
  }, [])

  const runGeneration = useCallback(
    async ({ skipLLM = false, estimatesOnly = false } = {}) => {
      generationStartedAt.current = Date.now()
      setIsGenerationComplete(false)
      setViewState(VIEW_STATES.GENERATING)
      setGenerationLog('')
      setSseEvents([])
      setReportState(null)
      setErrorMessage('')

      const payload = {
        'Company Name': s1.companyName.trim(),
        'Company Website URL': s1.website.trim(),
        'What does your company do?': s1.whatYouDo.trim(),
        Industry: s1.industry || '',
        Country: s1.country === 'Other' ? '' : s1.country || '',
        'Number of Employees': s1.teamSize || '',
        'Estimated Annual Revenue':
          s1.revenueRange === 'Prefer not to say' ? '' : s1.revenueRange || '',
        'Operating Currency': s2.currency ? s2.currency.split(' – ')[0] : '',
        Email: s2.email.trim(),
        'Recipient Name': s2.recipientName.trim(),
        'Recipient Title': s2.recipientTitle.trim(),
        'Key Priorities': [],
        processes: [],
      }

      try {
        const response = await fetch('/api/roi-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'generate',
            formData: payload,
            devOptions: { skipLLM, estimatesOnly },
          }),
        })

        if (response.status === 401) {
          window.location.href = '/auth/login'
          return
        }

        if (response.status === 409) {
          const data = await response.json()
          if (data.report_id) {
            try {
              const existing = await fetch('/api/roi-agent')
              if (!existing.ok) {
                // eslint-disable-next-line no-console -- intentional 409 fallback diagnostics
                console.warn(
                  'GET /api/roi-agent failed during 409 fallback:',
                  existing.status,
                )
              } else {
                const existingData = await existing.json()
                if (existingData?.report?.rendered_html) {
                  const { buildStateFromReportRow } = await import(
                    '../src/lib/roi/reportState'
                  )
                  const builtState = buildStateFromReportRow(
                    existingData.report,
                  )
                  setReportId(data.report_id)
                  setReportState(builtState)
                  setIsGenerationComplete(true)
                  setViewState(VIEW_STATES.FINALISING)
                  return
                }
              }
            } catch (err) {
              // eslint-disable-next-line no-console -- intentional 409 fallback diagnostics
              console.warn(
                'Failed to load existing report from 409 fallback:',
                err,
              )
            }
            window.location.href = `/report/${data.report_id}`
          }
          return
        }

        let latestState = null
        await drainSSE(
          response.body.getReader(),
          new TextDecoder(),
          (event) => {
            if (event.type === 'text_delta') {
              setGenerationLog((prev) => (prev + event.delta).slice(-2000))
            } else if (event.type === 'tool_start') {
              setGenerationLog((prev) => `${prev}\n[${event.tool}]`)
              const line = sseEventToLogLine(event)
              if (line) {
                setSseEvents((prev) => [...prev, { text: line }])
              }
            } else if (event.type === 'pipeline_log') {
              setGenerationLog((prev) =>
                `${prev}\n${event.message}`.slice(-2000),
              )
              setSseEvents((prev) => [...prev, { text: event.message }])
            } else if (event.type === 'report_update') {
              latestState = event.state
              setReportState(event.state)
            } else if (event.type === 'report_saved') {
              setReportId(event.report_id)
            } else if (event.type === 'done') {
              if (
                (event.assembled || latestState?.assembled) &&
                latestState?.renderedHtml
              ) {
                setIsGenerationComplete(true)
                setViewState(VIEW_STATES.FINALISING)
              } else {
                handleGenerationError(
                  'Report generation finished without a complete report.',
                )
              }
            } else if (event.type === 'error') {
              throw new Error(event.message)
            }
          },
        )
      } catch (err) {
        handleGenerationError(
          err.message || 'Something went wrong. Please try again.',
        )
      }
    },
    [s1, s2, handleGenerationError],
  )

  // Finalisation lifecycle: enforce minimum visible loader duration, then
  // transition to COMPLETE once FINALISING and renderedHtml are available.
  useEffect(() => {
    if (viewState !== VIEW_STATES.FINALISING) return () => {}
    if (!reportState?.renderedHtml) return () => {}

    let timeout

    const elapsed = Date.now() - generationStartedAt.current
    const remaining = Math.max(0, MIN_VISIBLE_DURATION - elapsed)

    // Force a paint cycle so the FINALISING state visually mounts
    const rafId = requestAnimationFrame(() => {
      timeout = setTimeout(() => {
        setViewState(VIEW_STATES.COMPLETE)
      }, remaining + 200)
    })

    return () => {
      cancelAnimationFrame(rafId)
      clearTimeout(timeout)
    }
  }, [viewState, reportState])

  // COMPLETE lifecycle: brief beat, then navigate to the persisted report.
  // If reportId hasn't arrived within 8s of COMPLETE, show an error — the
  // report save likely failed server-side (check server logs).
  useEffect(() => {
    if (viewState !== VIEW_STATES.COMPLETE) return () => {}
    if (reportId) {
      const timeout = setTimeout(() => {
        router.push(`/report/${reportId}`)
      }, 400)
      return () => clearTimeout(timeout)
    }
    const fallback = setTimeout(() => {
      handleGenerationError(
        'Report was generated but could not be saved. Please try again or check server logs.',
      )
    }, 8000)
    return () => clearTimeout(fallback)
  }, [viewState, reportId, router, handleGenerationError])

  const next = useCallback(
    async ({ skipLLM = false } = {}) => {
      const currentErrors = validateStep(step, s1, s2)
      setErrors(currentErrors)
      if (Object.keys(currentErrors).length) return
      if (step < TOTAL_STEPS) {
        setStep((prev) => prev + 1)
        return
      }
      if (skipLLM) {
        await runGeneration({ skipLLM })
        return
      }
      // Skip choice card if user already completed or skipped the demo tour
      let tourSeen = false
      try {
        tourSeen = !!localStorage.getItem('lyrise_tour_seen')
      } catch {
        /* private browsing */
      }
      if (tourSeen) {
        await runGeneration()
      } else {
        setViewState(VIEW_STATES.CHOICE)
      }
    },
    [step, s1, s2, runGeneration],
  )

  const back = useCallback(() => {
    setStep((prev) => Math.max(prev - 1, 1))
    setErrors({})
  }, [])

  // Non-form views
  if (viewState === VIEW_STATES.LOADING) {
    return (
      <div className="rebranding-landing-page -mt-[12px]">
        <MainHeader />
        <div className="flex items-center justify-center min-h-screen">
          <div className="w-8 h-8 border-4 border-gray-200 rounded-full border-t-gray-900 animate-spin" />
        </div>
      </div>
    )
  }

  // Loader state animates out smoothly on completion, before navigation
  if (
    viewState === VIEW_STATES.GENERATING ||
    viewState === VIEW_STATES.FINALISING ||
    viewState === VIEW_STATES.COMPLETE
  ) {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="loader"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          <ReportLoadingScreen
            generationLog={generationLog}
            sseEvents={sseEvents}
            viewState={viewState}
          />
        </motion.div>
      </AnimatePresence>
    )
  }

  if (viewState === VIEW_STATES.SUCCESS) {
    return (
      <div className="rebranding-landing-page -mt-[12px]">
        <MainHeader />
        <div className="flex flex-col items-center justify-center min-h-screen p-4">
          <div className="w-full max-w-xl bg-white border border-gray-100 shadow-xl rounded-2xl">
            <SuccessView
              email={s2.email}
              reportId={reportId}
              isEmployee={isEmployee}
            />
          </div>
        </div>
      </div>
    )
  }

  if (viewState === VIEW_STATES.ERROR) {
    return (
      <div className="rebranding-landing-page -mt-[12px]">
        <MainHeader />
        <div className="flex items-center justify-center min-h-screen p-4">
          <div className="w-full max-w-xl bg-white border border-gray-100 shadow-xl rounded-2xl">
            <ErrorView
              message={errorMessage}
              onRetry={() => runGeneration()}
              onUseEstimates={() => runGeneration({ estimatesOnly: true })}
              isEmployee={isEmployee}
            />
          </div>
        </div>
      </div>
    )
  }

  if (viewState === VIEW_STATES.DEMO) {
    return (
      <DemoReportViewer
        email={s2.email}
        companyName={s1.companyName}
        onFinish={() => runGeneration()}
        onSkip={() => runGeneration()}
      />
    )
  }

  if (viewState === VIEW_STATES.CHOICE) {
    return (
      <div className="rebranding-landing-page -mt-[12px]">
        <MainHeader />
        <div className="flex flex-col items-center justify-center min-h-screen p-4">
          <div className="w-full max-w-lg bg-white border border-gray-100 shadow-xl rounded-2xl overflow-hidden">
            <div className="px-8 pt-8 pb-6 text-center border-b border-gray-100">
              <div
                className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-4"
                style={{ background: '#EBF0F8' }}
              >
                <span style={{ fontSize: 22 }}>📊</span>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                Want to explore a sample report first?
              </h2>
              <p className="text-sm text-gray-500 leading-relaxed max-w-sm mx-auto">
                See exactly what your report will look like — built with real
                data for a sample consulting firm. Takes about 2 minutes.
              </p>
            </div>
            <div className="p-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setViewState(VIEW_STATES.DEMO)}
                className="w-full px-5 py-3 text-sm font-semibold text-white rounded-lg transition-colors"
                style={{ background: '#003f87' }}
              >
                Show me the demo →
              </button>
              <button
                type="button"
                onClick={() => runGeneration()}
                className="w-full px-5 py-3 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors"
              >
                Skip — generate my report now
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const progress = (step / TOTAL_STEPS) * 100

  return (
    <div className="rebranding-landing-page -mt-[12px]">
      <MainHeader />
      <Head>
        <title>Get Your AI ROI Report | LyRise</title>
        <meta
          name="description"
          content="Discover how much time and money AI can save your business."
        />
      </Head>

      <div className="flex flex-col items-center justify-center min-h-screen p-4 font-sans text-gray-900">
        <div className="w-full max-w-xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="overflow-hidden bg-white border border-gray-100 shadow-xl rounded-2xl"
          >
            {/* Progress bar */}
            <div className="h-0.5 bg-gray-100">
              <div
                className="h-full transition-all duration-300 ease-out bg-gray-900"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Card header */}
            <div className="flex items-center justify-between pt-5 pb-1 px-7">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <div className="w-6 h-6 rounded-md bg-gray-900 flex items-center justify-center text-white text-[11px] font-bold tracking-tight">
                  Ly
                </div>
                LyRise
              </div>
              <span className="text-xs font-medium text-gray-400">
                Step {step} of {TOTAL_STEPS}
              </span>
            </div>

            {/* Step content */}
            <div className="pt-5 pb-2 px-7" style={{ minHeight: 360 }}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18 }}
                >
                  {step === 1 && (
                    <Step1 data={s1} onChange={changeS1} errors={errors} />
                  )}
                  {step === 2 && (
                    <Step2
                      data={s2}
                      onChange={changeS2}
                      errors={errors}
                      isDev={IS_DEV}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Nav */}
            <div className="flex items-center justify-between py-5 mt-4 border-t border-gray-100 px-7">
              <button
                type="button"
                onClick={back}
                className={clsx(
                  'text-sm font-medium text-gray-500 border border-gray-200 rounded-lg px-4 py-2 hover:border-gray-400 hover:text-gray-800 transition-colors',
                  step === 1 && 'invisible',
                )}
              >
                ← Back
              </button>

              <div className="flex gap-1.5 items-center">
                {[1, 2].map((s) => (
                  <div
                    key={s}
                    className={clsx(
                      'h-1.5 rounded-full transition-all duration-200',
                      s === step ? 'w-4 bg-gray-900' : 'w-1.5 bg-gray-200',
                    )}
                  />
                ))}
              </div>

              <div className="flex items-center gap-2">
                {IS_DEV && step === TOTAL_STEPS && (
                  <button
                    type="button"
                    onClick={() => next({ skipLLM: true })}
                    className="px-5 py-2 text-sm font-semibold text-gray-700 transition-colors bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    Fast mock preview
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => next()}
                  className="px-5 py-2 text-sm font-semibold text-white transition-colors bg-gray-900 rounded-lg shadow-sm hover:bg-gray-700"
                >
                  {step === TOTAL_STEPS ? 'Generate my report →' : 'Continue →'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>

      </div>
    </div>
  )
}

export default function ROIReport(props) {
  return (
    <ErrorBoundary
      isEmployee={props.isEmployee}
      pageContext={{ page: 'roi-report' }}
    >
      <ROIReportInner {...props} />
    </ErrorBoundary>
  )
}
