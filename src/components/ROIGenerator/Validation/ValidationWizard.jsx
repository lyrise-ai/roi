import { useCallback, useRef } from 'react'
import { useRouter } from 'next/router'
import WizardShell from './WizardShell'
import ChatPanel from './ChatPanel'
import { useValidationWizard } from './useValidationWizard'
import OverviewStep from './steps/OverviewStep'
import ConfirmWorkflowsStep from './steps/ConfirmWorkflowsStep'
import VolumeStep from './steps/VolumeStep'
import DurationStep from './steps/DurationStep'
import ContextStep from './steps/ContextStep'
import FeedbackStep from './steps/FeedbackStep'
import CompleteStep from './steps/CompleteStep'

const CHAT_QUICK_REPLIES = {
  1: ['Yes, these are right', 'I want to remove one', 'Add a workflow'],
  2: ['Volume looks right', 'Increase volume', 'Decrease volume'],
  3: ['Duration looks right', 'Takes longer than this', 'Takes less time'],
  4: [
    'Nothing else — looks good',
    'Add a seasonality note',
    'Add a team-structure note',
  ],
}

// Top-level orchestrator for the validation wizard (pages/report/[id]/validate.jsx).
// Owns the step state machine (useValidationWizard) and composes the wizard
// shell, per-step content, and the real AI chat panel. Intentionally a
// separate component tree from ReportViewer.jsx — see the implementation
// plan's routing rationale.
export default function ValidationWizard({ initialState, reportId, canSkip }) {
  const router = useRouter()
  const chatRef = useRef(null)
  const wizard = useValidationWizard(
    initialState.workflows ?? [],
    initialState.globals,
    initialState.company,
  )
  const currency = initialState.globals?.currency

  const goStep = useCallback(
    (step) => {
      wizard.goStep(step)
      wizard.setXp(Math.min(40, step * 10))
      wizard.saveDraft(reportId)
    },
    [wizard, reportId],
  )

  const handleWorkflowsChanged = useCallback(
    (workflows) => wizard.rebaseFromChat(workflows),
    [wizard],
  )

  const handleSendChat = useCallback((text) => chatRef.current?.send(text), [])

  const handleSkip = useCallback(async () => {
    try {
      await fetch(`/api/reports/${reportId}/validate-finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skipped: true }),
      })
    } catch (err) {
      console.error('[ValidationWizard] skip failed:', err)
    }
    router.push(`/report/${reportId}`)
  }, [reportId, router])

  const showChat = wizard.step >= 1 && wizard.step <= 4

  return (
    <div className="flex min-h-screen bg-[#F1F2F5]">
      <div className="flex-1">
        <WizardShell step={wizard.step} canSkip={canSkip} onSkip={handleSkip}>
          {wizard.step === 0 && (
            <OverviewStep
              wizard={wizard}
              currency={currency}
              onStart={() => goStep(1)}
            />
          )}
          {wizard.step === 1 && (
            <ConfirmWorkflowsStep
              wizard={wizard}
              currency={currency}
              onSendChat={handleSendChat}
              onBack={() => goStep(0)}
              onContinue={() => goStep(2)}
            />
          )}
          {wizard.step === 2 && (
            <VolumeStep
              wizard={wizard}
              onBack={() => goStep(1)}
              onContinue={() => goStep(3)}
            />
          )}
          {wizard.step === 3 && (
            <DurationStep
              wizard={wizard}
              onBack={() => goStep(2)}
              onContinue={() => goStep(4)}
            />
          )}
          {wizard.step === 4 && (
            <ContextStep
              wizard={wizard}
              onSendChat={handleSendChat}
              onBack={() => goStep(3)}
              onContinue={() => goStep(5)}
            />
          )}
          {wizard.step === 5 && (
            <FeedbackStep
              wizard={wizard}
              onSkip={() => goStep(6)}
              onSubmit={() => goStep(6)}
            />
          )}
          {wizard.step === 6 && (
            <CompleteStep
              wizard={wizard}
              reportId={reportId}
              currency={currency}
            />
          )}
        </WizardShell>
      </div>

      {showChat && (
        <ChatPanel
          ref={chatRef}
          reportId={reportId}
          quickReplies={CHAT_QUICK_REPLIES[wizard.step] ?? []}
          onWorkflowsChanged={handleWorkflowsChanged}
        />
      )}
    </div>
  )
}
