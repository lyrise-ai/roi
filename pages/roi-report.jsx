import React, { useState, useCallback, useEffect, useRef } from 'react'
import Head from 'next/head'
import { motion, AnimatePresence } from 'framer-motion'
import { FaCheckCircle, FaStar } from 'react-icons/fa'
import clsx from 'clsx'
import MainHeader from '../src/layout/MainHeader'
import ReportLoadingScreen from '../src/components/ROIGenerator/ReportLoadingScreen'
import ReportViewer from '../src/components/ROIGenerator/ReportViewer'
import GeneratingView from '../src/components/ROIGenerator/GeneratingView'
import { drainSSE } from '../src/lib/drainSSE'
import { PIPELINE_LOG_TOOL_NAMES } from '../src/lib/roi/constants'
import { useRouter } from 'next/router'
import { createClient as createBrowserClient } from '../src/lib/supabase-browser'

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
const MIN_VISIBLE_DURATION =
  Number(process.env.NEXT_PUBLIC_ROI_MIN_LOADER_MS) || 3500

const VIEW_STATES = {
  FORM: 'form',
  LOADING: 'loading',
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

// ── Typewriter hook (alpha splash) ────────────────────────────────────────────

function useTypewriter(text, speed = 35, startDelay = 0) {
  const [displayed, setDisplayed] = useState('')
  useEffect(() => {
    let timeout
    let interval
    timeout = setTimeout(() => {
      let i = 0
      interval = setInterval(() => {
        setDisplayed(text.slice(0, i + 1))
        i++
        if (i >= text.length) clearInterval(interval)
      }, speed)
    }, startDelay)
    return () => {
      clearTimeout(timeout)
      clearInterval(interval)
    }
  }, [text, speed, startDelay])
  return displayed
}

// ── Tooltip (alpha form fields) ───────────────────────────────────────────────

function Tooltip({ text, openLeft = false }) {
  const [visible, setVisible] = useState(false)
  return (
    <span className="relative inline-flex items-center ml-1.5">
      <button
        type="button"
        aria-label="More info"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        className="w-4 h-4 rounded-full bg-slate-200 text-slate-500 text-[10px] font-bold flex items-center justify-center hover:bg-slate-300 transition-colors focus:outline-none"
      >
        ?
      </button>
      {visible && (
        <span
          role="tooltip"
          className={clsx(
            'absolute z-50 w-52 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-lg leading-relaxed',
            openLeft ? 'top-6 right-0' : 'top-6 left-0',
          )}
        >
          {text}
        </span>
      )}
    </span>
  )
}

// ── Splash screen (alpha only) ────────────────────────────────────────────────

function SplashScreen({ onExitComplete }) {
  const [exiting, setExiting] = useState(false)
  const line1 = useTypewriter(
    'Welcome to The Alpha Tour! You are among the first to experience this.',
    30,
    1200,
  )
  const line2 = useTypewriter(
    'This report is customised for you and will be sent to your email.',
    30,
    4100,
  )

  useEffect(() => {
    const t = setTimeout(() => setExiting(true), 8050)
    return () => clearTimeout(t)
  }, [])

  return (
    <AnimatePresence onExitComplete={onExitComplete}>
      {!exiting && (
        <motion.div
          key="splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 flex flex-col items-center justify-center"
          style={{ background: '#0f1729' }}
        >
          <button
            type="button"
            onClick={() => setExiting(true)}
            className="absolute top-4 right-4 text-xs"
            style={{ color: 'rgba(255,255,255,0.3)' }}
          >
            Skip →
          </button>

          <div className="relative flex items-center justify-center mb-6">
            <motion.div
              className="absolute blur-3xl rounded-full w-64 h-16 opacity-20"
              style={{ background: '#378ADD', zIndex: -1 }}
              animate={{ opacity: [0.1, 0.25, 0.1] }}
              transition={{ duration: 3, repeat: Infinity }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
            >
              <svg
                width="152"
                height="51"
                viewBox="0 0 101 34"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{
                  filter: 'drop-shadow(0 0 20px rgba(55,138,221,0.3))',
                }}
              >
                <path
                  d="M100.717 11.1115V9.2424L99.9451 11.1115H99.8304L99.0609 9.2424V11.1115H98.7783V8.84229H99.184L99.8863 10.5491L100.594 8.84229H101V11.1115H100.717Z"
                  fill="white"
                />
                <path
                  d="M97.3945 11.1115V9.09411H96.6782V8.84229H98.399V9.09411H97.6771V11.1115H97.3945Z"
                  fill="white"
                />
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M53.8583 22.3198L44.7675 13.3606H48.3742C52.0564 13.3522 55.0391 10.3639 55.0391 6.68168C55.0391 2.99668 52.0564 0.00839404 48.3742 0H38.1922C33.1277 0.00559598 29.023 4.1103 29.0174 9.17752V15.8645C28.8649 19.049 26.238 21.584 23.0171 21.5894C21.05 21.5866 19.458 19.9946 19.4552 18.0275V8.71572H16.1451V18.0275C16.1479 21.8217 19.2229 24.8967 23.0171 24.8995C25.2133 24.8967 27.3369 24.1182 29.0174 22.7033V24.6917C28.9072 26.9568 27.5002 28.9683 25.3898 29.8436C23.1877 30.7558 20.6555 30.2521 18.9711 28.5677L18.6465 28.2431L16.3046 30.5851L16.6292 30.9097C19.2621 33.5398 23.2185 34.326 26.6545 32.9018C30.0933 31.4777 32.3345 28.1256 32.3345 24.4042V9.1774H32.3275C32.3332 5.94014 34.9549 3.31566 38.1922 3.31286H48.3742C50.2293 3.31846 51.7318 4.82379 51.7318 6.68168C51.7318 8.53677 50.2293 10.0421 48.3742 10.0477H39.0735V24.8325H42.3864V15.6633L51.6926 24.8353H53.8583V22.3198ZM0 1.19776H3.86407V21.5198H14.9023V24.8327H0V1.19776ZM75.1536 16.3685L75.1704 16.3797C76.4603 17.3478 77.1122 18.5901 77.1122 20.0731C77.1122 23.1537 74.5464 25.2242 70.7243 25.2242C67.9907 25.2242 65.8894 24.1582 64.4763 22.0569L64.2217 21.6763L66.8407 19.8856L67.1009 20.2745C68.0186 21.6707 69.205 22.3479 70.7243 22.3479C72.5934 22.3479 73.8217 21.528 73.8469 20.2577C73.8693 19.27 73.2985 18.6461 70.1088 17.9801C66.6896 17.317 64.952 15.7529 64.952 13.327C64.952 10.3052 67.4031 8.27378 71.0489 8.27378C73.7378 8.27378 75.5873 9.28107 76.547 11.2705L76.7205 11.6342L74.0288 13.411L73.7966 12.9465C73.1922 11.7377 72.2521 11.1474 70.9174 11.1474C69.2778 11.1474 68.2173 11.8637 68.2173 12.9689C68.2173 13.7607 68.4551 14.463 71.3707 15.059C73.1922 15.4591 74.4653 15.8984 75.1536 16.3685ZM61.4048 8.66538H58.3325V24.8324H61.4048V8.66538ZM94.6751 16.6846C94.6751 14.0629 93.9392 11.9812 92.4898 10.4982C91.0488 9.02086 89.163 8.27378 86.8826 8.27378C84.591 8.27378 82.6492 9.08801 81.1103 10.6969C79.5546 12.3197 78.7655 14.3567 78.7655 16.749C78.7655 19.1329 79.5658 21.1587 81.141 22.7678C82.7023 24.3988 84.7113 25.2242 87.112 25.2242C89.8849 25.2242 92.2072 24.0798 94.0175 21.8274L94.3029 21.4721L91.8855 19.4827L91.6085 19.9248C90.6208 21.4469 88.9251 22.3618 87.112 22.3479C85.8081 22.3618 84.5574 21.8414 83.6453 20.9097C82.7723 20.0842 82.2043 18.9846 82.0336 17.7955H94.6751V16.6846ZM82.07 15.115C82.2043 14.1077 82.6967 13.2375 83.5697 12.468C84.4819 11.6258 85.6738 11.1558 86.9162 11.1474C89.4847 11.1474 91.1999 12.6891 91.3902 15.115H82.07Z"
                  fill="white"
                />
                <path
                  d="M60.6771 1.43803C59.9356 1.11346 59.071 1.26456 58.4806 1.82136C58.0805 2.1907 57.8511 2.71114 57.8511 3.25955C57.8511 3.80516 58.0777 4.3284 58.4806 4.69773C58.8528 5.05868 59.3536 5.26014 59.874 5.25734C60.151 5.25734 60.4281 5.20138 60.6855 5.09226C61.4214 4.78168 61.8998 4.05978 61.897 3.26235C61.897 2.46211 61.413 1.74302 60.6771 1.43803Z"
                  fill="white"
                />
              </svg>
            </motion.div>
          </div>

          <motion.div
            initial={{ width: 0 }}
            animate={{ width: '120px' }}
            transition={{ duration: 0.6, delay: 0.8 }}
            style={{
              height: '1px',
              background: '#378ADD',
              marginBottom: '1rem',
            }}
          />

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 1.2 }}
            className="uppercase tracking-widest text-sm mb-3"
            style={{ color: 'rgba(255,255,255,0.5)' }}
          >
            AI ROI Report · Alpha
          </motion.p>

          <div className="text-center space-y-2 min-h-[48px]">
            <p className="text-white/70 text-sm font-light">
              {line1}
              {line1.length > 0 && line1.length < 70 && (
                <span className="animate-pulse ml-0.5">|</span>
              )}
            </p>
            <p className="text-white/40 text-xs">
              {line2}
              {line2.length > 0 && line2.length < 65 && (
                <span className="animate-pulse ml-0.5">|</span>
              )}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
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

function Step1({ data, onChange, errors, isAlpha }) {
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
        <label className="text-[12.5px] font-semibold text-gray-800 flex items-center">
          Team size{' '}
          <span className="font-normal text-gray-400 ml-1">
            — drives realistic workflow volumes
          </span>
          {isAlpha && (
            <Tooltip text="Larger teams have more repetitive work to automate. This sizes the opportunity accurately." />
          )}
        </label>
        <PillGroup
          options={TEAM_SIZE_OPTS}
          value={data.teamSize}
          onChange={(v) => onChange('teamSize', v)}
        />
      </div>
      <div className="space-y-2">
        <label className="text-[12.5px] font-semibold text-gray-800 flex items-center">
          Estimated annual revenue{' '}
          <span className="font-normal text-gray-400 ml-1">
            — sets the 5–20% Total Financial Gain band
          </span>
          {isAlpha && (
            <Tooltip
              text="Used to estimate scale only — not shared externally. Pick the closest band."
              openLeft
            />
          )}
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

function Step2({
  data,
  onChange,
  errors,
  isDev,
  isAlpha,
  intakeRating,
  onIntakeRatingChange,
}) {
  const [intakeHovered, setIntakeHovered] = useState(0)
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
          {isAlpha
            ? 'Your report is generated and displayed here — usually ready in 60 seconds.'
            : 'Your report is generated and emailed — usually ready in 60 seconds.'}
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
        <label className="text-[12.5px] font-semibold text-gray-800 flex items-center">
          Operating currency <span className="text-red-500 ml-1">*</span>
          {isAlpha && (
            <Tooltip text="Every figure in your report will display in this currency." />
          )}
        </label>
        <PillGroup
          options={CURRENCIES}
          value={data.currency}
          onChange={(v) => onChange('currency', v)}
          error={errors.currency}
        />
      </div>

      {/* Alpha only: intake clarity star rating */}
      {isAlpha && (
        <div className="pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-400 mb-2">
            Optional — How clear was this form?
          </p>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => onIntakeRatingChange(star)}
                onMouseEnter={() => setIntakeHovered(star)}
                onMouseLeave={() => setIntakeHovered(0)}
                aria-label={`${star} star${star > 1 ? 's' : ''}`}
                className="focus:outline-none transition-transform hover:scale-110"
              >
                <FaStar
                  className={clsx(
                    'w-5 h-5 transition-colors',
                    star <= (intakeHovered || intakeRating)
                      ? 'text-amber-400'
                      : 'text-slate-200',
                  )}
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Error view ────────────────────────────────────────────────────────────────

function ErrorView({ message, onRetry, onUseEstimates }) {
  const isResearchFailure =
    message?.includes('Stages done: none') ||
    message?.includes('no assembled report') ||
    message?.includes("couldn't research") ||
    message?.includes('retrieve specific web pages')
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
            {message || 'Something went wrong. Please try again.'}
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

// ── Success view ──────────────────────────────────────────────────────────────

function SuccessView({ email, reportId, isEmployee }) {
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [limitReached, setLimitReached] = useState(false)
  const bottomRef = useRef(null)

  const userSentCount = messages.filter((m) => m.role === 'user').length

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

// ── SSE log mapper ────────────────────────────────────────────────────────────

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

// ── Server-side auth / alpha detection ───────────────────────────────────────

export async function getServerSideProps({ req, res, query }) {
  // Alpha mode: any ?alpha= param bypasses login and activates the alpha UX.
  // Proper token validation is handled in Task 2.
  if (query.alpha) {
    return { props: { isEmployee: false, isAlpha: true } }
  }

  const { createClient, createAdminClient } =
    await import('../src/lib/supabase-server')
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

  return { props: { isEmployee, isAlpha: false } }
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ROIReport({ isEmployee, isAlpha }) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [viewState, setViewState] = useState(VIEW_STATES.FORM)

  // Alpha-specific UI state
  const [showSplash, setShowSplash] = useState(isAlpha)
  const [intakeRating, setIntakeRating] = useState(0)

  const [isGenerationComplete, setIsGenerationComplete] = useState(false)
  const generationStartedAt = useRef(Date.now())
  const [generationLog, setGenerationLog] = useState('')
  const [sseEvents, setSseEvents] = useState([])
  const [reportState, setReportState] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [reportId, setReportId] = useState(null)

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

  // Generate a unique per-session alpha token (used as alpha_feedback PK)
  // and fire a one-time notification email to the internal team.
  useEffect(() => {
    if (!isAlpha) return

    if (!localStorage.getItem('alpha_token')) {
      localStorage.setItem(
        'alpha_token',
        `alpha_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      )
    }

    // One notification per browser session — skip if already sent
    if (!localStorage.getItem('alpha_notified')) {
      const token = localStorage.getItem('alpha_token')
      fetch('/api/alpha-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alphaToken: token }),
      })
        .then(() => localStorage.setItem('alpha_notified', '1'))
        .catch(() => {}) // non-critical
    }
  }, [isAlpha])

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

      // Alpha: mark intake step as complete
      if (isAlpha) {
        try {
          const token = localStorage.getItem('alpha_token')
          if (token) {
            createBrowserClient()
              .from('alpha_feedback')
              .upsert(
                { alpha_token: token, step_intake_completed: true },
                { onConflict: 'alpha_token' },
              )
              .then(({ error }) => {
                if (error) console.error('[alpha] intake tracking:', error)
              })
          }
        } catch {
          /* non-critical */
        }
      }

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
                // eslint-disable-next-line no-console
                console.warn(
                  'GET /api/roi-agent failed during 409 fallback:',
                  existing.status,
                )
              } else {
                const existingData = await existing.json()
                if (existingData?.report?.rendered_html) {
                  const { buildStateFromReportRow } =
                    await import('../src/lib/roi/reportState')
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
              // eslint-disable-next-line no-console
              console.warn(
                'Failed to load existing report from 409 fallback:',
                err,
              )
            }
            window.location.href = isAlpha
              ? `/report/${data.report_id}?alpha=true`
              : `/report/${data.report_id}`
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
                setErrorMessage(
                  'Report generation finished without a complete report.',
                )
                setViewState(VIEW_STATES.ERROR)
              }
            } else if (event.type === 'error') {
              throw new Error(event.message)
            }
          },
        )
      } catch (err) {
        setErrorMessage(
          err.message || 'Something went wrong. Please try again.',
        )
        setViewState(VIEW_STATES.ERROR)
      }
    },
    [s1, s2, isAlpha],
  )

  // Enforce minimum loader visibility before transitioning to COMPLETE
  useEffect(() => {
    if (viewState !== VIEW_STATES.FINALISING) return () => {}
    if (!reportState?.renderedHtml) return () => {}

    let timeout
    const elapsed = Date.now() - generationStartedAt.current
    const remaining = Math.max(0, MIN_VISIBLE_DURATION - elapsed)

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

  // COMPLETE: track generation (alpha), then navigate to report
  useEffect(() => {
    if (viewState !== VIEW_STATES.COMPLETE) return () => {}

    if (isAlpha) {
      try {
        const token = localStorage.getItem('alpha_token')
        if (token) {
          createBrowserClient()
            .from('alpha_feedback')
            .upsert(
              { alpha_token: token, step_generation_completed: true },
              { onConflict: 'alpha_token' },
            )
            .then(({ error }) => {
              if (error) console.error('[alpha] generation tracking:', error)
            })
        }
      } catch {
        /* non-critical */
      }
    }

    if (reportId) {
      const timeout = setTimeout(() => {
        router.push(
          isAlpha ? `/report/${reportId}?alpha=true` : `/report/${reportId}`,
        )
      }, 400)
      return () => clearTimeout(timeout)
    }

    const fallback = setTimeout(() => {
      setErrorMessage(
        'Report was generated but could not be saved. Please try again or check server logs.',
      )
      setViewState(VIEW_STATES.ERROR)
    }, 8000)
    return () => clearTimeout(fallback)
  }, [viewState, reportId, router, isAlpha])

  const next = useCallback(
    async ({ skipLLM = false } = {}) => {
      const currentErrors = validateStep(step, s1, s2)
      setErrors(currentErrors)
      if (Object.keys(currentErrors).length) return
      if (step < TOTAL_STEPS) {
        setStep((prev) => prev + 1)
        return
      }
      await runGeneration({ skipLLM })
    },
    [step, s1, s2, runGeneration],
  )

  const back = useCallback(() => {
    setStep((prev) => Math.max(prev - 1, 1))
    setErrors({})
  }, [])

  // ── Renders ───────────────────────────────────────────────────────────────

  // Alpha splash — shown until animation completes
  if (isAlpha && showSplash) {
    return <SplashScreen onExitComplete={() => setShowSplash(false)} />
  }

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
            />
          </div>
        </div>
      </div>
    )
  }

  // ── Form ──────────────────────────────────────────────────────────────────

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
        {isAlpha && <meta name="robots" content="noindex,nofollow" />}
      </Head>

      {/* Alpha testing banner */}
      {isAlpha && (
        <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-amber-400 py-1 text-xs font-semibold text-amber-900">
          <span>🧪</span>
          <span>Alpha testing — your feedback shapes this product</span>
        </div>
      )}

      <div
        className={clsx(
          'flex flex-col items-center justify-center min-h-screen p-4 font-sans text-gray-900',
          isAlpha && 'pt-10',
        )}
      >
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
                    <Step1
                      data={s1}
                      onChange={changeS1}
                      errors={errors}
                      isAlpha={isAlpha}
                    />
                  )}
                  {step === 2 && (
                    <Step2
                      data={s2}
                      onChange={changeS2}
                      errors={errors}
                      isDev={IS_DEV}
                      isAlpha={isAlpha}
                      intakeRating={intakeRating}
                      onIntakeRatingChange={(v) => {
                        setIntakeRating(v)
                        localStorage.setItem('alpha_intake_rating', String(v))
                      }}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Navigation footer */}
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
