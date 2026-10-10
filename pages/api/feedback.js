/* eslint-disable no-console */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Expecting 'answers' object instead of single 'rating'
  const { submissionId, answers, comment } = req.body

  if (!submissionId) {
    return res.status(400).json({ error: 'Missing submission ID' })
  }

  try {
    const n8nUrl = process.env.N8N_FEEDBACK_WEBHOOK_URL

    if (!n8nUrl) {
      console.error('N8N_FEEDBACK_WEBHOOK_URL is not defined')
      return res.status(500).json({ error: 'Server configuration error' })
    }

    const response = await fetch(n8nUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissionId, answers, comment }),
    })

    if (!response.ok) {
      console.error(`N8N responded with ${response.status}`)
      return res
        .status(500)
        .json({ error: 'Failed to submit feedback downstream' })
    }

    return res.status(200).json({ success: true })
  } catch (error) {
    console.error('Feedback proxy error:', error)
    return res.status(500).json({ error: 'Failed to submit feedback' })
  }
}
