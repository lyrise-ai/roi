import { useState, useEffect, useCallback } from 'react'

const PURPLE = '#5B48F8'

const fmtDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// Every number on this page comes wrapped as { value, unit, label, explains,
// formula, sample, caveat, ready } from GET /api/alpha/dashboard. This is the
// only place that turns `unit` into a display string — nothing else on this
// page re-derives what a number means.
function formatMetricValue(metric, { signed = false } = {}) {
  if (!metric || metric.value == null) return '—'
  const { value, unit } = metric
  const sign = signed && value > 0 ? '+' : ''
  if (unit === 'percent') return `${sign}${value}%`
  if (unit === 'scale_1_5') return `${sign}${value} / 5`
  return `${sign}${value}`
}

function InfoIcon({ explains, formula }) {
  if (!explains && !formula) return null
  return (
    <span className="relative inline-flex items-center group/tip cursor-help ml-1.5">
      <span className="text-slate-400 text-xs select-none">ⓘ</span>
      <span className="pointer-events-none absolute left-0 top-full mt-1 z-50 w-72 bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs text-slate-600 leading-relaxed opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 normal-case font-normal tracking-normal">
        {explains && <span className="block mb-2">{explains}</span>}
        {formula && (
          <span className="block font-mono text-[10px] text-slate-400 bg-slate-50 rounded px-1.5 py-1">
            {formula}
          </span>
        )}
      </span>
    </span>
  )
}

function MetricLabel({ metric, className = '' }) {
  return (
    <p
      className={`text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center ${className}`}
    >
      {metric.label}
      <InfoIcon explains={metric.explains} formula={metric.formula} />
    </p>
  )
}

// Every number gets its sample size right next to it, always — a number
// without a stated sample size is a rumour, not a metric.
function SampleTag({ sample }) {
  if (sample == null) return null
  return (
    <span className="text-[11px] font-normal text-slate-400 ml-1.5 align-middle">
      (n={sample})
    </span>
  )
}

