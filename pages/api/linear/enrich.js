// POST /api/linear/enrich
// Sends a Linear Triage issue to Claude and returns structured enrichment:
// priority, deadline, assignee role, and action items.
// Called internally by /api/linear/webhook when a Triage issue is approved.
//
// Required env vars:
//   ANTHROPIC_API_KEY  — Anthropic API key
//
// TODO: map assigneeRole → real Linear user IDs once team is confirmed
// TODO: confirm priority/deadline rules with the team

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'

// Role → Linear assignee ID mapping.
// Fill these in once you know the team's Linear user IDs.
// Find them via: query { users { nodes { id, name, email } } }
const ASSIGNEE_MAP = {
  product: process.env.LINEAR_USER_PRODUCT ?? null,
  design: process.env.LINEAR_USER_DESIGN ?? null,
  engineering: process.env.LINEAR_USER_ENGINEERING ?? null,
}

const ENRICHMENT_PROMPT = (title, description, source) =>
  `
You are a product team assistant. An alpha user submitted feedback that has been approved for the backlog.
Your job is to turn this raw feedback into a structured task.

Feedback title: ${title}
Source: ${source ?? 'unknown'}
Description:
${description ?? '(no description)'}

Respond with a JSON object (no markdown, no explanation) with these exact fields:
{
  "priority": <number 1-4 where 1=urgent 2=high 3=medium 4=low>,
  "deadlineWeeks": <number of weeks from today to set as due date, or null if not time-sensitive>,
  "assigneeRole": <one of: "product", "design", "engineering">,
  "summary": <one sentence describing what needs to be done>,
  "actionItems": <array of 2-4 concrete action item strings>
}

Guidelines:
- Priority 1 (urgent): user is blocked or has a critical complaint
- Priority 2 (high): user has questions or the numbers were off — needs follow-up this sprint
- Priority 3 (medium): general feedback that should be addressed soon
- Priority 4 (low): user is impressed — log it, no immediate action needed
- assigneeRole: "product" for feature requests and feedback, "design" for UX/clarity issues, "engineering" for bugs or data accuracy
`.trim()

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end()
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    // TODO: add ANTHROPIC_API_KEY to .env.local
    console.warn('[linear/enrich] ANTHROPIC_API_KEY not set, skipping')
    return res.status(200).json({ ok: true, skipped: true })
  }

  const { title, description, source } = req.body ?? {}
  if (!title) {
    return res.status(400).json({ error: 'title is required' })
  }

  try {
    const response = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        messages: [
          {
            role: 'user',
            content: ENRICHMENT_PROMPT(title, description, source),
          },
        ],
      }),
    })

    if (!response.ok) {
      console.error('[linear/enrich] Anthropic API error:', response.status)
      return res.status(500).json({ error: 'Claude enrichment failed' })
    }

    const data = await response.json()
    const text = data.content?.[0]?.text ?? ''

    let enrichment
    try {
      enrichment = JSON.parse(text)
    } catch {
      console.error('[linear/enrich] Failed to parse Claude response:', text)
      return res
        .status(500)
        .json({ error: 'Failed to parse enrichment response' })
    }

    const dueDate = enrichment.deadlineWeeks
      ? new Date(
          Date.now() + enrichment.deadlineWeeks * 7 * 24 * 60 * 60 * 1000,
        )
          .toISOString()
          .split('T')[0]
      : null

    return res.status(200).json({
      ok: true,
      priority: enrichment.priority,
      dueDate,
      assigneeId: ASSIGNEE_MAP[enrichment.assigneeRole] ?? null,
      assigneeRole: enrichment.assigneeRole,
      summary: enrichment.summary,
      actionItems: enrichment.actionItems,
    })
  } catch (err) {
    console.error('[linear/enrich] request failed:', err)
    return res.status(500).json({ error: 'Enrichment failed' })
  }
}
