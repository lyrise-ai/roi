import { generateText } from 'ai'
import { createAdminClient, createClient } from '../../src/lib/supabase-server'
import { fastModel } from '@/src/lib/roi/llm'
import { isEmployeeUser } from '@/src/lib/isEmployee'

const CHAT_LIMIT = 5
const MAX_MESSAGE_LENGTH = 1000
const HISTORY_WINDOW = 20 // messages pulled from DB for context

export default async function handler(req, res) {
  if (req.method === 'GET') return handleGet(req, res)
  if (req.method === 'POST') return handlePost(req, res)
  return res.status(405).json({ error: 'Method not allowed' })
}

// ── GET /api/chat?reportId=xxx — load existing conversation ──────────────────

async function handleGet(req, res) {
  const supabase = createClient(req, res)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const { reportId } = req.query
  if (!reportId) return res.status(400).json({ error: 'reportId is required' })

  const admin = createAdminClient()
  const [{ data: userData }, { data: report }] = await Promise.all([
    admin.from('users').select('role').eq('id', user.id).single(),
    supabase.from('reports').select('user_id').eq('id', reportId).single(),
  ])

  const isEmployee = isEmployeeUser(user, userData)

  if (!report || (report.user_id !== user.id && !isEmployee)) {
    return res.status(403).json({ error: 'Unauthorized' })
  }

  let messagesQuery = supabase
    .from('chat_messages')
    .select('role, content')
    .eq('report_id', reportId)
    .order('created_at', { ascending: true })

  if (!isEmployee) messagesQuery = messagesQuery.eq('user_id', user.id)

  const { data: messages } = await messagesQuery

  return res.status(200).json({ messages: messages ?? [] })
}

// ── POST /api/chat — send a message ─────────────────────────────────────────

async function handlePost(req, res) {
  const supabase = createClient(req, res)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const { reportId, message } = req.body

  // ── Fix 5: validate input + length guard ───────────────────────────────────
  if (!reportId || typeof reportId !== 'string') {
    return res.status(400).json({ error: 'reportId is required' })
  }
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' })
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({
      error: `Message must be ${MAX_MESSAGE_LENGTH} characters or less`,
    })
  }

  // ── Step 1: get user role + Fix 3: report ownership ───────────────────────
  const admin = createAdminClient()
  const [{ data: userData }, { data: report }] = await Promise.all([
    admin.from('users').select('role').eq('id', user.id).single(),
    supabase
      .from('reports')
      .select('input_data, company_name, user_id')
      .eq('id', reportId)
      .single(),
  ])

  const isEmployee = isEmployeeUser(user, userData)

  if (!report) {
    return res.status(404).json({ error: 'Report not found' })
  }
  // Fix 3: only the report owner (or any employee) can chat about a report
  if (report.user_id !== user.id && !isEmployee) {
    return res.status(403).json({ error: 'Unauthorized' })
  }

  // ── Fix 3: throttle — must run before the increment to avoid burning a slot ─
  const { data: lastMsg } = await supabase
    .from('chat_messages')
    .select('created_at')
    .eq('report_id', reportId)
    .eq('user_id', user.id)
    .eq('role', 'user')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (lastMsg) {
    const msSinceLast = Date.now() - new Date(lastMsg.created_at).getTime()
    if (msSinceLast < 2000) {
      return res
        .status(429)
        .json({ error: 'Please wait a moment before sending another message' })
    }
  }

  // ── Steps 2–5: enforce limit for non-employees ─────────────────────────────
  if (!isEmployee) {
    const { data: usage } = await supabase
      .from('chat_usage')
      .select('id, message_count')
      .eq('user_id', user.id)
      .eq('report_id', reportId)
      .single()

    if (usage && usage.message_count >= CHAT_LIMIT) {
      // Fix 4: fire analytics when a blocked request arrives (limit already hit)
      supabase
        .from('events')
        .insert({
          user_id: user.id,
          report_id: reportId,
          type: 'chat_limit_reached',
        })
        .then(() => {})
      return res.status(403).json({ error: 'limit_reached' })
    }

    if (usage) {
      // Atomic conditional increment — targets by natural key so the WHERE clause
      // is evaluated against the live DB value, not the stale client-read value.
      // Only succeeds if message_count is still < CHAT_LIMIT at execution time.
      const { data: updated } = await supabase
        .from('chat_usage')
        .update({ message_count: usage.message_count + 1 })
        .eq('user_id', user.id)
        .eq('report_id', reportId)
        .lt('message_count', CHAT_LIMIT)
        .select()
        .single()

      if (!updated) {
        // Fire-and-forget analytics event (Fix 4 — also in the early-exit branch below)
        supabase
          .from('events')
          .insert({
            user_id: user.id,
            report_id: reportId,
            type: 'chat_limit_reached',
          })
          .then(() => {})
        return res.status(403).json({ error: 'limit_reached' })
      }
    } else {
      // Fix 1: upsert instead of insert — safe if two concurrent first messages race
      await supabase
        .from('chat_usage')
        .upsert(
          { user_id: user.id, report_id: reportId, message_count: 1 },
          { onConflict: 'user_id,report_id' },
        )
    }
  }

  // ── Fix 4: store user message + rebuild context from DB ────────────────────
  await supabase.from('chat_messages').insert({
    report_id: reportId,
    user_id: user.id,
    role: 'user',
    content: message.trim(),
  })

  const { data: dbMessages } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('report_id', reportId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(HISTORY_WINDOW)

  // ── Build system prompt ────────────────────────────────────────────────────
  const systemPrompt = `You are an AI ROI advisor for LyRise. You have generated an ROI report for ${
    report.company_name
  }.
Company details from the report: ${JSON.stringify(report.input_data)}
Answer questions about this ROI analysis, AI automation opportunities, and how LyRise can help implement them. Be concise, specific, and helpful. Do not invent numbers that are not in the report data.`

  // ── Generate AI reply ──────────────────────────────────────────────────────
  const { text } = await generateText({
    model: fastModel,
    system: systemPrompt,
    messages: dbMessages ?? [],
  })

  // ── Fix 4: persist assistant reply ────────────────────────────────────────
  await supabase.from('chat_messages').insert({
    report_id: reportId,
    user_id: user.id,
    role: 'assistant',
    content: text,
  })

  return res.status(200).json({ reply: text })
}
