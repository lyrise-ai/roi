import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'

const STEP_LABELS = ['Workflows', 'Volume', 'Duration', 'Context']

// Card shell + step-rail + Skip action for the validation wizard. Modeled on
// pages/roi-report.jsx's existing intake-form wizard shell (progress
// indicator, AnimatePresence step swap), built fresh here rather than
// extracted from that page so the two flows stay decoupled.
export default function WizardShell({ step, canSkip, onSkip, children }) {
  const showRail = step >= 1 && step <= 4

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1180px] flex-col px-6 py-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div className="flex w-[160px] shrink-0 items-center gap-2.5 text-sm font-bold text-[#0F172A]">
          <div className="flex h-[26px] w-[26px] items-center justify-center rounded-md bg-[#0B1528] text-[10px] font-bold text-white">
            Ly
          </div>
          LyRise
        </div>

        {showRail && (
          <div className="flex items-center gap-1.5">
            {STEP_LABELS.map((label, i) => {
              const n = i + 1
              const done = step > n
              const current = step === n
              return (
                <div key={label} className="flex items-center gap-1.5">
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className={clsx(
                        'flex h-[26px] w-[26px] items-center justify-center rounded-full text-[11px] font-bold transition-all',
                        done && 'bg-[#5B48F8] text-white',
                        current &&
                          'border-2 border-[#5B48F8] bg-white text-[#5B48F8] shadow-[0_0_0_4px_#EDE9FE]',
                        !done &&
                          !current &&
                          'border border-[#E5E7EB] bg-[#F1F2F5] text-[#9CA3AF]',
                      )}
                    >
                      {done ? '✓' : n}
                    </div>
                    <div
                      className={clsx(
                        'text-[10px] font-semibold',
                        current
                          ? 'text-[#5B48F8]'
                          : done
                            ? 'text-[#374151]'
                            : 'text-[#9CA3AF]',
                      )}
                    >
                      {label}
                    </div>
                  </div>
                  {i < STEP_LABELS.length - 1 && (
                    <div
                      className={clsx(
                        'mt-[-14px] h-0.5 w-7',
                        step > n ? 'bg-[#5B48F8]' : 'bg-[#E5E7EB]',
                      )}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="flex w-[160px] shrink-0 justify-end">
          {canSkip && (
            <button
              type="button"
              onClick={onSkip}
              className="text-xs font-semibold text-[#9CA3AF] hover:text-[#374151]"
            >
              Skip validation →
            </button>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-[740px] flex-1 pb-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
