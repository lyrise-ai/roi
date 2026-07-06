import React, { useMemo, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { toast, ToastContainer } from 'react-toastify'
import clsx from 'clsx'
import 'react-toastify/dist/ReactToastify.css'
import MainHeader from '../src/layout/MainHeader'

const questions = [
  {
    id: 'clarity',
    label: 'Clarity',
    description: 'Was the report easy to understand?',
    options: [1, 2, 3, 4, 5],
  },
  {
    id: 'relevance',
    label: 'Relevance',
    description: 'Did the metrics seem relevant to your business?',
    options: [1, 2, 3, 4, 5],
  },
  {
    id: 'depth',
    label: 'Depth',
    description: 'Was the analysis detailed enough?',
    options: [1, 2, 3, 4, 5],
  },
  {
    id: 'actionability',
    label: 'Actionability',
    description: 'Is the path forward clear?',
    options: [1, 2, 3, 4, 5],
  },
  {
    id: 'interest',
    label: 'Interest',
    description: 'How interested are you in a follow-up discussion?',
    options: [1, 2, 3, 4, 5],
  },
]

const Label = ({ children, className, as: Component = 'label', ...props }) => (
  <Component
    className={clsx(
      'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
      className,
    )}
    {...props}
  >
    {children}
  </Component>
)

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-8 w-8 text-green-600"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

export default function ROIFeedback() {
  const router = useRouter()
  const { id } = router.query
  const [answers, setAnswers] = useState({})
  const [comment, setComment] = useState('')
  const [touchedSubmit, setTouchedSubmit] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const missingAnswers = useMemo(
    () => questions.filter((q) => !answers[q.id]).map((q) => q.id),
    [answers],
  )

  const onSubmit = async (event) => {
    event.preventDefault()
    setTouchedSubmit(true)

    if (!id) {
      toast.error('Invalid feedback link. Missing submission ID.')
      return
    }

    if (missingAnswers.length) {
      toast.error('Please select a rating for each question.')
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: id,
          answers,
          comment,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit feedback.')
      }
      setIsSuccess(true)
    } catch (error) {
      toast.error(
        error.message || 'Failed to submit feedback. Please try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col font-sans bg-gray-50/50 text-slate-900">
      <Head>
        <title>ROI Feedback | LyRise</title>
        <meta
          name="description"
          content="Share your feedback on the ROI Report"
        />
      </Head>

      <MainHeader />
      <ToastContainer position="top-right" autoClose={5000} theme="light" />

      <div className="flex-grow flex items-center justify-center p-4 md:py-16">
        <div className="w-full max-w-[600px]">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {!isSuccess ? (
              <div className="p-6 md:p-10">
                <div className="text-center mb-8">
                  <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-2">
                    We Value Your Opinion
                  </h1>
                  <p className="text-slate-500 text-sm md:text-base">
                    Help us improve by answering a few quick questions.
                  </p>
                </div>

                <form onSubmit={onSubmit} className="space-y-8">
                  <div className="space-y-6">
                    {questions.map((q) => {
                      const selected = answers[q.id]
                      const showError = touchedSubmit && !selected
                      return (
                        <div key={q.id} className="space-y-3">
                          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline">
                            <Label
                              as="span"
                              className="text-base font-semibold text-slate-800"
                            >
                              {q.label}
                            </Label>
                            <span className="text-xs text-slate-500 font-normal">
                              {q.description}
                            </span>
                          </div>

                          <div className="flex items-center justify-between sm:justify-start sm:gap-4">
                            {q.options.map((val) => (
                              <button
                                key={val}
                                type="button"
                                onClick={() =>
                                  setAnswers((prev) => ({
                                    ...prev,
                                    [q.id]: val,
                                  }))
                                }
                                className={clsx(
                                  'relative w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-md text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2',
                                  selected === val
                                    ? 'bg-slate-900 text-white shadow-md ring-2 ring-offset-2 ring-slate-900'
                                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 hover:border-slate-300',
                                )}
                              >
                                {val}
                              </button>
                            ))}
                          </div>
                          <div className="flex justify-between w-full sm:w-[calc(12*5px+4*16px)] text-[10px] uppercase tracking-wider text-slate-400 font-medium px-1">
                            <span>Poor</span>
                            <span>Excellent</span>
                          </div>

                          {showError && (
                            <p className="text-red-500 text-xs mt-1 font-medium animate-pulse">
                              * Please select a rating
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  <div className="pt-4 border-t border-slate-100">
                    <Label
                      htmlFor="comment"
                      className="block mb-2 text-slate-700"
                    >
                      Additional Comments{' '}
                      <span className="text-slate-400 font-normal ml-1">
                        (Optional)
                      </span>
                    </Label>
                    <textarea
                      id="comment"
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                      rows="4"
                      className="w-full min-h-[100px] px-3 py-2 rounded-md border border-slate-200 bg-transparent text-sm shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1 resize-none transition-all"
                      placeholder="Tell us more about your experience..."
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={clsx(
                      'w-full inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-white',
                      'bg-slate-900 text-white hover:bg-slate-900/90 h-12 px-8 shadow-sm',
                      isSubmitting && 'opacity-70 cursor-wait',
                    )}
                  >
                    {isSubmitting ? (
                      <>
                        <span className="mr-2 h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      'Submit Feedback'
                    )}
                  </button>
                </form>
              </div>
            ) : (
              <div className="p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
                <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mb-6 ring-8 ring-green-50/50">
                  <CheckIcon />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">
                  Thank You!
                </h2>
                <p className="text-slate-500 max-w-xs mx-auto mb-8">
                  Your feedback helps us to process your request well.
                </p>
                <button
                  type="button"
                  onClick={() => router.push('/')}
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus:ring-slate-400 focus:ring-offset-2 border border-slate-200 bg-white hover:bg-slate-100 text-slate-900 h-10 px-8"
                >
                  Return Home
                </button>
              </div>
            )}
          </div>

          <div className="mt-8 text-center text-xs text-slate-400">
            &copy; {new Date().getFullYear()} LyRise. All rights reserved.
          </div>
        </div>
      </div>
    </div>
  )
}
