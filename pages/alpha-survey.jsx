import React, { useState, useEffect } from 'react'
import Head from 'next/head'
import { motion, AnimatePresence } from 'framer-motion'
import { FaCheckCircle, FaStar } from 'react-icons/fa'
import clsx from 'clsx'
import { useRouter } from 'next/router'
import MainHeader from '../src/layout/MainHeader'
import { createClient } from '../src/lib/supabase-browser'

// ── Question definitions ──────────────────────────────────────────────────────

const Q1 = {
  id: 'pmf_disappointed',
  type: 'radio',
  question: 'How would you feel if you could no longer use this report?',
  options: ['Very disappointed', 'Somewhat disappointed', 'Not disappointed'],
}

// Alt question for non-disappointed users
const Q_ALT = {
  id: 'not_disappointed_reason',
  type: 'text',
  question: 'What would need to change for this to be more valuable to you?',
  placeholder: 'e.g. If it included competitive benchmarks for my industry…',
}

const FOLLOW_UP_QUESTIONS = [
  {
    id: 'pmf_who_benefits',
    type: 'text',
    question: 'What type of company benefits most from this report?',
    placeholder: 'e.g. Mid-size B2B SaaS companies with large ops teams…',
  },
  {
    id: 'pmf_main_benefit',
    type: 'text',
    question: 'What was the most valuable thing about this report?',
    placeholder:
      'e.g. It gives me a concrete number I can put in front of my CFO…',
  },
  {
    id: 'pmf_improvement',
    type: 'text',
    question: 'What would most improve this report?',
    placeholder: 'e.g. A more granular breakdown by department…',
  },
  {
    id: 'pmf_virality',
    type: 'stars',
    question: 'How likely are you to share this with a decision-maker?',
    hint: '1 = not at all · 5 = definitely',
  },
]

// ── Sub-components ────────────────────────────────────────────────────────────

// Horizontal progress dots
function ProgressDots({ total, current }) {
  return (
    <div className="flex gap-1.5 justify-center mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={clsx(
            'h-1.5 rounded-full transition-all duration-300',
            i === current
              ? 'w-5 bg-slate-900'
              : i < current
              ? 'w-1.5 bg-slate-400'
              : 'w-1.5 bg-slate-200',
          )}
        />
      ))}
    </div>
  )
}

