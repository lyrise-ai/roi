import React, { useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import axios from 'axios'
import { toast, ToastContainer } from 'react-toastify'
import { motion, AnimatePresence } from 'framer-motion'
import { FaSpinner, FaCheckCircle } from 'react-icons/fa'
import clsx from 'clsx'
import 'react-toastify/dist/ReactToastify.css'
import MainHeader from '../src/layout/MainHeader'

// Questions Configuration
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

// Validation Schema
const schema = yup.object().shape({
  answers: yup.object().shape({
    clarity: yup.number().required('Required'),
    relevance: yup.number().required('Required'),
    depth: yup.number().required('Required'),
    actionability: yup.number().required('Required'),
    interest: yup.number().required('Required'),
  }),
  comment: yup.string().optional(),
})

// Reusable Label Component
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

export default function ROIFeedback() {
  const router = useRouter()
  const { id } = router.query
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      answers: {},
    },
  })

  const onSubmit = async (data) => {
    if (!id) {
      toast.error('Invalid feedback link. Missing submission ID.')
      return
    }

    setIsSubmitting(true)
    try {
      await axios.post('/api/feedback', {
        submissionId: id,
        answers: data.answers,
        comment: data.comment,
      })
      setIsSuccess(true)
      // Small delay for animation smoothness
      setTimeout(() => setIsSuccess(true), 300)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Feedback error:', error)
      toast.error(
        error.response?.data?.error ||
          'Failed to submit feedback. Please try again.',
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
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"
          >
            <AnimatePresence mode="wait">
              {!isSuccess ? (
                <motion.div
                  key="form"
                  exit={{ opacity: 0, filter: 'blur(5px)' }}
                  transition={{ duration: 0.3 }}
                  className="p-6 md:p-10"
                >
                  <div className="text-center mb-8">
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-2">
                      We Value Your Opinion
                    </h1>
                    <p className="text-slate-500 text-sm md:text-base">
                      Help us improve by answering a few quick questions.
                    </p>
                  </div>

                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
                    <div className="space-y-6">
                      {questions.map((q) => (
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

                          <Controller
                            name={`answers.${q.id}`}
                            control={control}
                            render={({ field }) => (
                              <div className="flex items-center justify-between sm:justify-start sm:gap-4">
                                {q.options.map((val) => (
                                  <button
                                    key={val}
                                    type="button"
                                    onClick={() => field.onChange(val)}
                                    className={clsx(
                                      'relative w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-md text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2',
                                      field.value === val
                                        ? 'bg-slate-900 text-white shadow-md scale-100'
                                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 hover:border-slate-300',
                                    )}
                                  >
                                    {val}
                                    {field.value === val && (
                                      <motion.div
                                        layoutId={`active-ring-${q.id}`}
                                        className="absolute inset-0 rounded-md ring-2 ring-offset-2 ring-slate-900"
                                        initial={false}
                                        transition={{
                                          type: 'spring',
                                          stiffness: 500,
                                          damping: 30,
                                        }}
                                      />
                                    )}
                                  </button>
                                ))}
                              </div>
                            )}
                          />
                          {/* Labels for scale end points */}
                          <div className="flex justify-between w-full sm:w-[calc(12*5px+4*16px)] text-[10px] uppercase tracking-wider text-slate-400 font-medium px-1">
                            <span>Poor</span>
                            <span>Excellent</span>
                          </div>

                          {errors.answers?.[q.id] && (
                            <p className="text-red-500 text-xs mt-1 font-medium animate-pulse">
                              * Please select a rating
                            </p>
                          )}
                        </div>
                      ))}
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
                        {...register('comment')}
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
                          <FaSpinner className="animate-spin mr-2 h-4 w-4" />
                          Submitting...
                        </>
                      ) : (
                        'Submit Feedback'
                      )}
                    </button>
                  </form>
                </motion.div>
              ) : (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4 }}
                  className="p-12 text-center flex flex-col items-center justify-center min-h-[400px]"
                >
                  <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mb-6 ring-8 ring-green-50/50">
                    <FaCheckCircle className="text-3xl text-green-600" />
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
                    className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 border border-slate-200 bg-white hover:bg-slate-100 text-slate-900 h-10 px-8"
                  >
                    Return Home
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <div className="mt-8 text-center text-xs text-slate-400">
            &copy; {new Date().getFullYear()} LyRise. All rights reserved.
          </div>
        </div>
      </div>
    </div>
  )
}
