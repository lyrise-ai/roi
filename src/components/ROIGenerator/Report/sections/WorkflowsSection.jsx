import { useReportUI } from '../ReportUIContext'
import StatusPill from '../shared/StatusPill'
import AssumptionPopover from '../shared/AssumptionPopover'

function WorkflowRow({ index, workflow }) {
  const { openWorkflow, setOpenWorkflow } = useReportUI()
  const isOpen = openWorkflow === index

  return (
    <div className="mb-2.5 rounded-xl border border-[#E5E7EB] bg-white">
      <button
        type="button"
        onClick={() => setOpenWorkflow((cur) => (cur === index ? null : index))}
        className="flex w-full items-center justify-between gap-3.5 px-[18px] py-[15px] text-left"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-[7px] w-[7px] shrink-0 rounded-full bg-[#5B48F8]" />
          <div className="min-w-0">
            <div className="text-[13.5px] font-bold text-[#0F172A]">
              {workflow.name}
            </div>
            <div className="mt-0.5 text-[11.5px] text-[#9CA3AF]">
              {workflow.agent}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-[22px]">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.04em] text-[#9CA3AF]">
              hrs saved/mo
            </div>
            <div className="text-sm font-bold text-[#0F172A]">
              {workflow.hrsSaved}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.04em] text-[#9CA3AF]">
              value/mo
            </div>
            <div className="text-[14.5px] font-bold text-[#5B48F8]">
              {workflow.valueLabel}
            </div>
          </div>
          <div className="w-3.5 text-center text-[11px] text-[#9CA3AF]">
            {isOpen ? '▴' : '▾'}
          </div>
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-[#F3F4F6] px-[18px] pb-5 pt-1">
          <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-5">
            <div>
              <div className="mb-2 text-[11px] text-[#9CA3AF]">
                Before AI · {workflow.before.toFixed(2)} hrs
              </div>
              <div className="mb-3 h-2 w-full rounded-[5px] bg-[#F1F2F5]">
                <div className="h-2 w-full rounded-[5px] bg-[#94A3B8]" />
              </div>
              <div className="mb-2 text-[11px] text-[#9CA3AF]">
                After AI · {workflow.after.toFixed(2)} hrs
              </div>
              <div className="h-2 w-full rounded-[5px] bg-[#F1F2F5]">
                <div
                  className="h-2 rounded-[5px] bg-[#5B48F8]"
                  style={{ width: `${workflow.afterPct}%` }}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2.5">
              <div>
                <div className="mb-1 text-[11px] font-bold text-[#0F172A]">
                  Target outcome
                </div>
                <div className="text-[12.5px] leading-[1.55] text-[#4B5563]">
                  {workflow.targetOutcome}
                </div>
              </div>
              <div>
                <div className="mb-1 text-[11px] font-bold text-[#0F172A]">
                  Why it fits
                </div>
                <div className="text-[12.5px] leading-[1.55] text-[#4B5563]">
                  {workflow.whyFits}
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-[#F3F4F6] pt-3.5">
            <div className="rounded-[7px] bg-[#F5F3FF] px-[11px] py-[7px] text-[11.5px] text-[#4B5563]">
              {workflow.formula}
            </div>
            <StatusPill
              id={`wf-status-${index}`}
              status={workflow.status}
              label={`${workflow.status} · ${workflow.role}`}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default function WorkflowsSection({ workflows, totals }) {
  return (
    <div className="rounded-[14px] border border-[#E5E7EB] bg-white px-[30px] py-[26px]">
      <div className="mb-1 text-base font-bold text-[#0F172A]">
        Proposed AI workflows
      </div>
      <div className="mb-[18px] text-[13px] text-[#9CA3AF]">
        The workflows we&apos;d automate first. Click any row to see the
        before/after detail and how the numbers are derived.
      </div>

      {workflows.map((w, i) => (
        <WorkflowRow key={w.name} index={i} workflow={w} />
      ))}

      <div className="mt-1.5 flex items-center justify-between rounded-xl bg-[#0F172A] px-5 py-4">
        <div className="text-[12.5px] font-semibold text-white/60">
          Totals — across {workflows.length} workflow
          {workflows.length === 1 ? '' : 's'}
        </div>
        <AssumptionPopover
          id="wf-totals"
          formula={totals.formula}
          steps={totals.steps}
          result={totals.result}
          placement="bottom-right"
        >
          <span className="flex items-center gap-[18px]">
            <span className="border-b-2 border-dashed border-white/35 text-sm font-bold text-white">
              {totals.hrs}
            </span>
            <span className="border-b-2 border-dashed border-[rgba(196,181,253,0.5)] text-sm font-bold text-[#C9BFFF]">
              {totals.monthlyValue}
            </span>
          </span>
        </AssumptionPopover>
      </div>
    </div>
  )
}
