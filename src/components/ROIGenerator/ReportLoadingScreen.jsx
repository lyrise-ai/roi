import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import NumberScale from './NumberScale'
import { INTER_FONT_FAMILY } from '@/src/utilities/fonts'

const PHASES = [
  {
    id: 'research',
    label: 'Research',
    subLabel: 'Identifying likely high-friction workflows in your company',
    heading: 'Mapping your operational signals',
    logs: [
      'Profiling company from public sources…',
      'Looking up company intelligence…',
      'Reading company website…',
      'Sourcing salary benchmarks…',
      'Checking regional compensation data…',
      'Research complete — workflows identified…',
    ],
  },
  {
    id: 'model',
    label: 'Financial Model',
    subLabel:
      'Matching your profile against benchmarks and ranking workflows by ROI',
    heading: 'Interpreting your operational signals',
    logs: [
      'Calibrating ROI model inputs…',
      'Refining model assumptions…',
      '3-year financial projections validated…',
    ],
  },
  {
    id: 'report',
    label: 'Report',
    subLabel: 'Ranking workflows by ROI and assembling your Profit Map',
    heading: 'Building your Profit Map',
    logs: [
      'Writing profit levers and executive summary…',
      'Rendering financial tables and report layout…',
    ],
  },
]

const MAX_LOG_LINES = 8
// Only auto-advance phases on a timer when the pipeline is silent this long
const PHASE_IDLE_ADVANCE_MS = 45000
const MIN_LOG_GAP_MS = 2500

const PIPELINE_MILESTONE_RE =
  /^(Research complete|Calibrating ROI|Refining model assumptions|3-year financial|Writing profit|Rendering financial)/i

// Rotating messages from web_search pools in agent.ts — collapse to one summary line
const SEARCH_POOL_RE =
  /^(Profiling company|Looking up company|Estimating headcount|Checking company footprint|Sourcing salary|Querying role-based|Cross-referencing wage|Collecting salary evidence)/i

const RESEARCH_ACTIVITY_SUMMARY = 'Researching company and salary benchmarks…'

function nowLabel() {
  const d = new Date()
  const hms = [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':')
  const tenths = Math.floor(d.getMilliseconds() / 100)
  return `${hms}.${tenths}`
}

function classifyPipelineLog(text) {
  if (PIPELINE_MILESTONE_RE.test(text)) return 'milestone'
  if (text.startsWith('Reading company website')) return 'fetch'
  if (SEARCH_POOL_RE.test(text)) return 'search-pool'
  return 'other'
}

function makeJobRef() {
  return 'ROI-' + Math.random().toString(36).slice(2, 8).toUpperCase()
}

