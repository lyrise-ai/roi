// POST /api/linear/webhook
// Receives Linear webhook events. When a Triage issue is approved (moves out
// of the Triage state), calls Claude to enrich it and updates the Linear issue
// with priority, due date, and assignee.
//
// Required env vars:
//   LINEAR_WEBHOOK_SECRET   — from Linear Settings → API → Webhooks
//   LINEAR_API_KEY          — Linear API key (same as used in triage.js)
//   LINEAR_TRIAGE_STATE_ID  — ID of the Triage state (issues leaving this state are enriched)
//
// To register the webhook in Linear:
//   Settings → API → Webhooks → Create webhook
//   URL: https://your-domain.com/api/linear/webhook
//   Events: Issue (update)

import crypto from 'node:crypto'

const LINEAR_API = 'https://api.linear.app/graphql'

const UPDATE_ISSUE = `
  mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
    issueUpdate(id: $id, input: $input) {
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

  // Verify Linear webhook signature
  const webhookSecret = process.env.LINEAR_WEBHOOK_SECRET
  if (webhookSecret) {
    const signature = req.headers['linear-signature']
    const body = JSON.stringify(req.body)
    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex')

    if (signature !== expected) {
      return res.status(401).json({ error: 'Invalid webhook signature' })
    }
  } else {
    // TODO: set LINEAR_WEBHOOK_SECRET in .env.local once webhook is registered
    console.warn(
      '[linear/webhook] LINEAR_WEBHOOK_SECRET not set, skipping signature check',
    )
  }

  const { action, type, data } = req.body ?? {}

  // Only process issue updates
  if (type !== 'Issue' || action !== 'update') {
    return res.status(200).json({ ok: true, ignored: true })
  }

  const triageStateId = process.env.LINEAR_TRIAGE_STATE_ID
  const movedOutOfTriage =
    triageStateId && data?.updatedFrom?.stateId === triageStateId

  if (!movedOutOfTriage) {
    return res.status(200).json({ ok: true, ignored: true })
  }

  // Issue was just approved out of Triage — enrich it with Claude
  const { id: issueId, title, description } = data

  let enrichment
  try {
    const enrichRes = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'}/api/linear/enrich`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          source: 'Linear Triage approval',
        }),
      },
    )
    enrichment = await enrichRes.json()
  } catch (err) {
    console.error('[linear/webhook] enrichment call failed:', err)
    return res.status(500).json({ error: 'Enrichment failed' })
  }

  if (enrichment.skipped) {
    return res.status(200).json({ ok: true, skipped: true })
  }

  // Update the Linear issue with enriched data
  const apiKey = process.env.LINEAR_API_KEY
  if (!apiKey) {
    return res.status(200).json({ ok: true, skipped: true })
  }

  const input = {
    priority: enrichment.priority,
    ...(enrichment.dueDate ? { dueDate: enrichment.dueDate } : {}),
    ...(enrichment.assigneeId ? { assigneeId: enrichment.assigneeId } : {}),
    ...(enrichment.actionItems?.length
      ? {
          description: [
            description ?? '',
            '',
            '## Action Items',
            ...enrichment.actionItems.map((item) => `- ${item}`),
            '',
            `**Summary:** ${enrichment.summary}`,
          ].join('\n'),
        }
      : {}),
  }

  try {
    const updateRes = await fetch(LINEAR_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: apiKey,
      },
      body: JSON.stringify({
        query: UPDATE_ISSUE,
        variables: { id: issueId, input },
      }),
    })

    const json = await updateRes.json()

    if (json.errors) {
      console.error('[linear/webhook] issue update failed:', json.errors)
      return res.status(500).json({ error: 'Failed to update Linear issue' })
    }

    return res.status(200).json({ ok: true, issueId })
  } catch (err) {
    console.error('[linear/webhook] update request failed:', err)
    return res.status(500).json({ error: 'Failed to update Linear issue' })
  }
}
