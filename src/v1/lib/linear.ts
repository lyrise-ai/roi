// ─────────────────────────────────────────────────────────────────────────────
// linear — creates issues in the team's Triage column.
//
// Env:
//   LINEAR_API_KEY            personal or workspace API key
//   LINEAR_TEAM_ID            team that owns the Triage workflow
//   LINEAR_TRIAGE_STATE_ID    optional; the Triage workflow state on that team
//   LINEAR_BUG_LABEL_ID       optional; label applied to automated error issues
//
// When the keys are missing it reports that it skipped, rather than throwing.
// An environment with nothing set up goes quiet instead of returning errors.
// ─────────────────────────────────────────────────────────────────────────────

const LINEAR_API = 'https://api.linear.app/graphql'

const CREATE_ISSUE = `
  mutation IssueCreate($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue {
        id
        identifier
        url
      }
    }
  }
`

export interface CreateIssueResult {
  ok: boolean
  skipped?: boolean
  issueId?: string
  issueUrl?: string
  identifier?: string
  error?: string
}

export async function createLinearIssue(opts: {
  title: string
  description: string
  /** Linear scale: 0 none, 1 urgent, 2 high, 3 medium, 4 low. */
  priority?: number
  labelIds?: string[]
}): Promise<CreateIssueResult> {
  const apiKey = process.env.LINEAR_API_KEY
  const teamId = process.env.LINEAR_TEAM_ID

  if (!apiKey || !teamId) {
    console.warn('[linear] LINEAR_API_KEY or LINEAR_TEAM_ID not set, skipping')
    return { ok: true, skipped: true }
  }

  const triageStateId = process.env.LINEAR_TRIAGE_STATE_ID
  const labelIds = (opts.labelIds ?? []).filter(Boolean)

  const input = {
    teamId,
    title: opts.title.slice(0, 250),
    description: opts.description,
    priority: Math.min(4, Math.max(0, Number(opts.priority) || 3)),
    ...(triageStateId ? { stateId: triageStateId } : {}),
    ...(labelIds.length ? { labelIds } : {}),
  }

  try {
    const response = await fetch(LINEAR_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: apiKey,
      },
      body: JSON.stringify({ query: CREATE_ISSUE, variables: { input } }),
      signal: AbortSignal.timeout(10_000),
    })

    const json = await response.json()

    if (!response.ok || json.errors) {
      console.error('[linear] API error:', json.errors ?? response.status)
      return { ok: false, error: 'Failed to create Linear issue' }
    }

    const issue = json.data?.issueCreate?.issue
    return {
      ok: true,
      issueId: issue?.id,
      issueUrl: issue?.url,
      identifier: issue?.identifier,
    }
  } catch (err) {
    console.error('[linear] request failed:', err)
    return { ok: false, error: 'Failed to create Linear issue' }
  }
}