// The single building block for a metric readout. If the payload says this
// metric isn't ready (e.g. PMF below the sample floor), the value is never
// shown — only the caveat explaining what's still needed. If it's ready but
// still carries a caveat (e.g. accuracy stats excluding fallback reports),
// the value shows with the caveat underneath.
function MetricStat({
  metric,
  valueClassName = 'text-3xl font-bold text-slate-900',
  signed = false,
}) {
  if (!metric) return null
  return (
    <div>
      <MetricLabel metric={metric} className="mb-2" />
      {metric.ready ? (
        <>
          <p className={valueClassName}>
            {formatMetricValue(metric, { signed })}
            <SampleTag sample={metric.sample} />
          </p>
          {metric.caveat && (
            <p className="text-xs text-amber-600 mt-1.5 leading-relaxed">
              {metric.caveat}
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-slate-500 italic mt-1 leading-relaxed">
          {metric.caveat || 'Not enough data yet.'}
        </p>
      )}
    </div>
  )
}

function Card({ children, className = '', style }) {
  return (
    <div
      className={`bg-white border border-slate-200 rounded-2xl p-6 shadow-sm ${className}`}
      style={style}
    >
      {children}
    </div>
  )
}

function EmptyNote({ text, className = '' }) {
  return (
    <p className={`text-xs text-slate-400 text-center py-6 ${className}`}>
      {text}
    </p>
  )
}

function BarRow({ metric, total, color }) {
  const pct = total > 0 ? Math.round((metric.value / total) * 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-700 font-medium flex items-center">
          {metric.label}
          <InfoIcon explains={metric.explains} formula={metric.formula} />
        </span>
        <span className="text-slate-500 tabular-nums">
          {metric.value} <span className="text-slate-400">({pct}%)</span>
          <SampleTag sample={metric.sample} />
        </span>
      </div>
      <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function GateBadge({ pass }) {
  return pass ? (
    <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">
      ✓ Closed
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">
      ● Open
    </span>
  )
}

const STEP_LABELS = {
  intake: 'Intake',
  generation: 'Generation',
  validation: 'Validation',
  report: 'Report',
  survey: 'Survey',
}

const STEP_STYLES = {
  intake: 'bg-slate-100 text-slate-500',
  generation: 'bg-slate-100 text-slate-600',
  validation: 'bg-blue-50 text-blue-600',
  report: 'bg-blue-50 text-blue-700',
  survey: 'bg-[#F3E8FF] text-[#5B48F8]',
}

function StepBadge({ step }) {
  return (
    <span
      className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${STEP_STYLES[step] ?? STEP_STYLES.intake}`}
    >
      {STEP_LABELS[step] ?? step}
    </span>
  )
}

const OPEN_TEXT_TITLES = {
  intake_ease_note: 'Why intake felt easy or hard',
  validation_note: 'Validation wizard comments',
  unclear_note: 'What made the report unclear',
  pmf_main_benefit: 'What testers valued most',
  pmf_improvement: 'What testers want improved',
  not_disappointed_reason: 'What would make it more valuable',
}

export default function AlphaDashboardPanel() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [lastFetched, setLastFetched] = useState(null)

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
      <div className="flex items-center justify-center py-24">
        <p className="text-slate-400 text-sm animate-pulse">
          Loading dashboard…
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24">
        <p className="text-slate-500 text-sm">{error}</p>
        <button
          type="button"
          onClick={fetchData}
          className="text-sm font-medium text-[#5B48F8] hover:underline"
        >
          Retry
        </button>
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
  } = data

  const ControlBar = (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full">
          🔒 Internal only
        </span>
        {lastFetched && (
          <span className="text-xs text-slate-400">
            Updated {lastFetched.toLocaleTimeString()}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={fetchData}
        className="text-sm font-medium border rounded-lg px-3 py-1.5 hover:bg-[#5B48F8]/5 transition-colors"
        style={{ color: PURPLE, borderColor: `${PURPLE}55` }}
      >
        Refresh ↻
      </button>
    </div>
  )

  // Zero real testers is a legitimate, meaningful state — but rendering
  // every card below as "0 (n=0)" reads like a wall of failed measurements
  // rather than "we haven't started collecting yet". Say that plainly
  // instead.
  if (testers.total.value === 0) {
    return (
      <div className="font-sans text-slate-900">
        {ControlBar}
        <div className="flex flex-col items-center justify-center gap-2 py-24">
          <p className="text-slate-500 text-sm font-medium">
            No real testers yet.
          </p>
          <p className="text-slate-400 text-xs max-w-sm text-center">
            {testers.total.explains}
          </p>
        </div>
      </div>
    )
  }

  // ── Launch readiness gates — computed only from booleans/values the route
  // already gave us, never re-derived from raw rows here. ──────────────────
  const gateSampleSize = {
    key: 'sample',
    label: 'Sample size',
    pass: recruiting_target.gap_a.value === 0,
    current: `${recruiting_target.gap_a.sample} of 20 completed surveys`,
  }
  const gatePmf = {
    key: 'pmf',
    label: 'Product-market fit',
    pass: pmf.segmented_pmf.ready && pmf.segmented_pmf.value >= 40,
    current: pmf.segmented_pmf.ready
      ? `${pmf.segmented_pmf.value}% segmented PMF (target 40%+)`
      : pmf.segmented_pmf.caveat || 'Not enough data yet',
  }
  const gateSaturation = {
    key: 'saturation',
    label: 'Theme saturation',
    pass: recruiting_target.gap_b.value === 0,
    current:
      recruiting_target.gap_b.value > 0
        ? 'Still hearing new things from recent testers'
        : 'No unseen-before signal from the last 3 testers',
  }
  const gateFunnel = {
    key: 'funnel',
    label: 'Funnel health',
    pass: !funnel.integrity_warning,
    current: funnel.integrity_warning
      ? 'Funnel counts are inconsistent'
      : 'Funnel counts check out',
  }
  const gates = [gateSampleSize, gatePmf, gateSaturation, gateFunnel]
  const openGateCount = gates.filter((g) => !g.pass).length
  const verdict =
    openGateCount === 0
      ? 'Ready to launch — all 4 gates closed'
      : `Not ready — ${openGateCount} of 4 gates open`

  const bindingGap =
    recruiting_target.gap_a.value >= recruiting_target.gap_b.value
      ? recruiting_target.gap_a
      : recruiting_target.gap_b

  const pmfTotal = pmf.very_disappointed.sample
  const funnelBaseline = funnel.reached_intake.value
  const FUNNEL_ORDER = [
    'reached_intake',
    'reached_generation',
    'reached_validation',
    'reached_report',
    'reached_survey',
  ]

  return (
    <div className="font-sans text-slate-900">
      {ControlBar}

      <div className="space-y-10">
        {/* 1. Launch readiness */}
        <section>
          <p
            className={`text-2xl font-bold mb-6 ${openGateCount === 0 ? '' : 'text-slate-900'}`}
            style={openGateCount === 0 ? { color: PURPLE } : undefined}
          >
            {verdict}
          </p>
          <div className="grid grid-cols-4 gap-4">
            {gates.map((g) => (
              <Card key={g.key}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {g.label}
                  </p>
                  <GateBadge pass={g.pass} />
                </div>
                <p className="text-sm text-slate-600 leading-snug">
                  {g.current}
                </p>
              </Card>
            ))}
          </div>
        </section>

        {/* 2. Integrity warning — prominent, not softened */}
        {funnel.integrity_warning && (
          <div className="border-2 border-red-400 bg-red-50 rounded-2xl p-5 flex items-start gap-3">
            <span className="text-red-500 text-xl leading-none shrink-0">
              ⚠
            </span>
            <div>
              <p className="text-sm font-bold text-red-700 mb-1">
                This dashboard's funnel data is inconsistent
              </p>
              <p className="text-sm text-red-700 leading-relaxed">
                {funnel.integrity_warning}
              </p>
            </div>
          </div>
        )}

        {/* 3. Recruiting target */}
        <Card>
          <MetricLabel metric={recruiting_target.target} className="mb-2" />
          <p className="text-6xl font-bold" style={{ color: PURPLE }}>
            {formatMetricValue(recruiting_target.target)}
            <SampleTag sample={recruiting_target.target.sample} />
          </p>
          <p className="text-sm text-slate-600 mt-4 leading-relaxed">
            <span className="font-semibold text-slate-800">
              {bindingGap.label}
            </span>{' '}
            is binding: {bindingGap.explains}
          </p>
          <p className="text-xs text-slate-400 font-mono mt-2">
            {bindingGap.formula}
          </p>
          <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-slate-100">
            <MetricStat
              metric={recruiting_target.gap_a}
              valueClassName="text-xl font-bold text-slate-700"
            />
            <MetricStat
              metric={recruiting_target.gap_b}
              valueClassName="text-xl font-bold text-slate-700"
            />
          </div>
        </Card>

        {/* 4. Model accuracy */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">
            Model accuracy
          </h2>
          <div className="grid grid-cols-5 gap-4">
            <Card>
              <MetricStat metric={model_accuracy.workflows_kept_pct} />
            </Card>
            <Card>
              <MetricStat metric={model_accuracy.volume_drift} signed />
            </Card>
            <Card>
              <MetricStat metric={model_accuracy.duration_drift} signed />
            </Card>
            <Card>
              <MetricStat metric={model_accuracy.workflows_added} />
            </Card>
            <Card>
              <MetricStat metric={model_accuracy.workflows_removed} />
            </Card>
          </div>
          {model_accuracy.reports_excluded.value > 0 && (
            <p className="text-xs text-amber-600 mt-3 leading-relaxed">
              {model_accuracy.reports_excluded.value}{' '}
              {model_accuracy.reports_excluded.label.toLowerCase()}:{' '}
              {model_accuracy.reports_excluded.explains}
            </p>
          )}
        </section>

        {/* 5. Trust delta — shown as movement, not two separate numbers */}
        <Card>
          <MetricLabel metric={trust.delta} className="mb-4" />
          {trust.delta.ready ? (
            <div className="flex items-center gap-6">
              <div>
                <p className="text-xs text-slate-400 mb-1">Before</p>
                <p className="text-2xl font-bold text-slate-700">
                  {formatMetricValue(trust.trust_before)}
                </p>
              </div>
              <span className="text-2xl text-slate-300">→</span>
              <div>
                <p className="text-xs text-slate-400 mb-1">After</p>
                <p className="text-2xl font-bold text-slate-700">
                  {formatMetricValue(trust.trust_after)}
                </p>
              </div>
              <div className="ml-auto text-right">
                <p
                  className={`text-2xl font-bold ${
                    trust.delta.value > 0
                      ? 'text-emerald-600'
                      : trust.delta.value < 0
                        ? 'text-amber-600'
                        : 'text-slate-400'
                  }`}
                >
                  {formatMetricValue(trust.delta, { signed: true })}
                </p>
                <p className="text-[11px] text-slate-400">
                  n={trust.delta.sample}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500 italic">
              {trust.delta.caveat || 'Not enough paired responses yet.'}
            </p>
          )}
        </Card>

        {/* 6. Experience */}
        <section className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <MetricStat metric={experience.intake_ease} />
            </Card>
            <Card>
              <MetricStat metric={experience.report_clarity} />
            </Card>
          </div>
          <Card style={{ borderColor: `${PURPLE}40`, borderWidth: 2 }}>
            <h3 className="text-sm font-bold text-slate-900 mb-1">
              Why the report was unclear
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Ranked reasons from low-clarity testers — the most actionable item
              on this page
            </p>
            {experience.unclear_reason.length === 0 ? (
              <EmptyNote text="No low-clarity responses yet." />
            ) : (
              <div className="space-y-3">
                {experience.unclear_reason.map((m) => (
                  <BarRow
                    key={m.label}
                    metric={m}
                    total={m.sample}
                    color="bg-[#5B48F8]"
                  />
                ))}
              </div>
            )}
          </Card>
        </section>

        {/* 7. Funnel */}
        <Card
          className={
            funnel.integrity_warning ? 'border-amber-300 bg-amber-50/40' : ''
          }
        >
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-bold text-slate-900">Funnel</h3>
            {funnel.integrity_warning && (
              <span className="text-xs font-bold text-amber-700">
                ⚠ Unreliable — see warning above
              </span>
            )}
          </div>
          <div className="space-y-4 mt-5">
            {FUNNEL_ORDER.map((key) => {
              const m = funnel[key]
              const pct =
                funnelBaseline > 0
                  ? Math.round((m.value / funnelBaseline) * 100)
                  : 0
              return (
                <div key={key} className="flex items-center gap-4">
                  <div className="w-52 shrink-0 text-sm text-slate-700 flex items-center">
                    {m.label}
                    <InfoIcon explains={m.explains} formula={m.formula} />
                  </div>
                  <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        funnel.integrity_warning
                          ? 'bg-amber-400'
                          : 'bg-[#5B48F8]'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="w-32 text-right shrink-0">
                    <span className="text-sm font-semibold text-slate-700 tabular-nums">
                      {m.value}
                    </span>
                    <span className="text-xs text-slate-400 ml-1">
                      ({pct}%)
                    </span>
                    <SampleTag sample={m.sample} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* 8. PMF (Vohra) */}
        <Card>
          <h3 className="text-sm font-bold text-slate-900 mb-4">PMF (Vohra)</h3>
          <div className="space-y-4 mb-6">
            <BarRow
              metric={pmf.very_disappointed}
              total={pmfTotal}
              color="bg-emerald-500"
            />
            <BarRow
              metric={pmf.somewhat_disappointed}
              total={pmfTotal}
              color="bg-[#5B48F8]"
            />
            <BarRow
              metric={pmf.not_disappointed}
              total={pmfTotal}
              color="bg-slate-400"
            />
          </div>
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
            <MetricStat metric={pmf.raw_pmf} />
            <MetricStat metric={pmf.segmented_pmf} />
          </div>
        </Card>

        {/* 9. Intent (for the CEO) */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">
            Intent
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <MetricStat metric={intent.this_quarter} />
            </Card>
            <Card>
              <MetricStat metric={intent.next_quarter} />
            </Card>
            <Card>
              <MetricStat metric={intent.exploring} />
            </Card>
          </div>
        </section>

        {/* 10. Testers */}
        <Card className="p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 flex items-center">
              {testers.total.label}
              <InfoIcon
                explains={testers.total.explains}
                formula={testers.total.formula}
              />
            </h2>
            <span className="text-xs text-slate-400">
              {testers.total.value}
              <SampleTag sample={testers.total.sample} />
            </span>
          </div>
          {testers.rows.length === 0 ? (
            <EmptyNote text="No real testers yet." />
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-100 sticky top-0">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Company
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Step reached
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Started
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {testers.rows.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3 text-slate-500 text-xs whitespace-nowrap">
                        {r.email || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-6 py-3 text-slate-600 text-xs whitespace-nowrap">
                        {r.full_name || '—'}
                      </td>
                      <td className="px-6 py-3 text-slate-600 text-xs whitespace-nowrap">
                        {r.company_name || '—'}
                      </td>
                      <td className="px-6 py-3">
                        <StepBadge step={r.step_reached} />
                      </td>
                      <td className="px-6 py-3 text-slate-600 tabular-nums whitespace-nowrap text-xs">
                        {fmtDate(r.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* 11. Open text — grouped by source question, not clustered */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">
            Open text
          </h2>
          <div className="grid grid-cols-2 gap-6">
            {Object.entries(open_text).map(([field, entries]) => (
              <Card key={field}>
                <h3 className="text-sm font-bold text-slate-900 mb-4">
                  {OPEN_TEXT_TITLES[field] ?? field}
                </h3>
                {entries.length === 0 ? (
                  <EmptyNote text="No responses yet." />
                ) : (
                  <div className="max-h-72 overflow-y-auto pr-2">
                    <div className="space-y-3">
                      {entries.map((entry, i) => (
                        <div key={i} className="bg-slate-50 rounded-xl p-3">
                          <p className="text-sm text-slate-700 leading-relaxed mb-1.5">
                            {entry.value}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {entry.email}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
