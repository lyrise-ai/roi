import { generateText } from 'ai'
import { createAdminClient, createClient } from '../../src/lib/supabase-server'
import { getFastModel } from '@/src/lib/roi/llm'
import { isEmployeeUser } from '@/src/lib/isEmployee'
import { REPORT_CHAT_MESSAGE_LIMIT } from '@/src/lib/roi/constants'

const CHAT_LIMIT = REPORT_CHAT_MESSAGE_LIMIT
const MAX_MESSAGE_LENGTH = 1000
const HISTORY_WINDOW = 20

export default async function handler(req, res) {
  if (req.method === 'GET') return handleGet(req, res)
  if (req.method === 'POST') return handlePost(req, res)
  return res.status(405).json({ error: 'Method not allowed' })
}

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

async function handlePost(req, res) {
  const supabase = createClient(req, res)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const { reportId, message } = req.body

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
  if (report.user_id !== user.id && !isEmployee) {
    return res.status(403).json({ error: 'Unauthorized' })
  }

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

  // Employees chat without limits; clients and alpha testers are capped.
  if (!isEmployee) {
    const { data: usage } = await supabase
      .from('chat_usage')
      .select('id, message_count')
      .eq('user_id', user.id)
      .eq('report_id', reportId)
      .single()

    if (usage && usage.message_count >= CHAT_LIMIT) {
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
      const { data: updated } = await supabase
        .from('chat_usage')
        .update({ message_count: usage.message_count + 1 })
        .eq('user_id', user.id)
        .eq('report_id', reportId)
        .lt('message_count', CHAT_LIMIT)
        .select()
        .single()

      if (!updated) {
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
      await supabase
        .from('chat_usage')
        .upsert(
          { user_id: user.id, report_id: reportId, message_count: 1 },
          { onConflict: 'user_id,report_id' },
        )
    }
  }

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

  const systemPrompt = `You are an AI ROI advisor for LyRise. You have generated an ROI report for ${
    report.company_name
  }.
Company details from the report: ${JSON.stringify(report.input_data)}
Answer questions about this ROI analysis, AI automation opportunities, and how LyRise can help implement them. Be concise, specific, and helpful. Do not invent numbers that are not in the report data.`

  const { text } = await generateText({
    model: getFastModel(),
    system: systemPrompt,
    messages: dbMessages ?? [],
  })

  await supabase.from('chat_messages').insert({
    report_id: reportId,
    user_id: user.id,
    role: 'assistant',
    content: text,
  })

  return res.status(200).json({ reply: text })
}
