import { useCallback, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { parseBulkCsv, validateBulkRow } from '@/src/lib/roi/bulk/parseBulkCsv'
import { dedupByCompany } from '@/src/lib/roi/bulk/dedupRows'
import { mapRowToFormPayload } from '@/src/lib/roi/bulk/mapRowToFormPayload'
import { createBulkSession } from '@/src/hooks/useBulkSession'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const EDITABLE_FIELDS = [
  { key: 'companyName', label: 'Company name', required: true },
  { key: 'recipientFirstName', label: 'Contact name' },
  { key: 'recipientTitle', label: 'Title' },
  { key: 'email', label: 'Email', required: true },
  { key: 'employees', label: 'Employee count', inputMode: 'numeric' },
  {
    key: 'annualRevenue',
    label: 'Annual revenue',
    inputMode: 'decimal',
  },
  { key: 'country', label: 'Country' },
  { key: 'industry', label: 'Industry' },
  { key: 'website', label: 'Website' },
]

function EditRowModal({ row, onSave, onCancel }) {
  const [draft, setDraft] = useState(() => ({
    companyName: row.companyName || '',
    recipientFirstName: `${row.recipientFirstName || ''} ${
      row.recipientLastName || ''
    }`.trim(),
    recipientTitle: row.recipientTitle || '',
    email: row.email || '',
    employees: row.employees || '',
    annualRevenue: row.annualRevenue || '',
    country: row.country || '',
    industry: row.industry || '',
    website: row.website || '',
  }))

  const canSave =
    draft.companyName.trim().length > 0 && EMAIL_RE.test(draft.email.trim())

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-bold text-[#2C2C2C]">Edit row</h2>
        <div className="space-y-3">
          {EDITABLE_FIELDS.map((field) => (
            <div key={field.key} className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                {field.label}
                {field.required && <span className="text-red-500"> *</span>}
              </label>
              <input
                type="text"
                value={draft[field.key]}
                inputMode={field.inputMode}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, [field.key]: e.target.value }))
                }
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-500"
              />
            </div>
          ))}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-800"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() =>
              onSave({
                companyName: draft.companyName.trim(),
                recipientFirstName: draft.recipientFirstName.trim(),
                recipientLastName: '',
                recipientTitle: draft.recipientTitle.trim(),
                email: draft.email.trim().toLowerCase(),
                employees: draft.employees.trim().replace(/[,\s]/g, ''),
                annualRevenue: draft.annualRevenue
                  .trim()
                  .replace(/[^0-9.]/g, ''),
                country: draft.country.trim(),
                industry: draft.industry.trim(),
                website: draft.website.trim(),
              })
            }
            className="rounded-full bg-[#2C2C2C] px-5 py-2 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function getRowStatus(row, skipped, index) {
  const hasErrors = row.issues.some((issue) => issue.severity === 'error')
  if (hasErrors) return 'blocked'
  if (skipped.has(index)) return 'skipped'

  const hasWarnings = row.issues.some((issue) => issue.severity === 'warning')
  return hasWarnings ? 'warning' : 'ready'
}

const STATUS_LABELS = {
  ready: 'Ready',
  warning: 'Needs context',
  blocked: 'Blocked',
  skipped: 'Skipped',
}

const STATUS_BADGES = {
  ready: 'bg-[#EEF4FF] text-[#2957FF]',
  warning: 'bg-amber-100 text-amber-700',
  blocked: 'bg-red-100 text-red-700',
  skipped: 'bg-gray-100 text-gray-600',
}

const STATUS_ROW_CLASSES = {
  ready: '',
  warning: 'bg-amber-50/30',
  blocked: 'bg-red-50/30',
  skipped: 'bg-gray-50',
}

