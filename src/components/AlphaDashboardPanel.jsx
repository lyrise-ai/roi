import { useState, useEffect, useCallback } from 'react'

// ── Design tokens ────────────────────────────────────────────────────────
// Layout/card language and the status palette (green/amber/red/gray) follow
// the imported Claude Design mockup ("LyRise Readiness Dashboard") as-is.
// Type and purple come from styles/tokens instead: this panel used to pull
// IBM Plex off Google Fonts (a third typeface, loaded per-page) and hardcode
// the pre-rebrand purple #5B48F8.
const SANS = 'var(--font-sans)'
const MONO = 'var(--font-mono)'

const PURPLE = 'var(--lyrise-purple)'
const PURPLE_TINT = 'var(--purple-50)'
const PURPLE_TINT_STRONG = 'var(--purple-100)'

const GREEN = '#18936a'
const GREEN_TEXT = '#137a52'
const GREEN_BG = '#e7f6ee'
const AMBER = '#e0a020'
const AMBER_TEXT = '#8a6d1e'
const AMBER_BG = '#fdf3d6'
const RED = '#d94040'
const RED_TEXT = '#b02a2a'
const RED_BG = '#fdecec'
const GRAY_DOT = '#c4c8cf'
const GRAY_TEXT = '#8a909c'
const GRAY_BG = '#f0f1f4'
const INK = '#171a21'
const BODY_TEXT = '#4b515e'
const BORDER = '#e6e8ec'
const PAGE_BG = '#f4f5f7'

const CARD_SHADOW = '0 1px 2px rgba(16,24,40,.04)'

const FUNNEL_ORDER = [
  'reached_intake',
  'reached_generation',
  'reached_validation',
  'reached_report',
  'reached_survey',
]

const OPEN_TEXT_TITLES = {
  intake_ease_note: 'Why intake felt easy or hard',
  validation_note: 'Validation wizard comments',
  unclear_note: 'What made the report unclear',
  pmf_main_benefit: 'What testers valued most',
  pmf_improvement: 'What testers want improved',
  not_disappointed_reason: 'What would make it more valuable',
}

const WHAT_TO_FIX_SOURCE_LABELS = {
  unclear_reason: 'Report clarity',
  funnel: 'Funnel drop-off',
  integrity: 'Data integrity',
  open_text: 'Open feedback',
  model_accuracy: 'Model accuracy',
  trust_delta: 'Trust delta',
  experience: 'Tester experience',
  pmf: 'Product–market fit',
}

const fmtDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// Every number on this page comes wrapped as { value, unit, label, explains,
// formula, sample, caveat, confidence, healthy } from GET /api/alpha/dashboard.
// This is the only place that turns `unit` into a display string — nothing
// else on this page re-derives what a number means.
function formatMetricValue(metric, { signed = false } = {}) {
  if (!metric || metric.value == null) return '—'
  const { value, unit } = metric
  const sign = signed && value > 0 ? '+' : ''
  if (unit === 'percent') return `${sign}${value}%`
  if (unit === 'scale_1_5') return `${sign}${value} / 5`
  return `${sign}${value}`
}

// Confidence is intentionally never re-derived from thresholds here — the
// route already computed it from `sample`. This only maps the route's three
// tiers ('reliable'|'building'|'low') to a color, and separately notices
// sample === 0 to say "No data" instead of "Low signal" — a wording choice
// only, not a new tier (a metric with 0 respondents is still 'low' per the
// route; this just reads more honestly than "Low signal" for a true zero).
function confidenceMeta(metric) {
  const sample = metric?.sample ?? 0
  if (sample === 0) {
    return { label: 'No data', dot: GRAY_DOT, fg: GRAY_TEXT, bg: GRAY_BG }
  }
  if (metric?.confidence === 'reliable') {
    return { label: 'Reliable', dot: GREEN, fg: GREEN_TEXT, bg: GREEN_BG }
  }
  if (metric?.confidence === 'building') {
    return { label: 'Building', dot: AMBER, fg: AMBER_TEXT, bg: AMBER_BG }
  }
  return { label: 'Low signal', dot: GRAY_DOT, fg: GRAY_TEXT, bg: GRAY_BG }
}

// Full pill — dot + label + sample — for headline, card-level numbers.
function ConfidenceChip({ metric }) {
  const c = confidenceMeta(metric)
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap"
      style={{ background: c.bg, color: c.fg }}
    >
      <span
        className="h-[7px] w-[7px] rounded-full"
        style={{ background: c.dot }}
      />
      {c.label} · n={metric?.sample ?? 0}
    </span>
  )
}

// Compact dot + sample only, for numbers inside dense lists/grids where a
// full pill on every row would be more noise than signal. Every number still
// gets confidence + sample this way — no exceptions, just two visual weights
// for headline vs. supporting numbers (the design itself does the same:
// full chips on hero cards, a bare dot + "n=" in the tight model-accuracy
// grid).
function ConfidenceDot({ metric }) {
  const c = confidenceMeta(metric)
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 text-[11px]"
      style={{ color: GRAY_TEXT }}
    >
      <span
        className="h-[6px] w-[6px] rounded-full"
        style={{ background: c.dot }}
      />
      n={metric?.sample ?? 0}
    </span>
  )
}