export default function ReportLoadingScreen({
  generationLog,
  sseEvents = [],
  viewState = 'generating',
  onOpen,
  isAlpha = false,
  reportId = null,
}) {
  const [phaseIndex, setPhaseIndex] = useState(0)
  const [logs, setLogs] = useState([])
  const [elapsed, setElapsed] = useState(0)
  const logId = useRef(0)
  const jobRef = useRef(makeJobRef())
  const startTime = useRef(new Date())
  const lastProcessedSseIndex = useRef(0)
  const lastLogAppendAt = useRef(0)
  const [intakeEase, setIntakeEase] = useState(0)
  const [intakeEaseNote, setIntakeEaseNote] = useState('')

  // Alpha tour tracking — best-effort, fire-and-forget. Sends the current
  // rating and note together every time either changes; never awaited, never
  // blocks the generation wait it's shown alongside.
  const trackIntakeEase = (rating, note) => {
    if (!isAlpha) return
    try {
      const token = localStorage.getItem('alpha_token')
      if (!token) return
      fetch('/api/alpha/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_token: token,
          report_id: reportId,
          intake_ease: rating || null,
          intake_ease_note: note?.trim() || null,
        }),
      })
        .then((res) => {
          if (!res.ok) {
            console.error('[alpha] intake_ease tracking failed:', res.status)
          }
        })
        .catch((err) => {
          console.error('[alpha] intake_ease tracking failed:', err)
        })
    } catch (err) {
      console.error('[alpha] intake_ease tracking failed:', err)
    }
  }

  const rateIntakeEase = (value) => {
    setIntakeEase(value)
    trackIntakeEase(value, intakeEaseNote)
  }

  useEffect(() => {
    if (sseEvents.length === 0) {
      lastProcessedSseIndex.current = 0
      lastLogAppendAt.current = 0
    }
  }, [sseEvents.length])

  // eslint-disable-next-line security/detect-object-injection
  const activePhase = PHASES[phaseIndex]
  const isFinalising = viewState === 'finalising'
  const isComplete = viewState === 'complete'
  const isDoneOrFinalising = isFinalising || isComplete

  // Phase auto-advance — idle fallback only; real pipeline_log drives phases first
  useEffect(() => {
    if (isDoneOrFinalising || sseEvents.length > 0) return () => {}
    if (phaseIndex >= PHASES.length - 1) return () => {}
    const t = setTimeout(() => {
      setPhaseIndex((i) => Math.min(i + 1, PHASES.length - 1))
    }, PHASE_IDLE_ADVANCE_MS)
    return () => clearTimeout(t)
  }, [phaseIndex, isDoneOrFinalising, sseEvents.length])

  // Drive phase from real pipeline_log / tool milestones (falls back to generationLog)
  useEffect(() => {
    if (isDoneOrFinalising) return
    const signal = [...sseEvents.map((e) => e.text), generationLog]
      .join('\n')
      .toLowerCase()
    if (!signal.trim()) return
    if (
      (signal.includes('writing profit') ||
        signal.includes('rendering financial') ||
        signal.includes('executive summary')) &&
      phaseIndex < 2
    ) {
      setPhaseIndex(2)
    } else if (
      (signal.includes('roi model') ||
        signal.includes('financial projection') ||
        signal.includes('model assumption') ||
        signal.includes('calibrating roi')) &&
      phaseIndex < 1
    ) {
      setPhaseIndex(1)
    }
  }, [generationLog, sseEvents, phaseIndex, isDoneOrFinalising])

  // Process new pipeline_log events — parallel tool calls burst in the same second
  useEffect(() => {
    if (!sseEvents.length || isDoneOrFinalising) return

    const pending = sseEvents.slice(lastProcessedSseIndex.current)
    if (!pending.length) return
    lastProcessedSseIndex.current = sseEvents.length

    setLogs((prev) => {
      const seen = new Set(prev.map((entry) => entry.text))
      let next = prev
      let lastAppendAt = lastLogAppendAt.current
      const now = Date.now()

      pending.forEach((event) => {
        const kind = classifyPipelineLog(event.text)
        let displayText = event.text

        if (kind === 'search-pool') {
          if (seen.has(RESEARCH_ACTIVITY_SUMMARY)) return
          displayText = RESEARCH_ACTIVITY_SUMMARY
        } else if (seen.has(displayText)) {
          return
        }

        // Milestones always pass; non-milestones get spaced by MIN_LOG_GAP_MS
        // even within the same batch so parallel bursts don't drop messages.
        if (kind !== 'milestone') {
          const earliestAllowed = lastAppendAt + MIN_LOG_GAP_MS
          if (now < earliestAllowed && lastAppendAt !== 0) return
          lastAppendAt = Math.max(now, lastAppendAt + MIN_LOG_GAP_MS)
        } else {
          lastAppendAt = now
        }

        logId.current += 1
        next = [
          ...next,
          {
            id: logId.current,
            phase: activePhase.id,
            text: displayText,
            time: nowLabel(),
          },
        ].slice(-MAX_LOG_LINES)
        seen.add(displayText)
      })

      lastLogAppendAt.current = lastAppendAt
      return next
    })
  }, [sseEvents, activePhase, isDoneOrFinalising])

  // Elapsed timer
  useEffect(() => {
    const start = Date.now()
    const t = setInterval(
      () => setElapsed(Math.floor((Date.now() - start) / 1000)),
      1000,
    )
    return () => clearInterval(t)
  }, [])

  // Idle placeholder — one line until real pipeline_log arrives; no cycling
  useEffect(() => {
    if (isDoneOrFinalising) {
      logId.current += 1
      setLogs((prev) => {
        if (prev.length > 0 && prev[prev.length - 1].phase === 'finalising') {
          return prev
        }
        return [
          ...prev,
          {
            id: logId.current,
            phase: 'finalising',
            text: '✓ Profit Map assembled successfully',
            time: nowLabel(),
          },
        ].slice(-MAX_LOG_LINES)
      })
      return () => {}
    }

    if (sseEvents.length > 0) return () => {}

    const rawSeed = activePhase.logs[0]
    if (!rawSeed) return () => {}
    const seed =
      classifyPipelineLog(rawSeed) === 'search-pool'
        ? RESEARCH_ACTIVITY_SUMMARY
        : rawSeed

    setLogs((prev) => {
      if (prev.some((entry) => entry.text === seed)) return prev
      logId.current += 1
      return [
        ...prev,
        {
          id: logId.current,
          phase: activePhase.id,
          text: seed,
          time: nowLabel(),
        },
      ].slice(-MAX_LOG_LINES)
    })
    return undefined
  }, [activePhase, isDoneOrFinalising, sseEvents.length])

  const timeLabel = useMemo(() => {
    const m = String(Math.floor(elapsed / 60)).padStart(2, '0')
    const s = String(elapsed % 60).padStart(2, '0')
    return `${m}:${s}`
  }, [elapsed])

  const startedAt = useMemo(() => {
    return startTime.current.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }, [])

  // When finalising or complete, all pipeline stages show as complete
  const pipelinePhaseIndex = isDoneOrFinalising ? PHASES.length : phaseIndex

  const { displayHeading, displaySubLabel } = useMemo(() => {
    if (isComplete)
      return {
        displayHeading: 'Your Profit Map is ready.',
        displaySubLabel: 'Opening your Profit Map…',
      }
    if (isFinalising)
      return {
        displayHeading: 'Finalising your Profit Map',
        displaySubLabel: 'Preparing deliverable',
      }
    return {
      displayHeading: activePhase.heading,
      displaySubLabel: activePhase.subLabel,
    }
  }, [isComplete, isFinalising, activePhase])

  return (
    <div className="relative min-h-screen w-full bg-gray-50">
      {/* Progress bar */}
      <div className="fixed inset-x-0 top-0 z-20 h-[2px] overflow-hidden bg-gray-100">
        <div className="indeterminate-line absolute inset-y-0 w-1/3 bg-primary" />
      </div>

      {/* App header */}
      <header className="border-b border-gray-100 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2.5">
            <div className="font-display grid h-6 w-6 place-items-center rounded-md bg-navy text-white">
              <span className="text-[11px] font-bold leading-none">L</span>
            </div>
            <span className="font-display text-[13px] font-semibold tracking-tight text-navy">
              LyRise
            </span>
            <span className="ml-1 text-gray-300">/</span>
            <span className="font-poppins text-[12.5px] font-normal text-gray-500">
              Profit Map
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              {isDoneOrFinalising ? (
                // Settled indicator — no pulse when finalising/complete
                <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
              ) : (
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-50" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                </span>
              )}
              <span className="font-poppins text-[11.5px] font-medium text-gray-500">
                {isComplete
                  ? 'Ready'
                  : isFinalising
                    ? 'Finalising'
                    : 'Interpreting'}
              </span>
            </div>
            <span className="text-gray-200">|</span>
            <span className="font-mono text-[10.5px] tabular-nums text-gray-400">
              {jobRef.current}
            </span>
            <span className="text-gray-200">|</span>
            <span className="font-mono text-[11px] tabular-nums text-gray-400">
              {timeLabel}
            </span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto max-w-5xl px-6 py-6"
      >
        {/* Pipeline — all stages complete when finalising */}
        <PhasePipeline phaseIndex={pipelinePhaseIndex} />

        {/* Content cluster — micro-inset from pipeline edge */}
        <div className="pl-1.5">
          {/* Heading row */}
          <div className="mt-3 flex items-baseline justify-between">
            <div className="relative h-[22px] flex-1">
              <AnimatePresence mode="wait">
                <motion.h1
                  key={displayHeading}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="font-display absolute inset-x-0 text-[17px] font-medium leading-tight tracking-tight text-navy"
                >
                  {displayHeading}
                </motion.h1>
              </AnimatePresence>
            </div>
            <div className="flex shrink-0 items-center gap-3 pl-6">
              <span className="font-mono text-[10.5px] tabular-nums text-gray-400">
                Started {startedAt}
              </span>
              <span className="text-gray-200">·</span>
              <span className="font-mono text-[10.5px] tabular-nums text-gray-400">
                {timeLabel} elapsed
              </span>
            </div>
          </div>

          {/* Sub-label */}
          <AnimatePresence mode="wait">
            <motion.p
              key={displaySubLabel}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="font-poppins mt-1 text-[12px] text-gray-400"
            >
              {displaySubLabel}
            </motion.p>
          </AnimatePresence>

          {/* Activity panel */}
          <div className="mt-6">
            <ActivityLog
              logs={logs}
              phaseIndex={phaseIndex}
              elapsed={elapsed}
              isFinalising={isDoneOrFinalising}
            />
          </div>

          {/* Intake-ease question — alpha-only, during the active wait */}
          {isAlpha && !isDoneOrFinalising && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="mt-5 rounded-lg border border-gray-100 bg-white px-4 py-3.5"
            >
              <p
                style={{
                  fontFamily: INTER_FONT_FAMILY,
                  letterSpacing: '-0.2px',
                }}
                className="text-[14.5px] font-normal text-navy"
              >
                While we build this, how easy was it to tell us about your
                company?
              </p>
              <div className="mt-2">
                <NumberScale
                  value={intakeEase}
                  onChange={rateIntakeEase}
                  lowLabel="Very hard"
                  highLabel="Very easy"
                />
              </div>
              {intakeEase > 0 && intakeEase <= 3 && (
                <textarea
                  value={intakeEaseNote}
                  onChange={(e) => setIntakeEaseNote(e.target.value)}
                  onBlur={() => trackIntakeEase(intakeEase, intakeEaseNote)}
                  placeholder="What was awkward or missing? (optional)"
                  rows={2}
                  style={{ fontFamily: INTER_FONT_FAMILY }}
                  className="mt-2 w-full resize-none rounded-md border border-gray-200 px-2.5 py-2 text-[11.5px] text-navy outline-none focus:border-[#5B48F8]"
                />
              )}
            </motion.div>
          )}

          {/* Open Profit Map CTA — shown when complete and a handler is provided */}
          {isComplete && onOpen && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="mt-5 flex flex-col items-stretch gap-2"
            >
              <button
                type="button"
                onClick={onOpen}
                className="w-full rounded-lg py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: '#5B48F8' }}
              >
                Open my Profit Map →
              </button>
            </motion.div>
          )}

          {/* Footer note */}
          <p className="font-poppins mt-1.5 text-[10px] text-gray-400 opacity-50">
            Your data is encrypted in transit and at rest.
          </p>
        </div>
      </motion.div>
    </div>
  )
}

