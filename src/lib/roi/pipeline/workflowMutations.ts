// ─────────────────────────────────────────────────────────────────────────────
// workflowMutations — plain functions that add to, edit and remove from the
// list of workflows. No model calls.
// Both edit paths use these: the chat tools in agent.ts, and the wizard's finish
// step (pages/api/reports/[id]/validate-finalize.js). So the two match names the
// same way and can never drift apart.
// ─────────────────────────────────────────────────────────────────────────────

import type { WorkflowInput } from '@/src/lib/roi/types'

// Finds a workflow by name, ignoring capitalisation, with a careful loose match
// for when the model renames things slightly ("Proposal Drafting" versus
// "Proposal Drafting and Tailoring"). An exact match always wins. A partial
// match is only trusted when it points at exactly one workflow, so an
// ambiguous name never quietly edits the wrong one.
export function findWorkflowIndex(
  workflows: WorkflowInput[],
  name: string,
): number {
  const query = name.toLowerCase().trim()

  const exact = workflows.findIndex((w) => w.name.toLowerCase() === query)
  if (exact !== -1) return exact

  const contains = workflows.reduce<number[]>((acc, w, i) => {
    const wname = w.name.toLowerCase()
    if (wname.includes(query) || query.includes(wname)) acc.push(i)
    return acc
  }, [])
  if (contains.length === 1) return contains[0]

  const startsWith = workflows.reduce<number[]>((acc, w, i) => {
    const wname = w.name.toLowerCase()
    if (wname.startsWith(query) || query.startsWith(wname)) acc.push(i)
    return acc
  }, [])
  if (startsWith.length === 1) return startsWith[0]

  return -1
}

// Is there already a workflow with this name, ignoring capitalisation? Same
// check add_workflow uses to refuse duplicates.
export function workflowExists(
  workflows: WorkflowInput[],
  name: string,
): boolean {
  return findWorkflowIndex(workflows, name) !== -1
}

// Returns the list unchanged if the name is not found. Callers that need to
// report "no such workflow" check with the two functions above first.
export function patchWorkflow(
  workflows: WorkflowInput[],
  name: string,
  patches: Partial<WorkflowInput>,
): WorkflowInput[] {
  const idx = findWorkflowIndex(workflows, name)
  if (idx === -1) return workflows
  return workflows.map((w, i) => (i !== idx ? w : { ...w, ...patches }))
}

// Removes by exact name, capitalisation included — the same rule
// remove_workflow already used.
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