// 1–5 star picker with hover preview
function StarPicker({ value, onChange }) {
  const [hovered, setHovered] = useState(0)
  return (
    <div className="flex gap-3 justify-center">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          aria-label={`${star} star${star > 1 ? 's' : ''}`}
          className="focus:outline-none transition-transform hover:scale-110"
        >
          <FaStar
            className={clsx(
              'w-9 h-9 transition-colors',
              star <= (hovered || value) ? 'text-amber-400' : 'text-slate-200',
            )}
          />
        </button>
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AlphaSurvey() {
  const router = useRouter()
  const { reportId, email: emailParam } = router.query

  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState({})
  const [currentValue, setCurrentValue] = useState('')
  const [currentStars, setCurrentStars] = useState(0)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [done, setDone] = useState(false)

  const [intakeRating, setIntakeRating] = useState(null)
  const [generationSpeed, setGenerationSpeed] = useState(null)

  // Read localStorage on mount
  useEffect(() => {
    setIntakeRating(localStorage.getItem('alpha_intake_rating') || null)
    setGenerationSpeed(localStorage.getItem('alpha_generation_speed') || null)
  }, [])

  // ── Compute question sequence based on Q1 answer ──────────────

  const q1Answer = answers['pmf_disappointed']
  const isDisappointed =
    q1Answer === 'Very disappointed' || q1Answer === 'Somewhat disappointed'

  const questions = q1Answer
    ? [Q1, ...(isDisappointed ? FOLLOW_UP_QUESTIONS : [Q_ALT])]
    : [Q1]

  const totalQuestions = q1Answer
    ? isDisappointed
      ? 1 + FOLLOW_UP_QUESTIONS.length // 5 total
      : 2                               // Q1 + alt
    : 1

  const activeQuestion = questions[currentQ]
  const isLastQuestion = currentQ === questions.length - 1

  useEffect(() => {
    if (!activeQuestion) return
    const existing = answers[activeQuestion.id]
    if (activeQuestion.type === 'stars') {
      setCurrentStars(existing || 0)
    } else {
      setCurrentValue(existing || '')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQ, activeQuestion?.id])

  // ── Navigation helpers ────────────────────────────────────────────────────

  // Commit current answer and return it
  const commitAnswer = () => {
    if (!activeQuestion) return null
    const value =
      activeQuestion.type === 'stars' ? currentStars : currentValue
    setAnswers((prev) => ({ ...prev, [activeQuestion.id]: value }))
    return value
  }

  const handleNext = () => {
    commitAnswer()
    setCurrentQ((prev) => prev + 1)
  }

  const handleSkip = () => {
    setCurrentQ((prev) => prev + 1)
    setCurrentValue('')
    setCurrentStars(0)
  }

  // Submit final answers to Supabase
  const handleSubmit = async () => {
    const finalValue = commitAnswer()
    const finalAnswers = {
      ...answers,
      [activeQuestion.id]: finalValue,
    }

    setSubmitting(true)
    setSubmitError('')

    try {
      const supabase = createClient()

      const alphaToken = localStorage.getItem('alpha_token') || null
      const chatKeywords = localStorage.getItem('alpha_chat_keywords')
      const parsedKeywords = chatKeywords ? JSON.parse(chatKeywords) : null

      const payload = {
        ...(alphaToken ? { alpha_token: alphaToken } : {}),
        report_id: reportId || null,
        user_email: emailParam || null,
        chat_keywords: parsedKeywords,
        // PMF core fields
        pmf_disappointed: finalAnswers['pmf_disappointed'] || null,
        pmf_who_benefits: finalAnswers['pmf_who_benefits'] || null,
        pmf_main_benefit: finalAnswers['pmf_main_benefit'] || null,
        pmf_improvement: finalAnswers['pmf_improvement'] || null,
        pmf_virality: finalAnswers['pmf_virality'] || null,
        step1_intake_rating: intakeRating ? parseInt(intakeRating, 10) : null,
        step2_generation_speed: generationSpeed || null,
        tour_completed: true,
        step_survey_completed: true,
        last_completed_step: 5,
        created_at: new Date().toISOString(),
      }

      // eslint-disable-next-line no-console
      console.log('alpha_feedback payload:', payload)

      const { error } = alphaToken
        ? await supabase.from('alpha_feedback').upsert(payload, { onConflict: 'alpha_token' })
        : await supabase.from('alpha_feedback').insert(payload)
      if (error) throw error

      // Clean up localStorage
      localStorage.removeItem('alpha_token')
      localStorage.removeItem('alpha_intake_rating')
      localStorage.removeItem('alpha_intake_comment')
      localStorage.removeItem('alpha_generation_speed')

      setDone(true)
    } catch (err) {
      setSubmitError('Could not save your feedback. Please try again.')
      // eslint-disable-next-line no-console
      console.error('alpha_feedback insert error:', err)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Thank you screen ──────────────────────────────────────────────────────

  if (done) {
    return (
      <div className="min-h-screen bg-white font-sans">
        <Head>
          <title>Thank You | LyRise Alpha</title>
          <meta name="robots" content="noindex,nofollow" />
        </Head>
        <MainHeader />
        <div className="flex items-center justify-center min-h-screen p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="text-center max-w-sm"
          >
            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6 ring-8 ring-green-50/50">
              <FaCheckCircle className="text-3xl text-green-500" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-3">
              Thank you so much!
            </h1>
            <p className="text-slate-500 text-sm leading-relaxed mb-8">
              Your feedback goes directly to the team building this product.
              We genuinely appreciate you taking the time.
            </p>
            <button
              type="button"
              onClick={() => router.push('/')}
              className="inline-flex items-center justify-center rounded-xl text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-900 h-10 px-8 transition-colors"
            >
              Back to LyRise
            </button>
          </motion.div>
        </div>
      </div>
    )
  }

  // ── Survey card ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-white font-sans">
      <Head>
        <title>Alpha Feedback | LyRise</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <MainHeader />

      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="w-full max-w-lg">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentQ}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.22 }}
              className="bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden"
            >
              <div className="px-8 pt-8 pb-8">
                {/* Back button */}
                {currentQ > 0 && (
                  <button
                    type="button"
                    onClick={() => setCurrentQ((prev) => prev - 1)}
                    className="text-sm text-slate-400 hover:text-slate-600 flex items-center gap-1 mb-4"
                  >
                    ← Back
                  </button>
                )}

                <ProgressDots total={totalQuestions} current={currentQ} />

                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2 text-center">
                  Question {currentQ + 1} of {totalQuestions}
                </p>

                <h2 className="text-xl font-bold text-slate-900 text-center mb-6 leading-snug">
                  {activeQuestion?.question}
                </h2>

                {/* Radio options */}
                {activeQuestion?.type === 'radio' && (
                  <div className="flex flex-col gap-3">
                    {activeQuestion.options.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => {
                          setAnswers((prev) => ({
                            ...prev,
                            [activeQuestion.id]: opt,
                          }))
                          setCurrentQ((prev) => prev + 1)
                        }}
                        className={clsx(
                          'w-full text-left px-5 py-3.5 rounded-xl border text-sm font-medium transition-all duration-100',
                          answers[activeQuestion.id] === opt
                            ? 'bg-slate-900 border-slate-900 text-white'
                            : 'border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-900',
                        )}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}

                {/* Text area */}
                {activeQuestion?.type === 'text' && (
                  <textarea
                    value={currentValue}
                    onChange={(e) => setCurrentValue(e.target.value)}
                    rows={3}
                    placeholder={activeQuestion.placeholder}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-slate-500 resize-none transition-colors"
                    autoFocus
                  />
                )}

                {/* Star picker */}
                {activeQuestion?.type === 'stars' && (
                  <div className="space-y-3">
                    {activeQuestion.hint && (
                      <p className="text-xs text-slate-400 text-center">
                        {activeQuestion.hint}
                      </p>
                    )}
                    <StarPicker
                      value={currentStars}
                      onChange={setCurrentStars}
                    />
                  </div>
                )}

                {/* Submit error message */}
                {submitError && (
                  <p className="mt-4 text-xs text-red-500 text-center">
                    {submitError}
                  </p>
                )}

                {/* Navigation buttons */}
                {activeQuestion?.type !== 'radio' && (
                  <div className="flex gap-3 mt-8">
                    {!isLastQuestion && (
                      <button
                        type="button"
                        onClick={handleSkip}
                        className="flex-1 py-2.5 text-sm font-medium text-slate-500 border border-slate-200 rounded-xl hover:border-slate-400 transition-colors"
                      >
                        Skip
                      </button>
                    )}

                    {isLastQuestion ? (
                      <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={
                          submitting ||
                          (activeQuestion.type === 'stars' &&
                            currentStars === 0)
                        }
                        className={clsx(
                          'flex-1 py-2.5 text-sm font-semibold rounded-xl transition-colors',
                          submitting ||
                            (activeQuestion.type === 'stars' &&
                              currentStars === 0)
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'bg-slate-900 text-white hover:bg-slate-700',
                        )}
                      >
                        {submitting ? 'Saving…' : 'Submit feedback →'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleNext}
                        className="flex-1 py-2.5 text-sm font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-700 transition-colors"
                      >
                        Next →
                      </button>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
