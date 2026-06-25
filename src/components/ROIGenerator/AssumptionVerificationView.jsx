import clsx from 'clsx'

function Field({ label, value, onChange, error, type = 'text', step }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">
        {label}
      </span>
      <input
        type={type}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        step={step}
        className={clsx(
          'w-full rounded-xl border px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors',
          error
            ? 'border-red-300 bg-red-50'
            : 'border-gray-200 bg-white hover:border-gray-300 focus:border-gray-500',
        )}
      />
      {error ? <span className="text-xs text-red-500">{error}</span> : null}
    </label>
  )
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">
        {label}
      </span>
      <select
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors hover:border-gray-300 focus:border-gray-500"
      >
        <option value="">Select</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function ContextPill({ label, value }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-medium text-gray-700">
        {value || 'Not set'}
      </p>
    </div>
  )
}

function formatCurrency(value, currencyCode) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  const code = currencyCode || 'USD'
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 0,
    }).format(Number(value))
  } catch {
    return `${code} ${Math.round(Number(value)).toLocaleString()}`
  }
}

function formatNumber(value) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return Math.round(Number(value)).toLocaleString()
}

function sourceMeta(sourceType) {
  if (sourceType === 'research_derived') {
    return {
      label: 'Researched',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    }
  }
  if (sourceType === 'user_stated') {
    return {
      label: 'Provided',
      className: 'border-sky-200 bg-sky-50 text-sky-700',
    }
  }
  return {
    label: 'Benchmarked',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  }
}