function PhasePipeline({ phaseIndex }) {
  return (
    <nav aria-label="Report pipeline">
      <ol className="flex w-full items-center">
        {PHASES.map((p, i) => {
          const state =
            i < phaseIndex ? 'done' : i === phaseIndex ? 'active' : 'todo'
          return (
            <li key={p.id} className="flex flex-1 items-center">
              <div className="flex items-center gap-2">
                <PhaseDot state={state} />
                <span
                  className={
                    'font-display text-[11.5px] font-medium tracking-tight ' +
                    (state === 'done'
                      ? 'text-gray-400'
                      : state === 'active'
                        ? 'text-navy'
                        : 'text-gray-300')
                  }
                >
                  {p.label}
                </span>
              </div>
              {i < PHASES.length - 1 && (
                <div className="relative mx-3 h-px flex-1 overflow-hidden bg-gray-200">
                  <motion.div
                    className="absolute inset-y-0 left-0 bg-gray-400"
                    initial={false}
                    animate={{ width: i < phaseIndex ? '100%' : '0%' }}
                    transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function PhaseDot({ state }) {
  if (state === 'done') {
    return (
      <div className="grid h-[14px] w-[14px] place-items-center rounded-full bg-navy">
        <svg
          className="h-[7px] w-[7px] text-white"
          viewBox="0 0 12 12"
          fill="none"
        >
          <path
            d="M2.5 6.2L5 8.5L9.5 3.8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    )
  }
  if (state === 'active') {
    return (
      <div className="grid h-[14px] w-[14px] place-items-center rounded-full border border-gray-200 bg-white">
        <span className="relative flex h-[6px] w-[6px]">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-40" />
          <span className="relative inline-flex h-[6px] w-[6px] rounded-full bg-primary" />
        </span>
      </div>
    )
  }
  return (
    <div className="h-[14px] w-[14px] rounded-full border border-gray-200 bg-white" />
  )
}

function ActivityLog({ logs, phaseIndex, elapsed, isFinalising }) {
  const phaseActivityLabels = [
    'Signal Mapping',
    'Financial Modelling',
    'Profit Map Assembly',
  ]
  // eslint-disable-next-line security/detect-object-injection
  const activePhaseLabel = phaseActivityLabels[phaseIndex]
  const logContainerRef = useRef(null)

  useLayoutEffect(() => {
    const el = logContainerRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [logs])

  return (
    <div className="overflow-hidden rounded-lg border border-terminal-border/80 bg-terminal-bg shadow">
      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-terminal-border/50 px-4 py-2">
        <div className="flex items-center gap-2.5">
          <span
            className={
              'h-[6px] w-[6px] rounded-full ' +
              (isFinalising ? 'bg-gray-500' : 'bg-primary opacity-75')
            }
          />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-terminal-fg opacity-55">
            Pipeline Activity
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-terminal-muted">
            {isFinalising
              ? 'Finalised'
              : `Phase ${phaseIndex + 1}/${
                  PHASES.length
                } — ${activePhaseLabel}`}
          </span>
          <span className="rounded border border-terminal-border/70 px-1.5 py-[1px] font-mono text-[9.5px] tabular-nums text-terminal-muted">
            {String(Math.floor(elapsed / 60)).padStart(2, '0')}:
            {String(elapsed % 60).padStart(2, '0')}
          </span>
        </div>
      </div>

      {/* Log list */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-8 bg-gradient-to-b from-terminal-bg to-transparent" />
        <ul
          ref={logContainerRef}
          className="without-h-scrollbar h-[280px] overflow-y-auto px-4 py-3"
        >
          <AnimatePresence initial={false}>
            {logs.map((log, i) => {
              const age = logs.length - 1 - i
              const opacity =
                age === 0 ? 1 : age === 1 ? 0.82 : age <= 4 ? 0.48 : 0.2
              return (
                <motion.li
                  key={log.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="flex items-baseline gap-3 py-[2.5px] font-mono text-[11px] leading-[1.6] text-terminal-fg"
                >
                  <span className="shrink-0 tabular-nums text-terminal-muted">
                    {log.time}
                  </span>
                  <span className="truncate">{log.text}</span>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
      </div>

      {/* Panel footer */}
      <div className="flex items-center justify-between border-t border-terminal-border/40 px-4 py-1.5">
        <span className="font-mono text-[9.5px] text-terminal-muted opacity-60">
          ROI analysis pipeline · encrypted
        </span>
        <div className="flex items-center gap-1.5">
          <span
            className={
              'h-1 w-1 rounded-full ' +
              (isFinalising
                ? 'bg-gray-500 opacity-40'
                : 'bg-primary opacity-60')
            }
          />
          <span className="font-mono text-[9.5px] text-terminal-muted opacity-60">
            {isFinalising ? 'done' : 'live'}
          </span>
        </div>
      </div>
    </div>
  )
}