// Carries a metric's explains/formula/caveat behind a hover popover. This is
// the one place any of those three fields are allowed to render — call sites
// stopped printing them inline; see MetricStat, GateCard, and the ReadinessTab
// PMF card, which used to duplicate this text as always-visible prose.
// `metric` doesn't have to be a full route metric — a plain `{ explains }`
// shape works too, e.g. GateCard's hint text.
function InfoIcon({ metric }) {
  if (!metric?.explains && !metric?.formula && !metric?.caveat) return null
  return (
    <span className="group/tip relative ml-1.5 inline-flex cursor-help items-center">
      <span className="text-xs select-none" style={{ color: GRAY_TEXT }}>
        ⓘ
      </span>
      <span
        className="pointer-events-none absolute left-0 top-full z-50 mt-1 w-72 rounded-lg p-3 text-xs font-normal normal-case tracking-normal leading-relaxed opacity-0 shadow-lg transition-opacity duration-150 group-hover/tip:opacity-100"
        style={{
          background: '#fff',
          border: `1px solid ${BORDER}`,
          color: BODY_TEXT,
        }}
      >
        {metric.explains && (
          <span className="mb-2 block last:mb-0">{metric.explains}</span>
        )}
        {metric.formula && (
          <span
            className="mb-2 block rounded px-1.5 py-1 text-[10px] last:mb-0"
            style={{ background: GRAY_BG, color: GRAY_TEXT, fontFamily: MONO }}
          >
            {metric.formula}
          </span>
        )}
        {metric.caveat && (
          <span
            className="block font-medium last:mb-0"
            style={{ color: AMBER_TEXT }}
          >
            {metric.caveat}
          </span>
        )}
      </span>
    </span>
  )
}

function MetricLabel({ metric, className = '' }) {
  return (
    <span
      className={`inline-flex items-center text-[11px] font-bold uppercase tracking-wider ${className}`}
      style={{ color: GRAY_TEXT }}
    >
      {metric.label}
      <InfoIcon metric={metric} />
    </span>
  )
}

// The one building block for a metric readout, used everywhere on this page:
// label (+ info icon revealing explains/formula/caveat), a confidence chip or
// dot carrying sample size, the value itself, and the `healthy` caption. This
// is what makes "every number gets its confidence chip and sample size, no
// exceptions" true by construction rather than by remembering to add it at
// each call site.
function MetricStat({
  metric,
  valueClassName = 'text-3xl font-bold',
  signed = false,
  chip = 'chip',
}) {
  if (!metric) return null
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <MetricLabel metric={metric} />
        {chip === 'chip' ? (
          <ConfidenceChip metric={metric} />
        ) : (
          <ConfidenceDot metric={metric} />
        )}
      </div>
      <div className={valueClassName} style={{ fontFamily: MONO, color: INK }}>
        {formatMetricValue(metric, { signed })}
      </div>
      {metric.healthy && (
        <p
          className="mt-1.5 text-xs leading-relaxed"
          style={{ color: GRAY_TEXT }}
        >
          {metric.healthy}
        </p>
      )}
    </div>
  )
}

