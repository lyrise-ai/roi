// ─────────────────────────────────────────────────────────────────────────────
// workflowMutations — pure WorkflowInput[] array transforms, no LLM calls.
// Shared by agent.ts's update_workflow/add_workflow/remove_workflow chat
// tools and the validation wizard's finalize endpoint
// (pages/api/reports/[id]/validate-finalize.js), so both edit paths use
// identical matching semantics and can never drift apart.
// ─────────────────────────────────────────────────────────────────────────────

import type { WorkflowInput } from '@/src/lib/roi/types'

// Case-insensitive lookup, with a bounded fuzzy fallback for LLM name drift
// (e.g. "Proposal Drafting" vs "Proposal Drafting and Tailoring"). Exact
// match wins first; a substring/prefix match is only trusted when it
// resolves to exactly one workflow, so an ambiguous partial name never
// silently edits the wrong one.
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
