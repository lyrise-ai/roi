// ─────────────────────────────────────────────────────────────────────────────
// workflowMutations — pure WorkflowInput[] array transforms, no LLM calls.
// Shared by agent.ts's update_workflow/add_workflow/remove_workflow chat
// tools and the validation wizard's finalize endpoint
// (pages/api/reports/[id]/validate-finalize.js), so both edit paths use
// identical matching semantics and can never drift apart.
// ─────────────────────────────────────────────────────────────────────────────

import type { WorkflowInput } from '@/src/lib/roi/types'

// Case-insensitive lookup — matches update_workflow's existing matching rule.
export function findWorkflowIndex(
  workflows: WorkflowInput[],
  name: string,
): number {
  return workflows.findIndex((w) => w.name.toLowerCase() === name.toLowerCase())
}

// Case-insensitive existence check — matches add_workflow's existing duplicate
// guard.
export function workflowExists(
  workflows: WorkflowInput[],
  name: string,
): boolean {
  return findWorkflowIndex(workflows, name) !== -1
}

// Returns `workflows` unchanged if `name` isn't found (callers that need to
// surface a not-found error check findWorkflowIndex/workflowExists first).
export function patchWorkflow(
  workflows: WorkflowInput[],
  name: string,
  patches: Partial<WorkflowInput>,
): WorkflowInput[] {
  const idx = findWorkflowIndex(workflows, name)
  if (idx === -1) return workflows
  return workflows.map((w, i) => (i !== idx ? w : { ...w, ...patches }))
}

// Exact-match removal — matches remove_workflow's existing (case-sensitive)
// matching rule.
export function removeWorkflowByName(
  workflows: WorkflowInput[],
  name: string,
): WorkflowInput[] {
  return workflows.filter((w) => w.name !== name)
}

export function appendWorkflow(
  workflows: WorkflowInput[],
  workflow: WorkflowInput,
): WorkflowInput[] {
  return [...workflows, workflow]
}
