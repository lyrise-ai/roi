// POST /api/linear/triage
// Creates a Linear issue in the team's Triage state.
// All feedback (Sentry widget, in-app prompts) is routed here.
//
// Required env vars:
//   LINEAR_API_KEY          — Linear personal or workspace API key
//   LINEAR_TEAM_ID          — ID of the team that owns the Triage workflow
//   LINEAR_TRIAGE_STATE_ID  — ID of the Triage workflow state on that team

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end()
  }

  const apiKey = process.env.LINEAR_API_KEY
  const teamId = process.env.LINEAR_TEAM_ID
  const triageStateId = process.env.LINEAR_TRIAGE_STATE_ID

  if (!apiKey || !teamId) {
    console.warn(
      '[linear/triage] LINEAR_API_KEY or LINEAR_TEAM_ID not set, skipping',
    )
    return res.status(200).json({ ok: true, skipped: true })
  }

  const { title, description, source, priority = 3 } = req.body ?? {}

  if (!title) {
    return res.status(400).json({ error: 'title is required' })
  }

  // Linear priority: 0 = none, 1 = urgent, 2 = high, 3 = medium, 4 = low
  const clampedPriority = Math.min(4, Math.max(0, Number(priority) || 3))

  const input = {
    teamId,
    title,
    description: buildDescription(description, source),
    priority: clampedPriority,
    ...(triageStateId ? { stateId: triageStateId } : {}),
  }

  try {
    const response = await fetch(LINEAR_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: apiKey,
      },
      body: JSON.stringify({ query: CREATE_ISSUE, variables: { input } }),
    })

    const json = await response.json()

    if (!response.ok || json.errors) {
      console.error(
        '[linear/triage] API error:',
        json.errors ?? response.status,
      )
      return res.status(500).json({ error: 'Failed to create Linear issue' })
    }

    const issue = json.data?.issueCreate?.issue
    return res.status(200).json({
      ok: true,
      issueId: issue?.id,
      issueUrl: issue?.url,
      identifier: issue?.identifier,
    })
  } catch (err) {
    console.error('[linear/triage] request failed:', err)
    return res.status(500).json({ error: 'Failed to create Linear issue' })
  }
}

function buildDescription(description, source) {
  const lines = []

  if (source) {
    lines.push(`**Source:** ${source}`, '')
  }

  if (description) {
    lines.push(description)
  }

  lines.push(
    '',
    '---',
    '*Routed automatically from user feedback. Approve to move into backlog.*',
  )

  return lines.join('\n')
}