export default function BulkIntake() {
  const router = useRouter()
  const fileInputRef = useRef(null)
  const [rawCount, setRawCount] = useState(0)
  const [rows, setRows] = useState([])
  const [detectedColumns, setDetectedColumns] = useState({})
  const [fileWarnings, setFileWarnings] = useState([])
  const [fileErrors, setFileErrors] = useState([])
  const [skipped, setSkipped] = useState(new Set())
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState(null)
  const [editingIndex, setEditingIndex] = useState(null)
  const [emailMode, setEmailMode] = useState('production')
  const [overrideEmail, setOverrideEmail] = useState('')
  const [showDetectedColumns, setShowDetectedColumns] = useState(false)

  const handleFiles = useCallback(async (file) => {
    if (!file) return

    setError(null)
    setParsing(true)

    try {
      const parsed = await parseBulkCsv(file)
      const deduped = dedupByCompany(parsed.rows)

      setRawCount(parsed.rows.length)
      setRows(deduped.rows)
      setDetectedColumns(parsed.detectedColumns)
      setFileWarnings([...parsed.fileWarnings, ...deduped.warnings])
      setFileErrors(parsed.fileErrors)
      setSkipped(new Set())
      setShowDetectedColumns(false)
    } catch (err) {
      setError(err?.message ?? 'Could not parse this CSV.')
      setRawCount(0)
      setRows([])
      setDetectedColumns({})
      setFileWarnings([])
      setFileErrors([])
      setSkipped(new Set())
      setShowDetectedColumns(false)
    } finally {
      setParsing(false)
    }
  }, [])

  const onPick = (e) => {
    const file = e.target.files?.[0]
    if (file) handleFiles(file)
    e.target.value = ''
  }

  const onDrop = (e) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) handleFiles(file)
  }

  // Inclusion is controlled by the `skipped` Set; `isChecked` is derived as
  // `status !== 'blocked' && status !== 'skipped'`. Toggling always flips the
  // skipped membership — blocked rows ignore the checkbox (disabled), and
  // editing a blocked row re-validates it, removes it from skipped if present,
  // and may change its status to ready/warning so it becomes auto-included.
  const toggleRow = (index) => {
    setSkipped((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const saveEdit = (patch) => {
    setRows((prev) =>
      prev.map((row, index) =>
        index === editingIndex
          ? validateBulkRow({
              ...row,
              ...patch,
            })
          : row,
      ),
    )

    setSkipped((prev) => {
      if (!prev.has(editingIndex)) return prev
      const next = new Set(prev)
      next.delete(editingIndex)
      return next
    })

    setEditingIndex(null)
  }

  const selectableRows = useMemo(
    () =>
      rows.map((row, index) => {
        const payload = mapRowToFormPayload(row)
        const status = getRowStatus(row, skipped, index)

        return {
          row,
          payload,
          index,
          status,
          disabled: status === 'blocked',
        }
      }),
    [rows, skipped],
  )

  const selectedPayloads = useMemo(
    () =>
      selectableRows
        .filter(({ status }) => status !== 'blocked' && status !== 'skipped')
        .map(({ payload }) => payload),
    [selectableRows],
  )

  const summary = useMemo(() => {
    const counts = {
      ready: 0,
      warning: 0,
      blocked: 0,
      skipped: 0,
    }

    selectableRows.forEach(({ status }) => {
      counts[status] += 1
    })

    return counts
  }, [selectableRows])

  const overrideValid =
    emailMode === 'production' ||
    (overrideEmail.trim().length > 0 && EMAIL_RE.test(overrideEmail.trim()))

  const selectionSummary =
    selectedPayloads.length === 0
      ? 'No companies selected yet'
      : `${selectedPayloads.length} ${
          selectedPayloads.length === 1 ? 'company is' : 'companies are'
        } ready to generate`

  const onGenerate = () => {
    if (selectedPayloads.length === 0 || !overrideValid) return

    const sessionId = createBulkSession(selectedPayloads, {
      emailOverride:
        emailMode === 'override' ? overrideEmail.trim().toLowerCase() : null,
    })

    router.push(`/roi-report/bulk/${sessionId}`)
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
      <div className="mb-6 flex items-center justify-between sm:mb-8">
        <div>
          <Link
            href="/dashboard"
            className="text-xs text-gray-500 hover:text-gray-800"
          >
            Back to dashboard
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-[#2C2C2C]">
            Bulk Upload
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Upload a CSV to generate ROI reports for each company.
          </p>
        </div>
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className="cursor-pointer rounded-2xl border-2 border-dashed border-gray-200 bg-white px-6 py-10 text-center transition-colors hover:border-gray-400 sm:px-8 sm:py-12"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={onPick}
          className="hidden"
        />
        <p className="text-sm font-semibold text-[#2C2C2C]">
          {parsing ? 'Parsing CSV...' : 'Drop your CSV here or click to browse'}
        </p>
        <p className="mt-1 text-xs text-gray-400">
          We detect common column names automatically. Required data per usable
          row: company name and email.
        </p>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {(fileErrors.length > 0 || fileWarnings.length > 0) && (
        <div className="mt-4 space-y-2">
          {fileErrors.map((message) => (
            <div
              key={message}
              className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {message}
            </div>
          ))}
          {fileWarnings.map((message) => (
            <div
              key={message}
              className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800"
            >
              {message}
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl bg-[#F9FAFC] px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  Ready
                </div>
                <div className="mt-1 text-2xl font-bold text-[#2C2C2C]">
                  {summary.ready}
                </div>
              </div>
              <div className="rounded-xl bg-[#F9FAFC] px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  Needs context
                </div>
                <div className="mt-1 text-2xl font-bold text-amber-600">
                  {summary.warning}
                </div>
              </div>
              <div className="rounded-xl bg-[#F9FAFC] px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  Blocked
                </div>
                <div className="mt-1 text-2xl font-bold text-red-600">
                  {summary.blocked}
                </div>
              </div>
              <div className="rounded-xl bg-[#F9FAFC] px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  Skipped
                </div>
                <div className="mt-1 text-2xl font-bold text-gray-500">
                  {summary.skipped}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-gray-100 bg-white px-4 py-4 shadow-sm sm:px-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <p className="text-sm text-gray-500">
                Parsed {rawCount} {rawCount === 1 ? 'row' : 'rows'} {'->'}{' '}
                <span className="font-semibold text-[#2C2C2C]">
                  {rows.length} unique{' '}
                  {rows.length === 1 ? 'company' : 'companies'}
                </span>{' '}
                {'·'} {selectedPayloads.length} selected
              </p>
              {Object.keys(detectedColumns).length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowDetectedColumns((prev) => !prev)}
                  className="self-start text-xs font-semibold text-[#2957FF] hover:underline"
                >
                  {showDetectedColumns
                    ? 'Hide detected mapping'
                    : 'View detected mapping'}
                </button>
              )}
            </div>

            {showDetectedColumns && Object.keys(detectedColumns).length > 0 && (
              <div className="mt-4 border-t border-gray-100 pt-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  Detected columns
                </p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(detectedColumns)
                    .filter(([, value]) => value)
                    .map(([field, value]) => (
                      <span
                        key={field}
                        className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600"
                      >
                        {field}: {value}
                      </span>
                    ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 rounded-2xl border border-gray-100 bg-white px-4 py-4 shadow-sm sm:px-5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Email delivery
            </p>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-start gap-2 sm:items-center">
                <input
                  type="radio"
                  name="emailMode"
                  value="production"
                  checked={emailMode === 'production'}
                  onChange={() => setEmailMode('production')}
                  className="h-4 w-4"
                />
                <span className="text-sm text-[#2C2C2C]">
                  Send to production recipients
                </span>
                <span className="pt-0.5 text-xs text-gray-400 sm:pt-0">
                  each report goes to its contact email
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="radio"
                  name="emailMode"
                  value="override"
                  checked={emailMode === 'override'}
                  onChange={() => setEmailMode('override')}
                  className="mt-1 h-4 w-4"
                />
                <div className="flex-1">
                  <div className="text-sm text-[#2C2C2C]">
                    Send to another email
                    <span className="ml-1 text-xs text-gray-400">
                      all reports go to one address
                    </span>
                  </div>
                  {emailMode === 'override' && (
                    <input
                      type="email"
                      value={overrideEmail}
                      onChange={(e) => setOverrideEmail(e.target.value)}
                      placeholder="elena@lyrise.ai"
                      className="mt-2 w-full max-w-xs rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-500"
                    />
                  )}
                </div>
              </label>
            </div>
          </div>

          <div className="mt-6 space-y-3 md:hidden">
            {selectableRows.map(({ row, payload, disabled, index, status }) => {
              const visibleIssues = row.issues.slice(0, 2)
              const isChecked = status !== 'blocked' && status !== 'skipped'

              return (
                <div
                  key={`${row.rawRowIndex}-${index}-mobile`}
                  className={`rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ${STATUS_ROW_CLASSES[status]}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={disabled}
                        onChange={() => toggleRow(index)}
                        className="mt-1 h-4 w-4"
                      />
                      <div>
                        <div className="font-medium text-[#2C2C2C]">
                          {payload.companyName || (
                            <span className="text-red-600">
                              missing - click Edit
                            </span>
                          )}
                        </div>
                        {payload.industry && (
                          <div className="mt-1 text-xs text-gray-400">
                            {payload.industry}
                          </div>
                        )}
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_BADGES[status]}`}
                    >
                      {STATUS_LABELS[status]}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                        Contact
                      </div>
                      <div className="mt-1 text-sm font-medium text-[#2C2C2C]">
                        {payload.recipientName || '-'}
                      </div>
                      {payload.recipientTitle && (
                        <div className="mt-1 text-xs text-gray-500">
                          {payload.recipientTitle}
                        </div>
                      )}
                      <div className="mt-1 break-all text-xs text-gray-400">
                        {payload.email || (
                          <span className="text-red-600">
                            no email - click Edit
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                          Country
                        </div>
                        <div className="mt-1 text-sm text-gray-600">
                          {payload.country || '-'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                          Currency
                        </div>
                        <div className="mt-1">
                          <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-[#2957FF]">
                            {payload.currency}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {visibleIssues.length > 0 && (
                    <div className="mt-4 space-y-1">
                      {visibleIssues.map((issue) => (
                        <div
                          key={`${issue.field}-${issue.message}-mobile`}
                          className={`text-[11px] ${
                            issue.severity === 'error'
                              ? 'text-red-600'
                              : 'text-amber-700'
                          }`}
                        >
                          {issue.message}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setEditingIndex(index)}
                      className="text-xs font-semibold text-[#2957FF] hover:underline"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-6 hidden overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-3" />
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Company
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Contact
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Country
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Currency
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {selectableRows.map(
                  ({ row, payload, disabled, index, status }) => {
                    const visibleIssues = row.issues.slice(0, 2)
                    const isChecked =
                      status !== 'blocked' && status !== 'skipped'

                    return (
                      <tr
                        key={`${row.rawRowIndex}-${index}`}
                        className={`border-b border-gray-50 ${STATUS_ROW_CLASSES[status]}`}
                      >
                        <td className="px-4 py-4 align-top">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={disabled}
                            onChange={() => toggleRow(index)}
                            className="mt-1 h-4 w-4"
                          />
                        </td>
                        <td className="px-4 py-4 text-[#2C2C2C]">
                          <div className="font-medium">
                            {payload.companyName || (
                              <span className="text-red-600">
                                missing - click Edit
                              </span>
                            )}
                          </div>
                          {payload.industry && (
                            <div className="mt-1 text-xs text-gray-400">
                              {payload.industry}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4 text-gray-600">
                          <div className="font-medium text-[#2C2C2C]">
                            {payload.recipientName || '-'}
                          </div>
                          {payload.recipientTitle && (
                            <div className="mt-1 text-xs text-gray-500">
                              {payload.recipientTitle}
                            </div>
                          )}
                          <div className="mt-1 text-xs text-gray-400">
                            {payload.email || (
                              <span className="text-red-600">
                                no email - click Edit
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-gray-500">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_BADGES[status]}`}
                          >
                            {STATUS_LABELS[status]}
                          </span>
                          {visibleIssues.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {visibleIssues.map((issue) => (
                                <div
                                  key={`${issue.field}-${issue.message}`}
                                  className={`text-[11px] ${
                                    issue.severity === 'error'
                                      ? 'text-red-600'
                                      : 'text-amber-700'
                                  }`}
                                >
                                  {issue.message}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4 text-gray-500">
                          {payload.country || '-'}
                        </td>
                        <td className="px-4 py-4 text-gray-500">
                          <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-[#2957FF]">
                            {payload.currency}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => setEditingIndex(index)}
                            className="text-xs font-semibold text-[#2957FF] hover:underline"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    )
                  },
                )}
              </tbody>
            </table>
          </div>

          <div className="sticky bottom-3 z-10 mt-4 rounded-2xl border border-gray-100 bg-white/95 px-4 py-4 shadow-sm backdrop-blur sm:static sm:px-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-[#2C2C2C]">
                  {selectionSummary}
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  Review blocked rows before generating, warning rows can still
                  be included.
                </p>
                {emailMode === 'override' && !overrideValid && (
                  <p className="mt-1 text-xs text-red-500">
                    Enter a valid override email
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onGenerate}
                disabled={selectedPayloads.length === 0 || !overrideValid}
                className="w-full rounded-full bg-[#2C2C2C] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:bg-gray-300 sm:w-auto"
              >
                Generate {selectedPayloads.length}{' '}
                {selectedPayloads.length === 1 ? 'Report' : 'Reports'} {'->'}
              </button>
            </div>
          </div>
        </>
      )}

      {editingIndex !== null && rows[editingIndex] && (
        <EditRowModal
          row={rows[editingIndex]}
          onSave={saveEdit}
          onCancel={() => setEditingIndex(null)}
        />
      )}
    </div>
  )
}