function Card({ children, className = '', style }) {
  return (
    <div
      className={`bg-white p-5 ${className}`}
      style={{
        border: `1px solid ${BORDER}`,
        borderRadius: 14,
        boxShadow: CARD_SHADOW,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

function EmptyNote({ text }) {
  return (
    <p className="py-6 text-center text-sm" style={{ color: '#c0c4cc' }}>
      {text}
    </p>
  )
}

function QuoteRow({ quote }) {
  const initial = (quote.text || '').trim().charAt(0).toUpperCase() || '·'
  return (
    <div
      className="flex gap-2.5 rounded-lg p-2.5"
      style={{ background: '#f7f8fa' }}
    >
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
        style={{ background: PURPLE_TINT_STRONG, color: PURPLE }}
      >
        {initial}
      </span>
      <div>
        <p className="text-sm leading-snug" style={{ color: INK }}>
          {quote.text}
        </p>
        <p
          className="mt-0.5 text-[11px]"
          style={{ color: '#a0a5af', fontFamily: MONO }}
        >
          {quote.email ?? '—'}
        </p>
      </div>
    </div>
  )
}

function GateCard({ gate }) {
  const tone = gate.pass
    ? { fg: GREEN_TEXT, bg: GREEN_BG, border: GREEN }
    : { fg: AMBER_TEXT, bg: AMBER_BG, border: AMBER }
  return (
    <Card style={{ borderLeft: `3px solid ${tone.border}` }}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span
          className="inline-flex items-center text-[11px] font-bold uppercase tracking-wider"
          style={{ color: GRAY_TEXT }}
        >
          {gate.name}
          {gate.hint && <InfoIcon metric={{ explains: gate.hint }} />}
        </span>
        <span
          className="rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap"
          style={{ color: tone.fg, background: tone.bg }}
        >
          {gate.pass ? 'Pass' : 'Open'}
        </span>
      </div>
      <div
        className="min-h-[40px] text-sm font-semibold leading-relaxed"
        style={{ color: INK }}
      >
        {gate.detail}
      </div>
    </Card>
  )
}

function VerdictRing({ passed, total, color }) {
  const r = 50
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - (total > 0 ? passed / total : 0))
  return (
    <div className="relative shrink-0" style={{ width: 118, height: 118 }}>
      <svg width={118} height={118}>
        <circle
          cx={59}
          cy={59}
          r={r}
          fill="none"
          stroke="#fff"
          strokeWidth={11}
          opacity={0.5}
        />
        <circle
          cx={59}
          cy={59}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={11}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform="rotate(-90 59 59)"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-2xl font-bold" style={{ fontFamily: MONO, color }}>
          {passed}/{total}
        </div>
        <div
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: GRAY_TEXT }}
        >
          gates
        </div>
      </div>
    </div>
  )
}

function LinearButton({ item }) {
  if (item.linear_url) {
    return (
      <a
        href={item.linear_url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold"
        style={{ background: PURPLE, color: '#fff' }}
      >
        Create Linear issue →
      </a>
    )
  }
  return (
    <div className="mt-3">
      <button
        type="button"
        disabled
        className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold"
        style={{ background: GRAY_BG, color: GRAY_TEXT }}
      >
        Create Linear issue →
      </button>
      <p className="mt-1 text-[11px]" style={{ color: GRAY_TEXT }}>
        Disabled: LINEAR_NEW_ISSUE_URL isn't configured on the server.
      </p>
    </div>
  )
}

function WhatToFixCard({ item, rank }) {
  const hero = rank === 1
  return (
    <div
      className={hero ? 'rounded-2xl p-6' : 'rounded-2xl p-5'}
      style={
        hero
          ? {
              background: `linear-gradient(180deg, ${PURPLE_TINT}, #fff)`,
              border: '1px solid #dcdcf5',
            }
          : {
              background: '#fff',
              border: `1px solid ${BORDER}`,
              boxShadow: CARD_SHADOW,
            }
      }
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className="rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider"
          style={{
            background: hero ? PURPLE_TINT_STRONG : GRAY_BG,
            color: hero ? PURPLE : GRAY_TEXT,
          }}
        >
          {hero ? 'Top priority' : `#${rank}`}
        </span>
        <span className="text-[11px]" style={{ color: GRAY_TEXT }}>
          {WHAT_TO_FIX_SOURCE_LABELS[item.source] ?? item.source}
        </span>
        {item.confidence === 'low' && (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-semibold"
            style={{ color: GRAY_TEXT }}
          >
            <span
              className="h-[6px] w-[6px] rounded-full"
              style={{ background: GRAY_DOT }}
            />
            Low confidence
          </span>
        )}
      </div>
      <h3
        className={hero ? 'text-xl font-bold' : 'text-base font-bold'}
        style={{ color: INK }}
      >
        {item.title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: BODY_TEXT }}>
        {item.evidence}
      </p>
      <div
        className="mt-2 flex items-center gap-2 text-xs"
        style={{ color: GRAY_TEXT }}
      >
        <span>
          {item.tester_count} tester{item.tester_count === 1 ? '' : 's'}
        </span>
        {item.share_pct != null && <span>· {item.share_pct}%</span>}
      </div>
      {item.quotes.length > 0 && (
        <div className="mt-3 space-y-2">
          {item.quotes.map((q, i) => (
            <QuoteRow key={i} quote={q} />
          ))}
        </div>
      )}
      <LinearButton item={item} />
    </div>
  )
}

export default function AlphaDashboardPanel() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [lastFetched, setLastFetched] = useState(null)
  const [activeTab, setActiveTab] = useState('readiness')
  const [howToReadOpen, setHowToReadOpen] = useState(false)

  const fetchData = useCallback(async () => {
    setData(null)
    setError(null)
    try {
      const res = await fetch('/api/alpha/dashboard')
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(json?.error || `Request failed (${res.status})`)
      }
      setData(json)
      setLastFetched(new Date())
    } catch (err) {
      setError(err.message || 'Could not load dashboard data.')
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (data === null && !error) {
    return (
      <div style={{ fontFamily: SANS }}>
        <div className="flex items-center justify-center py-24">
          <p className="animate-pulse text-sm" style={{ color: GRAY_TEXT }}>
            Loading dashboard…
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ fontFamily: SANS }}>
        <div className="flex flex-col items-center justify-center gap-4 py-24">
          <p className="text-sm" style={{ color: BODY_TEXT }}>
            {error}
          </p>
          <button
            type="button"
            onClick={fetchData}
            className="text-sm font-semibold hover:underline"
            style={{ color: PURPLE }}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const {
    testers,
    funnel,
    model_accuracy,
    trust,
    experience,
    pmf,
    intent,
    recruiting_target,
    open_text,
    what_to_fix,
  } = data

  // ── Launch readiness gates ────────────────────────────────────────────
  // Computed only from booleans/values the route already gave us — never
  // re-derived from raw rows here. PMF's value is always present now (the
  // route stopped withholding it), so the gate check is a plain threshold
  // comparison rather than a "ready" flag that no longer exists.
  const completedSurveys = recruiting_target.gap_a.sample
  const sampleGatePass = recruiting_target.gap_a.value === 0
  const pmfValue = pmf.segmented_pmf.value
  const pmfGatePass = sampleGatePass && pmfValue != null && pmfValue >= 40
  const saturationGatePass = recruiting_target.gap_b.value === 0
  const funnelGatePass = !funnel.integrity_warning

  const pmfDetail =
    pmfValue == null
      ? 'No PMF answers yet'
      : !sampleGatePass
        ? `${pmfValue}% so far — needs ${recruiting_target.gap_a.value} more surveys to be trustworthy`
        : pmfValue >= 40
          ? `${pmfValue}% "very disappointed" — above the 40% bar`
          : `${pmfValue}% "very disappointed" — below the 40% bar`

  const gates = [
    {
      key: 'sample',
      name: 'Sample size',
      pass: sampleGatePass,
      detail: `${completedSurveys} of 20 completed surveys`,
      hint: recruiting_target.gap_a.explains,
      blocker: `Recruit ${recruiting_target.gap_a.value} more completed survey${recruiting_target.gap_a.value === 1 ? '' : 's'} — sample size is the binding gate. Nothing else can be judged until then.`,
    },
    {
      key: 'pmf',
      name: 'Product–market fit',
      pass: pmfGatePass,
      detail: pmfDetail,
      hint: pmf.segmented_pmf.explains,
      blocker: !sampleGatePass
        ? `PMF is only a rough read right now (${pmfValue ?? 0}%, n=${completedSurveys}) — get to a reliable sample before acting on it.`
        : `PMF is at ${pmfValue}%, below the 40% bar — dig into why before launch.`,
    },
    {
      key: 'saturation',
      name: 'Theme saturation',
      pass: saturationGatePass,
      detail: saturationGatePass
        ? 'No new themes from the last 3 testers'
        : 'Still hearing new things from recent testers',
      hint: recruiting_target.gap_b.explains,
      blocker:
        'Keep recruiting — recent testers are still surfacing feedback we have not seen before.',
    },
    {
      key: 'funnel',
      name: 'Funnel health',
      pass: funnelGatePass,
      detail: funnelGatePass
        ? 'Funnel counts check out'
        : 'Funnel counts are inconsistent',
      hint: funnel.integrity_warning,
      // Never the raw integrity_warning paragraph here — that full
      // explanation already lives in the integrity banner and in this
      // gate's own info-icon tooltip (via `hint` above). The "Next:" line
      // is one short sentence, always; it points at the banner rather than
      // repeating it.
      blocker:
        'Funnel data is inconsistent — a write is failing. See the banner.',
    },
  ]
  const passedCount = gates.filter((g) => g.pass).length
  const totalGates = gates.length
  const overallTone =
    passedCount === totalGates ? 'green' : passedCount === 0 ? 'red' : 'amber'
  const toneColor = { green: GREEN, amber: AMBER, red: RED }[overallTone]
  const toneHeroBg = { green: '#eef8f2', amber: '#fdf8ea', red: '#fdf1f0' }[
    overallTone
  ]
  const verdictStatus =
    overallTone === 'green'
      ? 'Ready to launch'
      : overallTone === 'red'
        ? 'Not ready to launch'
        : 'Almost ready'

  const openGates = gates.filter((g) => !g.pass)
  const funnelGate = gates.find((g) => g.key === 'funnel')

  // what_to_fix arrives from the route already ranked by severity
  // (integrity > model accuracy > trust delta > funnel > clarity/ease >
  // PMF — see pages/api/alpha/dashboard.js). A model-accuracy or
  // trust-delta problem outranks the softer sample/PMF/saturation gates in
  // that same ordering, so it can preempt them here too: a badly-degraded
  // model or a trust-destroying validation step shouldn't be buried under
  // "recruit more testers" just because the hard gates happen to pass.
  // Funnel integrity still wins over everything — if the data is lying,
  // nothing else can be judged until that's fixed.
  const topFix = what_to_fix[0]
  const canPreempt =
    topFix &&
    (topFix.source === 'model_accuracy' || topFix.source === 'trust_delta')

  const blockerPriority = ['sample', 'pmf', 'saturation']
  const blocker = !funnelGate.pass
    ? funnelGate.blocker
    : canPreempt
      ? topFix.title
      : openGates.length === 0
        ? 'All four gates are closed — clear to launch.'
        : (
            blockerPriority
              .map((key) => openGates.find((g) => g.key === key))
              .find(Boolean) ?? openGates[0]
          ).blocker

  const TABS = [
    { key: 'readiness', label: 'Readiness' },
    { key: 'fix', label: 'What to fix' },
    { key: 'progress', label: 'Test progress' },
  ]

  return (
    <div
      style={{
        background: PAGE_BG,
        borderRadius: 16,
        padding: '20px 20px 40px',
        fontFamily: SANS,
      }}
    >
      {/* Control bar — no "Real data / Demo" toggle: that's a prototype
          affordance backed by hand-written mock data, and a real dashboard
          must never have a fake-data mode. */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1
              className="text-[19px] font-bold"
              style={{ color: INK, letterSpacing: '-0.01em' }}
            >
              LyRise · Alpha Readiness
            </h1>
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{
                color: AMBER_TEXT,
                background: AMBER_BG,
                border: '1px solid #f2e2a8',
              }}
            >
              🔒 Internal only
            </span>
            <a
              href="/alpha-dashboard-guide.html"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open the dashboard guide"
              title="Dashboard guide"
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold"
              style={{ color: GRAY_TEXT, border: `1px solid ${BORDER}` }}
            >
              ?
            </a>
          </div>
          <div
            className="mt-1 text-xs"
            style={{ color: GRAY_TEXT, fontFamily: MONO }}
          >
            {lastFetched
              ? `Updated ${lastFetched.toLocaleTimeString()} · `
              : ''}
            {completedSurveys} completed survey
            {completedSurveys === 1 ? '' : 's'}
          </div>
        </div>
        <button
          type="button"
          onClick={fetchData}
          className="rounded-lg px-3.5 py-2 text-sm font-semibold"
          style={{
            color: PURPLE,
            background: '#fff',
            border: '1px solid #dcdcf5',
          }}
        >
          Refresh ↻
        </button>
      </div>

      {/* Lead verdict */}
      <Card
        className="mb-5"
        style={{ background: toneHeroBg, borderRadius: 16, padding: 26 }}
      >
        <div className="flex flex-wrap items-center gap-7">
          <VerdictRing
            passed={passedCount}
            total={totalGates}
            color={toneColor}
          />
          <div className="min-w-[240px] flex-1">
            <div
              className="mb-1.5 text-xs font-semibold uppercase tracking-wider"
              style={{ color: toneColor }}
            >
              Launch verdict
            </div>
            <h2
              className="text-[28px] font-bold leading-tight"
              style={{ color: INK, letterSpacing: '-0.02em' }}
            >
              {verdictStatus}
            </h2>
            <p
              className="mt-2.5 max-w-xl text-[15px] leading-relaxed"
              style={{ color: BODY_TEXT }}
            >
              <strong style={{ color: INK }}>Next:</strong> {blocker}
            </p>
          </div>
          <div className="flex max-w-sm flex-wrap gap-2.5">
            {gates.map((g) => (
              <div
                key={g.key}
                className="flex min-w-[150px] items-center gap-2 rounded-lg bg-white px-3 py-2.5"
                style={{ border: `1px solid ${BORDER}` }}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: g.pass ? GREEN : AMBER }}
                />
                <div>
                  <div className="text-xs font-semibold" style={{ color: INK }}>
                    {g.name}
                  </div>
                  <div
                    className="text-[11px] font-semibold"
                    style={{ color: g.pass ? GREEN_TEXT : AMBER_TEXT }}
                  >
                    {g.pass ? 'Pass' : 'Open'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Integrity warning — shown prominently, never softened */}
      {funnel.integrity_warning && (
        <div
          className="mb-5 flex gap-3 rounded-2xl p-4"
          style={{ background: RED_BG, border: '1px solid #f5c6c6' }}
        >
          <span className="text-base leading-tight">⚠️</span>
          <div>
            <p className="text-sm font-bold" style={{ color: RED_TEXT }}>
              This dashboard's funnel data is inconsistent — treat funnel counts
              as unreliable
            </p>
            <p
              className="mt-1 max-w-3xl text-xs leading-relaxed"
              style={{ color: '#a05252' }}
            >
              {funnel.integrity_warning}
            </p>
          </div>
        </div>
      )}

      {/* Tabs + confidence legend */}
      <div
        className="mb-5 flex flex-wrap items-center justify-between gap-3"
        style={{ borderBottom: `1px solid ${BORDER}` }}
      >
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className="mr-5 bg-transparent px-1 py-2.5 text-sm font-semibold"
              style={{
                borderBottom: `2px solid ${activeTab === t.key ? PURPLE : 'transparent'}`,
                color: activeTab === t.key ? INK : GRAY_TEXT,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div
          className="flex items-center gap-3.5 pb-2 text-[11px]"
          style={{ color: GRAY_TEXT }}
        >
          <span className="font-semibold uppercase tracking-wider">
            Confidence:
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: GREEN }}
            />
            Reliable n≥20
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: AMBER }}
            />
            Building
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: GRAY_DOT }}
            />
            Low n&lt;5
          </span>
        </div>
      </div>

      {/* How to read — collapsed by default, this is orientation copy, not
          a number, and the page should read as numbers first. */}
      <div className="mb-5">
        <button
          type="button"
          onClick={() => setHowToReadOpen((v) => !v)}
          className="inline-flex items-center gap-1 text-xs font-semibold"
          style={{ color: PURPLE }}
        >
          How to read this dashboard {howToReadOpen ? '▴' : '▾'}
        </button>
        {howToReadOpen && (
          <div
            className="mt-2.5 flex flex-wrap gap-4 rounded-xl p-4"
            style={{ background: PURPLE_TINT, border: '1px solid #e2e2f7' }}
          >
            {[
              [
                '1',
                'Readiness',
                'is the product ready to launch? Four gates must all pass.',
              ],
              [
                '2',
                'What to fix',
                'the highest-impact problems, ranked, with tester quotes.',
              ],
              [
                '3',
                'Test progress',
                'how the alpha is running: drop-off, recruiting, model behavior.',
              ],
              [
                'n',
                '"n=" is the sample size.',
                'Colored dots flag how much you can trust each number.',
              ],
            ].map(([mark, title, rest]) => (
              <div key={mark} className="flex min-w-[200px] flex-1 gap-2">
                <span className="font-bold" style={{ color: PURPLE }}>
                  {mark}
                </span>
                <span
                  className="text-xs leading-relaxed"
                  style={{ color: BODY_TEXT }}
                >
                  <strong style={{ color: INK }}>{title}</strong> — {rest}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {activeTab === 'readiness' && (
        <ReadinessTab
          gates={gates}
          pmf={pmf}
          recruitingTarget={recruiting_target}
          completedSurveys={completedSurveys}
        />
      )}
      {activeTab === 'fix' && (
        <WhatToFixTab
          whatToFix={what_to_fix}
          experience={experience}
          trust={trust}
          openText={open_text}
        />
      )}
      {activeTab === 'progress' && (
        <ProgressTab
          funnel={funnel}
          recruitingTarget={recruiting_target}
          modelAccuracy={model_accuracy}
          intent={intent}
          testers={testers}
        />
      )}
    </div>
  )
}

// ── Tab 1: Readiness ───────────────────────────────────────────────────────
function ReadinessTab({ gates, pmf, recruitingTarget, completedSurveys }) {
  const pmfSegments = [
    { metric: pmf.very_disappointed, color: GREEN, marker: true },
    { metric: pmf.somewhat_disappointed, color: AMBER, marker: false },
    { metric: pmf.not_disappointed, color: GRAY_DOT, marker: false },
  ]
  const pmfTotal = pmf.very_disappointed.sample
  const target = 20
  const sampleWidth = Math.min(
    100,
    Math.round((completedSurveys / target) * 100),
  )
  const sampleDone = completedSurveys >= target

  return (
    <div>
      <p className="mb-4 max-w-2xl text-sm" style={{ color: BODY_TEXT }}>
        Four gates must all pass before launch. Each shows its threshold so you
        know what "good" looks like.
      </p>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {gates.map((g) => (
          <GateCard key={g.key} gate={g} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <div className="mb-1 flex items-start justify-between gap-3">
            <div>
              <h3
                className="inline-flex items-center text-base font-bold"
                style={{ color: INK }}
              >
                Product–market fit
                <InfoIcon metric={pmf.segmented_pmf} />
              </h3>
              <p className="mt-1 text-xs" style={{ color: GRAY_TEXT }}>
                Sean Ellis test — % who'd be "very disappointed" without LyRise
              </p>
            </div>
            <ConfidenceChip metric={pmf.segmented_pmf} />
          </div>
          <div className="my-4 flex items-baseline gap-3">
            <div
              className="text-[44px] font-bold"
              style={{
                fontFamily: MONO,
                color: pmf.segmented_pmf.value >= 40 ? GREEN : AMBER,
              }}
            >
              {formatMetricValue(pmf.segmented_pmf)}
            </div>
            <div className="text-xs" style={{ color: GRAY_TEXT }}>
              raw: {formatMetricValue(pmf.raw_pmf)}
            </div>
          </div>
          {pmf.segmented_pmf.healthy && (
            <p className="-mt-3 mb-4 text-xs" style={{ color: GRAY_TEXT }}>
              {pmf.segmented_pmf.healthy}
            </p>
          )}
          <div className="space-y-3.5">
            {pmfSegments.map(({ metric, color, marker }) => {
              const pct =
                pmfTotal > 0 ? Math.round((metric.value / pmfTotal) * 100) : 0
              return (
                <div key={metric.label}>
                  <div className="mb-1.5 flex items-center justify-between text-[13px]">
                    <span
                      className="flex items-center font-medium"
                      style={{ color: BODY_TEXT }}
                    >
                      {metric.label}
                      <InfoIcon metric={metric} />
                    </span>
                    <span
                      className="flex items-center gap-2 font-semibold"
                      style={{ fontFamily: MONO, color: INK }}
                    >
                      {pct}%{' '}
                      <span style={{ color: '#b0b5bf' }}>({metric.value})</span>
                      <ConfidenceDot metric={metric} />
                    </span>
                  </div>
                  <div
                    className="relative h-2.5 overflow-hidden rounded-md"
                    style={{ background: GRAY_BG }}
                  >
                    <div
                      className="h-full rounded-md"
                      style={{ width: `${pct}%`, background: color }}
                    />
                    {marker && (
                      <div
                        className="pointer-events-none absolute inset-y-[-16px] left-[40%] w-px"
                        style={{ background: INK }}
                      >
                        <span
                          className="absolute -top-3.5 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold"
                          style={{ color: INK }}
                        >
                          40% bar
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        <Card style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="mb-1 flex items-start justify-between gap-2">
            <h3 className="text-base font-bold" style={{ color: INK }}>
              Sample size
            </h3>
            <ConfidenceDot metric={recruitingTarget.gap_a} />
          </div>
          <p className="text-xs" style={{ color: GRAY_TEXT }}>
            Completed PMF surveys toward the trustworthy floor
          </p>
          <div className="my-4 flex items-baseline gap-1.5">
            <span
              className="text-[44px] font-bold"
              style={{ fontFamily: MONO, color: INK }}
            >
              {completedSurveys}
            </span>
            <span
              className="text-xl"
              style={{ fontFamily: MONO, color: '#b0b5bf' }}
            >
              / {target}
            </span>
          </div>
          <div
            className="my-2.5 h-3 overflow-hidden rounded-lg"
            style={{ background: GRAY_BG }}
          >
            <div
              className="h-full rounded-lg"
              style={{
                width: `${sampleWidth}%`,
                background: sampleDone ? GREEN : PURPLE,
              }}
            />
          </div>
          <p
            className="mt-auto text-[13px] leading-relaxed"
            style={{ color: BODY_TEXT }}
          >
            {sampleDone
              ? "You've cleared the trustworthy-sample floor."
              : `${recruitingTarget.gap_a.value} more completed surveys to reach the trustworthy floor of ${target}.`}
          </p>
        </Card>
      </div>
    </div>
  )
}

// ── Tab 2: What to fix ──────────────────────────────────────────────────────
function WhatToFixTab({ whatToFix, experience, trust, openText }) {
  const unclearTotal = experience.unclear_reason[0]?.sample ?? 0

  return (
    <div>
      <p className="mb-4 max-w-2xl text-sm" style={{ color: BODY_TEXT }}>
        Ranked by impact — the clearest signals of what's holding testers back,
        plus their raw words.
      </p>

      {whatToFix.length === 0 ? (
        <Card className="mb-5">
          <EmptyNote text="No tester feedback collected yet — nothing to rank." />
        </Card>
      ) : (
        <div className="mb-5 space-y-4">
          {whatToFix.map((item, i) => (
            <WhatToFixCard key={item.id} item={item} rank={i + 1} />
          ))}
        </div>
      )}

      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-bold" style={{ color: INK }}>
              Why the report was unclear
            </h3>
            {experience.unclear_reason[0] && (
              <ConfidenceChip metric={experience.unclear_reason[0]} />
            )}
          </div>
          {experience.unclear_reason.length === 0 ? (
            <EmptyNote text="No low-clarity responses yet." />
          ) : (
            <div className="space-y-4">
              {experience.unclear_reason.map((m) => {
                const pct =
                  unclearTotal > 0
                    ? Math.round((m.value / unclearTotal) * 100)
                    : 0
                return (
                  <div key={m.label}>
                    <div className="mb-1.5 flex items-center justify-between text-[13px]">
                      <span
                        className="flex items-center font-semibold"
                        style={{ color: INK }}
                      >
                        {m.label}
                        <InfoIcon metric={m} />
                      </span>
                      <span
                        className="flex items-center gap-2 font-semibold"
                        style={{ fontFamily: MONO, color: INK }}
                      >
                        {pct}%{' '}
                        <span style={{ color: '#b0b5bf' }}>({m.value})</span>
                      </span>
                    </div>
                    <div
                      className="h-2.5 overflow-hidden rounded-md"
                      style={{ background: GRAY_BG }}
                    >
                      <div
                        className="h-full rounded-md"
                        style={{ width: `${pct}%`, background: PURPLE }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <Card>
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-base font-bold" style={{ color: INK }}>
              Trust delta
            </h3>
            <ConfidenceChip metric={trust.delta} />
          </div>
          <p className="text-xs" style={{ color: GRAY_TEXT }}>
            Confidence in outputs, before → after using LyRise
          </p>
          {trust.delta.value == null ? (
            <EmptyNote text="No paired before/after responses yet." />
          ) : (
            <div className="my-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div
                    className="text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: GRAY_TEXT }}
                  >
                    Before
                  </div>
                  <div
                    className="mt-1 text-2xl font-bold"
                    style={{ fontFamily: MONO, color: INK }}
                  >
                    {formatMetricValue(trust.trust_before)}
                  </div>
                </div>
                <div className="text-xl" style={{ color: GRAY_DOT }}>
                  →
                </div>
                <div className="text-center">
                  <div
                    className="text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: GRAY_TEXT }}
                  >
                    After
                  </div>
                  <div
                    className="mt-1 text-2xl font-bold"
                    style={{ fontFamily: MONO, color: INK }}
                  >
                    {formatMetricValue(trust.trust_after)}
                  </div>
                </div>
              </div>
              <div
                className="pl-4 text-right"
                style={{ borderLeft: `1px solid ${GRAY_BG}` }}
              >
                <div
                  className="text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: GRAY_TEXT }}
                >
                  Change
                </div>
                {/* Bare signed decimal, not routed through formatMetricValue
                    — that helper appends "/ 5" for scale_1_5 metrics, which
                    is correct for an absolute score but nonsensical on a
                    delta (a movement of -0.4 is not "-0.4 out of 5"). */}
                <div
                  className="mt-1 text-2xl font-bold"
                  style={{
                    fontFamily: MONO,
                    color:
                      trust.delta.value > 0
                        ? GREEN_TEXT
                        : trust.delta.value < 0
                          ? RED_TEXT
                          : GRAY_TEXT,
                  }}
                >
                  {trust.delta.value > 0 ? '+' : ''}
                  {trust.delta.value.toFixed(1)}
                </div>
              </div>
            </div>
          )}
          {trust.delta.healthy && (
            <p className="text-xs" style={{ color: GRAY_TEXT }}>
              {trust.delta.healthy}
            </p>
          )}
        </Card>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <MetricStat
            metric={experience.intake_ease}
            valueClassName="text-[40px] font-bold"
          />
        </Card>
        <Card>
          <MetricStat
            metric={experience.report_clarity}
            valueClassName="text-[40px] font-bold"
          />
        </Card>
      </div>

      <div
        className="mb-3.5 text-[11px] font-bold uppercase tracking-wider"
        style={{ color: GRAY_TEXT }}
      >
        Tester feedback, verbatim
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {Object.entries(openText).map(([field, entries]) => (
          <Card key={field}>
            <div className="mb-3.5 flex items-center justify-between">
              <h4 className="text-sm font-bold" style={{ color: INK }}>
                {OPEN_TEXT_TITLES[field] ?? field}
              </h4>
              <span
                className="text-[11px]"
                style={{ color: '#b0b5bf', fontFamily: MONO }}
              >
                {entries.length > 0
                  ? `${entries.length} response${entries.length === 1 ? '' : 's'}`
                  : '—'}
              </span>
            </div>
            {entries.length > 0 ? (
              <div className="space-y-2">
                {entries.map((entry, i) => (
                  <QuoteRow
                    key={i}
                    quote={{ text: entry.value, email: entry.email }}
                  />
                ))}
              </div>
            ) : (
              <EmptyNote text="No responses yet" />
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}

// ── Tab 3: Test progress ─────────────────────────────────────────────────────
function ProgressTab({
  funnel,
  recruitingTarget,
  modelAccuracy,
  intent,
  testers,
}) {
  const baseline = funnel.reached_intake.value
  const funnelRows = FUNNEL_ORDER.map((key, i) => {
    const metric = funnel[key]
    const prevKey = FUNNEL_ORDER[i - 1]
    const isOffending = i > 0 && metric.value > funnel[prevKey].value
    const pct = baseline > 0 ? Math.round((metric.value / baseline) * 100) : 0
    return { key, metric, pct, isOffending }
  })
  const barColor = funnel.integrity_warning ? AMBER : PURPLE

  const bindingGap =
    recruitingTarget.gap_a.value >= recruitingTarget.gap_b.value
      ? recruitingTarget.gap_a
      : recruitingTarget.gap_b
  const recruitNote =
    bindingGap === recruitingTarget.gap_a
      ? recruitingTarget.gap_a.value > 0
        ? 'Sample-size gap is binding.'
        : "You've cleared the sample-size floor."
      : recruitingTarget.gap_b.value > 0
        ? 'Fresh-signal gap is binding.'
        : 'No fresh-signal gap right now.'

  const intentRows = [
    intent.this_quarter,
    intent.next_quarter,
    intent.exploring,
  ]

  return (
    <div>
      <p className="mb-4 max-w-2xl text-sm" style={{ color: BODY_TEXT }}>
        How the alpha is running — where testers drop off, how many more you
        need, and model behavior.
      </p>

      {/* Funnel */}
      <Card className="mb-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold" style={{ color: INK }}>
              Progression funnel
            </h3>
            <p className="mt-1 text-xs" style={{ color: GRAY_TEXT }}>
              Share of testers reaching each step
            </p>
          </div>
          <span
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={
              funnel.integrity_warning
                ? { color: RED_TEXT, background: RED_BG }
                : { color: GREEN_TEXT, background: GREEN_BG }
            }
          >
            {funnel.integrity_warning
              ? '⚠ Unreliable — see banner'
              : `Consistent · n=${baseline}`}
          </span>
        </div>
        <div className="space-y-3.5">
          {funnelRows.map((row) => (
            <div key={row.key} className="flex items-center gap-4">
              <div
                className="flex w-40 shrink-0 items-center gap-1.5 text-[13px] font-medium"
                style={{ color: BODY_TEXT }}
              >
                {row.metric.label}
                {row.isOffending && (
                  <span title={funnel.integrity_warning} style={{ color: RED }}>
                    ⚠
                  </span>
                )}
              </div>
              <div
                className="h-3.5 flex-1 overflow-hidden rounded-lg"
                style={{ background: GRAY_BG }}
              >
                <div
                  className="h-full rounded-lg"
                  style={{
                    width: `${row.pct}%`,
                    background: row.isOffending ? RED : barColor,
                  }}
                />
              </div>
              <div
                className="flex w-28 shrink-0 items-center justify-end gap-2 text-[13px] font-semibold"
                style={{ fontFamily: MONO, color: INK }}
              >
                {row.metric.value}{' '}
                <span style={{ color: '#b0b5bf', fontWeight: 400 }}>
                  ({row.pct}%)
                </span>
                <ConfidenceDot metric={row.metric} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Recruiting target */}
      <Card className="mb-5">
        <div className="flex items-center justify-between">
          <h3
            className="text-[13px] font-bold uppercase tracking-wider"
            style={{ color: GRAY_TEXT }}
          >
            Recruiting target
          </h3>
          <ConfidenceDot metric={recruitingTarget.target} />
        </div>
        <div className="my-3 flex items-baseline gap-2.5">
          <span
            className="text-[48px] font-bold"
            style={{
              fontFamily: MONO,
              color: recruitingTarget.target.value > 0 ? PURPLE : GREEN,
            }}
          >
            {recruitingTarget.target.value}
          </span>
          <span className="text-sm" style={{ color: BODY_TEXT }}>
            more completed surveys needed
          </span>
        </div>
        <p
          className="inline-flex max-w-2xl items-center text-[13px] leading-relaxed"
          style={{ color: BODY_TEXT }}
        >
          {recruitNote}
          <InfoIcon metric={bindingGap} />
        </p>
        <div
          className="mt-5 grid grid-cols-1 gap-4 pt-4.5 sm:grid-cols-2"
          style={{ borderTop: `1px solid ${GRAY_BG}` }}
        >
          <div>
            <div className="flex items-center justify-between">
              <div
                className="text-[11px] font-bold uppercase tracking-wider"
                style={{ color: GRAY_TEXT }}
              >
                Sample-size gap
              </div>
              <ConfidenceDot metric={recruitingTarget.gap_a} />
            </div>
            <div
              className="mt-1 text-2xl font-bold"
              style={{ fontFamily: MONO, color: INK }}
            >
              {recruitingTarget.gap_a.value}
            </div>
            <code
              className="text-[11px]"
              style={{ color: '#a0a5af', fontFamily: MONO }}
            >
              {recruitingTarget.gap_a.formula}
            </code>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <div
                className="text-[11px] font-bold uppercase tracking-wider"
                style={{ color: GRAY_TEXT }}
              >
                Fresh-signal gap
              </div>
              <ConfidenceDot metric={recruitingTarget.gap_b} />
            </div>
            <div
              className="mt-1 text-2xl font-bold"
              style={{ fontFamily: MONO, color: INK }}
            >
              {recruitingTarget.gap_b.value}
            </div>
            <code
              className="text-[11px]"
              style={{ color: '#a0a5af', fontFamily: MONO }}
            >
              {recruitingTarget.gap_b.formula}
            </code>
          </div>
        </div>
      </Card>

      {/* Model accuracy */}
      <div
        className="mb-3.5 text-[11px] font-bold uppercase tracking-wider"
        style={{ color: GRAY_TEXT }}
      >
        Model accuracy
      </div>
      <div className="mb-2 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
        {[
          modelAccuracy.workflows_kept_pct,
          modelAccuracy.volume_drift,
          modelAccuracy.duration_drift,
          modelAccuracy.workflows_added,
          modelAccuracy.workflows_removed,
        ].map((m) => (
          <Card key={m.label} className="!p-4">
            <div
              className="min-h-[28px] text-[11px] font-bold uppercase tracking-wider leading-tight"
              style={{ color: GRAY_TEXT }}
            >
              <span className="inline-flex items-center">
                {m.label}
                <InfoIcon metric={m} />
              </span>
            </div>
            <div
              className="my-1.5 text-[26px] font-bold"
              style={{
                fontFamily: MONO,
                color: m.confidence === 'low' ? GRAY_TEXT : INK,
              }}
            >
              {formatMetricValue(m, { signed: m.label.includes('drift') })}
            </div>
            {m.healthy && (
              <div
                className="min-h-[40px] text-[11px] leading-snug"
                style={{ color: GRAY_TEXT }}
              >
                {m.healthy}
              </div>
            )}
            <div
              className="mt-2 pt-2 text-[11px]"
              style={{ borderTop: `1px solid ${GRAY_BG}` }}
            >
              <ConfidenceDot metric={m} />
            </div>
          </Card>
        ))}
      </div>
      {modelAccuracy.reports_excluded.value > 0 && (
        <p
          className="mb-5 inline-flex items-center text-xs font-semibold"
          style={{ color: AMBER_TEXT }}
        >
          {modelAccuracy.reports_excluded.value}{' '}
          {modelAccuracy.reports_excluded.label.toLowerCase()}
          <InfoIcon metric={modelAccuracy.reports_excluded} />
        </p>
      )}

      {/* Purchase intent */}
      <div
        className="mb-3.5 mt-2 text-[11px] font-bold uppercase tracking-wider"
        style={{ color: GRAY_TEXT }}
      >
        Purchase intent
      </div>
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {intentRows.map((m) => {
          const share =
            m.sample > 0 ? Math.round((m.value / m.sample) * 100) : null
          return (
            <Card key={m.label}>
              <MetricLabel metric={m} />
              <div className="mt-2.5 flex items-baseline gap-2">
                <span
                  className="text-[32px] font-bold"
                  style={{ fontFamily: MONO, color: INK }}
                >
                  {m.value}
                </span>
                <span className="text-[13px]" style={{ color: GRAY_TEXT }}>
                  {share != null ? `${share}% of ${m.sample}` : 'no data'}
                </span>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Real testers */}
      <Card className="!p-0 overflow-hidden">
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: `1px solid ${BORDER}` }}
        >
          <h3 className="text-base font-bold" style={{ color: INK }}>
            Real testers
          </h3>
          <span
            className="text-xs"
            style={{ color: GRAY_TEXT, fontFamily: MONO }}
          >
            {testers.total.value} testers
          </span>
        </div>
        {testers.rows.length === 0 ? (
          <EmptyNote text="No real testers yet." />
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead
                style={{
                  background: '#fafbfc',
                  borderBottom: `1px solid ${BORDER}`,
                }}
              >
                <tr>
                  {['Email', 'Name', 'Company', 'Step reached', 'Started'].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider"
                        style={{ color: '#a0a5af' }}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {testers.rows.map((t, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${GRAY_BG}` }}>
                    <td
                      className="px-5 py-3 text-xs whitespace-nowrap"
                      style={{ color: BODY_TEXT, fontFamily: MONO }}
                    >
                      {t.email || '—'}
                    </td>
                    <td
                      className="px-5 py-3 text-sm whitespace-nowrap"
                      style={{ color: INK }}
                    >
                      {t.full_name || '—'}
                    </td>
                    <td
                      className="px-5 py-3 text-sm whitespace-nowrap"
                      style={{ color: BODY_TEXT }}
                    >
                      {t.company_name || '—'}
                    </td>
                    <td className="px-5 py-3">
                      <StepBadge step={t.step_reached} />
                    </td>
                    <td
                      className="px-5 py-3 text-xs whitespace-nowrap"
                      style={{ color: GRAY_TEXT, fontFamily: MONO }}
                    >
                      {fmtDate(t.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

const STEP_STYLES = {
  intake: { fg: '#5b616e', bg: '#f0f1f4' },
  generation: { fg: '#5b616e', bg: '#f0f1f4' },
  validation: { fg: AMBER_TEXT, bg: AMBER_BG },
  report: { fg: GREEN_TEXT, bg: GREEN_BG },
  survey: { fg: PURPLE, bg: PURPLE_TINT_STRONG },
}

function StepBadge({ step }) {
  const s = STEP_STYLES[step] ?? STEP_STYLES.intake
  const label = step ? step.charAt(0).toUpperCase() + step.slice(1) : 'Intake'
  return (
    <span
      className="whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold"
      style={{ color: s.fg, background: s.bg }}
    >
      {label}
    </span>
  )
}