export default function AssumptionVerificationView({
  draftState,
  previewCalc,
  errors,
  teamSizeOptions,
  revenueOptions,
  currencyOptions,
  onCompanyFieldChange,
  onWorkflowFieldChange,
  onBack,
  onConfirm,
  onRerun,
  isSubmitting,
  isRerunning,
}) {
  const workflows = draftState?.workflows ?? []
  const currencyCode =
    draftState?.normInput?.selectedCurrency ??
    draftState?.globals?.currency?.code ??
    'USD'

  return (
    <div className="rebranding-landing-page -mt-[12px]">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-8 text-gray-900 md:px-6">
        <div className="rounded-[28px] border border-gray-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <div className="border-b border-gray-100 px-6 py-6 md:px-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
              Review assumptions
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-gray-900 md:text-[2rem]">
              Confirm the assumptions behind your ROI report
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-500">
              Check the numbers that drive the ROI calculation. Research notes
              and source context stay tucked away unless you need them.
            </p>
          </div>

          <div className="grid gap-6 px-6 py-6 md:px-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]">
            <div className="space-y-6">
              <section className="rounded-2xl border border-gray-200 bg-gray-50/70 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-base font-semibold text-gray-900">
                      Company anchors
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">
                      Quick sanity check for scale, revenue, and currency.
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <Field
                    label="Employee estimate"
                    type="number"
                    step="1"
                    value={draftState?.company?.employees ?? ''}
                    error={errors?.company?.employees}
                    onChange={(value) =>
                      onCompanyFieldChange('employees', value)
                    }
                  />
                  <Field
                    label="Revenue estimate (M)"
                    type="number"
                    step="0.1"
                    value={draftState?.company?.revenueEstimateM ?? ''}
                    error={errors?.company?.revenueEstimateM}
                    onChange={(value) =>
                      onCompanyFieldChange('revenueEstimateM', value)
                    }
                  />
                  <SelectField
                    label="Team size band"
                    value={draftState?.normInput?.teamSize ?? ''}
                    options={teamSizeOptions}
                    onChange={(value) =>
                      onCompanyFieldChange('teamSize', value)
                    }
                  />
                  <SelectField
                    label="Revenue range"
                    value={draftState?.normInput?.revenueRange ?? ''}
                    options={revenueOptions}
                    onChange={(value) =>
                      onCompanyFieldChange('revenueRange', value)
                    }
                  />
                  <SelectField
                    label="Currency"
                    value={draftState?.normInput?.selectedCurrency ?? ''}
                    options={currencyOptions}
                    onChange={(value) =>
                      onCompanyFieldChange('selectedCurrency', value)
                    }
                  />
                </div>

                <details className="mt-4 rounded-xl border border-gray-200 bg-white px-4 py-3">
                  <summary className="cursor-pointer text-sm font-medium text-gray-700">
                    Benchmark context
                  </summary>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <Field
                      label="Industry"
                      value={draftState?.company?.industry ?? ''}
                      onChange={(value) =>
                        onCompanyFieldChange('industry', value)
                      }
                    />
                    <Field
                      label="Country"
                      value={draftState?.company?.country ?? ''}
                      onChange={(value) =>
                        onCompanyFieldChange('country', value)
                      }
                    />
                  </div>
                </details>
              </section>

              <section className="space-y-4">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">
                    Workflow assumptions
                  </h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Review only the numeric inputs that shape the math. You can
                    refine workflows and wording with the assistant after the
                    report is generated.
                  </p>
                </div>

                <div className="grid gap-4">
                  {workflows.map((workflow, index) => {
                    const meta = sourceMeta(workflow.sourceType)
                    const workflowErrors = errors?.workflows?.[index] ?? {}

                    return (
                      <article
                        key={`${workflow.name}-${index}`}
                        className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-[260px] flex-1">
                            <p className="text-xs font-medium text-gray-400">
                              Workflow {index + 1}
                            </p>
                            <h3 className="mt-1 text-lg font-semibold text-gray-900">
                              {workflow.name || 'Untitled workflow'}
                            </h3>
                            <p className="mt-1 text-sm text-gray-500">
                              Owner: {workflow.owner || 'Not set'}
                            </p>
                          </div>
                          <span
                            className={clsx(
                              'inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold',
                              meta.className,
                            )}
                          >
                            {meta.label}
                          </span>
                        </div>

                        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                          <Field
                            label="Monthly volume"
                            type="number"
                            step="1"
                            value={workflow.monthlyVolume}
                            error={workflowErrors.monthlyVolume}
                            onChange={(value) =>
                              onWorkflowFieldChange(
                                index,
                                'monthlyVolume',
                                value,
                              )
                            }
                          />
                          <Field
                            label="Minutes before AI"
                            type="number"
                            step="1"
                            value={workflow.minutesPerItemBefore}
                            error={workflowErrors.minutesPerItemBefore}
                            onChange={(value) =>
                              onWorkflowFieldChange(
                                index,
                                'minutesPerItemBefore',
                                value,
                              )
                            }
                          />
                          <Field
                            label="Minutes after AI"
                            type="number"
                            step="1"
                            value={workflow.minutesPerItemAfter}
                            error={workflowErrors.minutesPerItemAfter}
                            onChange={(value) =>
                              onWorkflowFieldChange(
                                index,
                                'minutesPerItemAfter',
                                value,
                              )
                            }
                          />
                          <Field
                            label="Hourly rate"
                            type="number"
                            step="0.1"
                            value={workflow.rateOverride ?? ''}
                            error={workflowErrors.rateOverride}
                            onChange={(value) =>
                              onWorkflowFieldChange(
                                index,
                                'rateOverride',
                                value,
                              )
                            }
                          />
                        </div>

                        <details className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                          <summary className="cursor-pointer text-sm font-medium text-gray-700">
                            More context
                          </summary>
                          <div className="mt-4 grid gap-4 md:grid-cols-3">
                            <Field
                              label="Workflow name"
                              value={workflow.name}
                              error={workflowErrors.name}
                              onChange={(value) =>
                                onWorkflowFieldChange(index, 'name', value)
                              }
                            />
                            <Field
                              label="Owner role"
                              value={workflow.owner}
                              error={workflowErrors.owner}
                              onChange={(value) =>
                                onWorkflowFieldChange(index, 'owner', value)
                              }
                            />
                            <Field
                              label="Function"
                              value={workflow.function}
                              error={workflowErrors.function}
                              onChange={(value) =>
                                onWorkflowFieldChange(index, 'function', value)
                              }
                            />
                            <Field
                              label="Seniority"
                              value={workflow.seniorityLevel ?? ''}
                              error={workflowErrors.seniorityLevel}
                              onChange={(value) =>
                                onWorkflowFieldChange(
                                  index,
                                  'seniorityLevel',
                                  value,
                                )
                              }
                            />
                            <Field
                              label="Source type"
                              value={workflow.sourceType}
                              error={workflowErrors.sourceType}
                              onChange={(value) =>
                                onWorkflowFieldChange(
                                  index,
                                  'sourceType',
                                  value,
                                )
                              }
                            />
                          </div>
                          <div className="mt-4 grid gap-3 md:grid-cols-3">
                            <ContextPill
                              label="Confidence"
                              value={meta.label}
                            />
                            <ContextPill
                              label="Original source"
                              value={workflow.sourceType}
                            />
                            <ContextPill
                              label="Benchmark role"
                              value={workflow.seniorityLevel}
                            />
                          </div>
                          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">
                            Why this estimate?
                          </p>
                          <textarea
                            value={workflow.rationale ?? ''}
                            onChange={(event) =>
                              onWorkflowFieldChange(
                                index,
                                'rationale',
                                event.target.value,
                              )
                            }
                            className="mt-2 min-h-[88px] w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors hover:border-gray-300 focus:border-gray-500"
                          />
                          {workflowErrors.rationale ? (
                            <p className="mt-2 text-xs text-red-500">
                              {workflowErrors.rationale}
                            </p>
                          ) : null}
                        </details>
                      </article>
                    )
                  })}
                </div>
              </section>
            </div>

            <aside className="space-y-4">
              <section className="rounded-2xl border border-gray-200 bg-[#0f172a] p-5 text-white shadow-[0_24px_60px_rgba(15,23,42,0.22)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Calculation preview
                </p>
                <div className="mt-4 grid gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs text-slate-400">
                      Monthly hours returned
                    </p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight">
                      {formatNumber(previewCalc?.totalMonthlyHours)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs text-slate-400">
                      Annual hours returned
                    </p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight">
                      {formatNumber(previewCalc?.summary?.totalAnnualHours)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs text-slate-400">
                      Operational Dividend (12 mo)
                    </p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight">
                      {formatCurrency(
                        previewCalc?.summary?.operationalDividend12mo,
                        currencyCode,
                      )}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs text-slate-400">
                      Total Financial Gain (12 mo)
                    </p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight">
                      {formatCurrency(
                        previewCalc?.summary?.totalFinancialGain12mo,
                        currencyCode,
                      )}
                    </p>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                <p className="text-sm font-medium text-gray-900">
                  What happens next
                </p>
                <p className="mt-2 text-sm leading-6 text-gray-500">
                  Once you confirm, we will generate the narrative sections,
                  render the report, save evidence, and send the PDF and email.
                  After that, the AI assistant can still change workflows,
                  rewrite report sections, adjust tone, or explain the numbers.
                </p>
              </section>
            </aside>
          </div>

          <div className="flex flex-col gap-3 border-t border-gray-100 px-6 py-5 md:flex-row md:items-center md:justify-between md:px-8">
            <button
              type="button"
              onClick={onBack}
              className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:border-gray-400 hover:text-gray-900"
            >
              Back to intake
            </button>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={onRerun}
                disabled={isSubmitting || isRerunning}
                className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:border-gray-400 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRerunning ? 'Re-running research…' : 'Re-run research'}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={isSubmitting || isRerunning}
                className="rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting
                  ? 'Creating report…'
                  : 'Confirm and create report'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
