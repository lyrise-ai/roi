/* eslint-disable no-console */
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/roi-agent — Unified ROI agent endpoint (generation + chat editing)
//
// Replaces /api/roi-report for all new flows.
// Streams SSE events:
//   { type: 'text_delta', delta }           — agent is typing
//   { type: 'tool_start', tool }            — agent called a tool
//   { type: 'pipeline_log', message }       — key pipeline milestone (research, model, assemble)
//   { type: 'report_update', state }        — report HTML changed
//   { type: 'done', messages? }             — agent finished
//   { type: 'error', message }
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto'
import { normalizeInput } from '@/src/lib/roi/pipeline/normalize'
import { loadTemplate } from '@/src/lib/roi/pipeline/renderTemplate'
import { roiCalculator } from '@/src/lib/roi/pipeline/roiCalculator'
import { runReportAgent } from '@/src/lib/roi/agent'
import {
  buildDevMockReportState,
  getCurrency,
} from '@/src/lib/roi/devMockReport'
import { generatePdf } from '@/src/lib/roi/services/pdf'
import {
  sendReportEmail,
  DEFAULT_REPORT_BCC,
} from '@/src/lib/roi/services/email'
import { createClient, createAdminClient } from '../../src/lib/supabase-server'
import {
  buildStateFromReportRow,
  splitStoredState,
} from '@/src/lib/roi/reportState'
import { persistReportEvidence } from '@/src/lib/roi/reportEvidence'
import { persistUsage } from '@/src/lib/roi/services/usageStore'
import { assessReportSpecificity } from '@/src/lib/roi/specificity'

export const config = {
  maxDuration: 300,
}

const IS_DEV = process.env.NODE_ENV === 'development'

function send(res, event) {
  // Once the connection is closed, writing throws (EPIPE) — silently drop.
  if (res.writableEnded || res.destroyed) return
  res.write(`data: ${JSON.stringify(event)}\n\n`)
  if (typeof res.flush === 'function') res.flush()
}

function mapFormToPayload(body) {
  return {
    ...body,
    'Company Name': body.companyName ?? body['Company Name'] ?? '',
    'Company Website URL': body.website ?? body['Company Website URL'] ?? '',
    'What does your company do?':
      body.businessDescription ?? body['What does your company do?'] ?? '',
    Email: body.email ?? body.Email ?? '',
    Industry: body.industry ?? body.Industry ?? '',
    Country: body.country ?? body.Country ?? '',
    'Number of Employees': body.teamSize ?? body['Number of Employees'] ?? '',
    'Estimated Annual Revenue':
      body.revenueRange ?? body['Estimated Annual Revenue'] ?? '',
    'Key Priorities': body.keyPriorities ?? body['Key Priorities'] ?? [],
    'Company LinkedIn URL': body.linkedin ?? body['Company LinkedIn URL'] ?? '',
    'Recipient Name': body.recipientName ?? body['Recipient Name'] ?? '',
    'Recipient Title': body.recipientTitle ?? body['Recipient Title'] ?? '',
    'Operating Currency': body.currency ?? body['Operating Currency'] ?? 'USD',
    processes: body.processes ?? [],
  }
}

function buildPersistedChatHistory(rows = []) {
  return rows
    .filter((row) => row?.role === 'user' || row?.role === 'assistant')
    .map((row) => ({ role: row.role, content: row.content }))
}

function buildShareUrl(req, reportId, token) {
  const explicit = process.env.NEXT_PUBLIC_BASE_URL
  const host = req.headers?.host
  const proto =
    req.headers?.['x-forwarded-proto'] ||
    (host && host.startsWith('localhost') ? 'http' : 'https')
  const base = explicit ?? (host ? `${proto}://${host}` : 'https://lyrise.ai')
  return `${base.replace(/\/$/, '')}/report/${reportId}?t=${encodeURIComponent(
    token,
  )}`
}

function createInitialReportState(normInput) {
  return {
    normInput,
    company: null,
    globals: null,
    workflows: null,
    copy: null,
    calcOutput: null,
    assembled: null,
    renderedHtml: null,
    renderedFullHtml: null,
    confidenceLevel: null,
    coreThesis: null,
    painPoints: [],
    researchSummary: null,
    evidenceItems: [],
    specificityAssessment: null,
    salaryEvidence: [],
  }
}

function stripFinalReportFields(state) {
  return {
    ...state,
    copy: null,
    assembled: null,
    renderedHtml: null,
    renderedFullHtml: null,
    specificityAssessment: null,
  }
}

function coercePositiveNumberOrNull(value) {
  if (value === '' || value == null) return null
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return Number.NaN
  if (numeric <= 0) return Number.NaN
  return numeric
}

function sanitizeOptionalString(value) {
  if (value == null) return null
  const text = String(value).trim()
  return text || null
}

function applyVerificationPatch(state, verificationPatch = {}) {
  if (
    !state?.company ||
    !state?.normInput ||
    !state?.workflows ||
    !state?.globals
  ) {
    throw new Error('Prepared report state is incomplete')
  }

  const companyPatch = verificationPatch.company ?? {}
  const workflowPatches = Array.isArray(verificationPatch.workflows)
    ? verificationPatch.workflows
    : []

  if ('employees' in companyPatch) {
    const employees = coercePositiveNumberOrNull(companyPatch.employees)
    if (Number.isNaN(employees)) {
      throw new Error('Employee estimate must be a positive number')
    }
    state.company.employees = employees
  }
  if ('revenueEstimateM' in companyPatch) {
    const revenueEstimateM = coercePositiveNumberOrNull(
      companyPatch.revenueEstimateM,
    )
    if (Number.isNaN(revenueEstimateM)) {
      throw new Error('Revenue estimate must be a positive number')
    }
    state.company.revenueEstimateM = revenueEstimateM
  }
  if ('industry' in companyPatch) {
    state.company.industry = sanitizeOptionalString(companyPatch.industry) ?? ''
  }
  if ('country' in companyPatch) {
    state.company.country = sanitizeOptionalString(companyPatch.country)
  }
  if ('teamSize' in companyPatch) {
    state.normInput.teamSize =
      sanitizeOptionalString(companyPatch.teamSize) ?? ''
  }
  if ('revenueRange' in companyPatch) {
    state.normInput.revenueRange =
      sanitizeOptionalString(companyPatch.revenueRange) ?? ''
  }
  if ('selectedCurrency' in companyPatch) {
    const selectedCurrency =
      sanitizeOptionalString(companyPatch.selectedCurrency) ?? ''
    state.normInput.selectedCurrency = selectedCurrency
    if (selectedCurrency) {
      state.globals.currency = getCurrency(selectedCurrency)
    }
  }

  workflowPatches.forEach((patch) => {
    if (!patch || typeof patch !== 'object') return
    const index = Number(patch.index)
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= state.workflows.length
    ) {
      throw new Error('Verification patch referenced an invalid workflow index')
    }
    const workflow = state.workflows[index]
    if (
      patch.originalName &&
      String(patch.originalName).trim() !== workflow.name
    ) {
      throw new Error('Verification patch did not match the expected workflow')
    }

    const nextName = sanitizeOptionalString(patch.name)
    if (nextName) workflow.name = nextName
    const nextFunction = sanitizeOptionalString(patch.function)
    if (nextFunction) workflow.function = nextFunction
    const nextOwner = sanitizeOptionalString(patch.owner)
    if (nextOwner) workflow.owner = nextOwner
    const nextSeniority = sanitizeOptionalString(patch.seniorityLevel)
    if (nextSeniority) workflow.seniorityLevel = nextSeniority
    const nextSourceType = sanitizeOptionalString(patch.sourceType)
    if (nextSourceType) workflow.sourceType = nextSourceType
    const nextRationale = sanitizeOptionalString(patch.rationale)
    if (nextRationale) workflow.rationale = nextRationale
    ;[
      'monthlyVolume',
      'minutesPerItemBefore',
      'minutesPerItemAfter',
      'rateOverride',
    ].forEach((field) => {
      if (!(field in patch)) return
      const numeric = coercePositiveNumberOrNull(patch[field])
      if (Number.isNaN(numeric)) {
        throw new Error(`${workflow.name}: ${field} must be a positive number`)
      }
      workflow[field] = numeric
    })
  })

  const invalidWorkflow = state.workflows.find(
    (workflow) =>
      !sanitizeOptionalString(workflow.name) ||
      !sanitizeOptionalString(workflow.function) ||
      !sanitizeOptionalString(workflow.owner) ||
      !sanitizeOptionalString(workflow.sourceType) ||
      !sanitizeOptionalString(workflow.rationale) ||
      !Number.isFinite(workflow.monthlyVolume) ||
      workflow.monthlyVolume <= 0 ||
      !Number.isFinite(workflow.minutesPerItemBefore) ||
      workflow.minutesPerItemBefore <= 0 ||
      !Number.isFinite(workflow.minutesPerItemAfter) ||
      workflow.minutesPerItemAfter <= 0 ||
      !Number.isFinite(workflow.rateOverride) ||
      workflow.rateOverride <= 0,
  )

  if (invalidWorkflow) {
    throw new Error(
      `Workflow "${invalidWorkflow.name}" is missing one or more required fields`,
    )
  }

  state.calcOutput = roiCalculator(
    state.workflows,
    state.globals,
    state.company,
  )
  state.copy = null
  state.assembled = null
  state.renderedHtml = null
  state.renderedFullHtml = null
  state.specificityAssessment = null

  return state
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const supabase = createClient(req, res)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const reportId =
      typeof req.query?.reportId === 'string' ? req.query.reportId : null
    let reportQuery = supabase
      .from('reports')
      .select(
        'id, status, input_data, rendered_html, rendered_full_html, state_data',
      )
      .eq('user_id', user.id)
    if (reportId) {
      reportQuery = reportQuery.eq('id', reportId).limit(1)
    } else {
      reportQuery = reportQuery
        .order('created_at', { ascending: false })
        .limit(1)
    }
    const { data: report } = await reportQuery.maybeSingle()

    let messagesUsed = 0
    if (report) {
      const adminSupabase = createAdminClient()
      const { data: usage } = await adminSupabase
        .from('chat_usage')
        .select('message_count')
        .eq('user_id', user.id)
        .eq('report_id', report.id)
        .maybeSingle()
      messagesUsed = usage?.message_count ?? 0
    }

    res.status(200).json({
      report: report ? { ...report, messages_used: messagesUsed } : null,
    })
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const supabase = createClient(req, res)

  const {
    mode,
    formData,
    message,
    chatHistory,
    devOptions,
    reportId,
    emailOverride,
    shareToken,
    verificationPatch,
  } = req.body

  if (!mode || !['generate', 'prepare', 'finalize', 'chat'].includes(mode)) {
    res.status(400).json({
      error:
        'Invalid mode. Must be "generate", "prepare", "finalize", or "chat".',
    })
    return
  }

  const CHAT_LIMIT = 5
  let chatUserRole = 'CLIENT'
  const adminSupabase = createAdminClient()
  let persistedReport = null
  let persistedChatHistory = []
  // Share-link chat: an email recipient is editing via the tokenized URL.
  // They have no Supabase session, so we attribute writes to the report
  // owner (chat_messages.user_id) and gate the 5-message cap on
  // reports.share_message_count instead of chat_usage.
  let isShareLinkChat = false

  if (mode === 'chat' && shareToken && reportId) {
    const { data: r } = await adminSupabase
      .from('reports')
      .select(
        'id, user_id, email, status, input_data, state_data, rendered_html, rendered_full_html, share_token, share_revoked_at, share_message_count',
      )
      .eq('id', reportId)
      .single()
    if (r && r.share_token === shareToken && !r.share_revoked_at) {
      isShareLinkChat = true
      persistedReport = r
    }
  }

  let user = null
  if (!isShareLinkChat) {
    const authResult = await supabase.auth.getUser()
    user = authResult?.data?.user ?? null
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
  }

  if (mode === 'chat' && !isShareLinkChat) {
    if (!reportId) {
      res.status(400).json({ error: 'reportId is required for chat mode' })
      return
    }

    const [{ data: userData }, { data: report }] = await Promise.all([
      adminSupabase.from('users').select('role').eq('id', user.id).single(),
      adminSupabase
        .from('reports')
        .select(
          'id, user_id, email, status, input_data, state_data, rendered_html, rendered_full_html',
        )
        .eq('id', reportId)
        .single(),
    ])
    const isEmployeeChat =
      userData?.role === 'EMPLOYEE' ||
      user.email?.endsWith('@lyrise.ai') === true

    // Employees see all messages on the report; clients see only their own
    let msgQuery = adminSupabase
      .from('chat_messages')
      .select('role, content')
      .eq('report_id', reportId)
      .order('created_at', { ascending: true })
      .limit(20)
    if (!isEmployeeChat) msgQuery = msgQuery.eq('user_id', user.id)
    const { data: messages } = await msgQuery
    chatUserRole = isEmployeeChat ? 'EMPLOYEE' : userData?.role ?? 'CLIENT'

    if (!report || (report.user_id !== user.id && !isEmployeeChat)) {
      res.status(403).json({ error: 'Unauthorized' })
      return
    }

    if (!isEmployeeChat) {
      const { data: usage } = await adminSupabase
        .from('chat_usage')
        .select('id, message_count')
        .eq('user_id', user.id)
        .eq('report_id', reportId)
        .single()

      if (usage && usage.message_count >= CHAT_LIMIT) {
        adminSupabase
          .from('events')
          .insert({
            user_id: user.id,
            report_id: reportId,
            type: 'chat_limit_reached',
          })
          .then(({ error }) => {
            if (error)
              console.error('event insert failed (chat_limit_reached)', error)
          })
        res.status(403).json({ error: 'limit_reached' })
        return
      }
    }

    persistedReport = report
    persistedChatHistory = buildPersistedChatHistory(messages ?? [])
  }

  if (mode === 'chat' && isShareLinkChat) {
    chatUserRole = 'CLIENT'
    // Share-link visitors see the full message thread on the report.
    const { data: messages } = await adminSupabase
      .from('chat_messages')
      .select('role, content')
      .eq('report_id', reportId)
      .order('created_at', { ascending: true })
      .limit(20)
    persistedChatHistory = buildPersistedChatHistory(messages ?? [])

    // Atomically claim a slot before doing any work. The RPC increments
    // share_message_count only if it's still below CHAT_LIMIT and returns
    // the new count; a null result means the cap is reached. Claiming up
    // front (rather than incrementing after the LLM call) closes the
    // race where two concurrent submits both read count=N<CHAT_LIMIT,
    // both run the LLM, and only one of the post-hoc updates lands.
    const { data: claimedCount, error: claimErr } = await adminSupabase.rpc(
      'claim_share_chat_slot',
      { p_report_id: reportId, p_max: CHAT_LIMIT },
    )
    if (claimErr) {
      console.error('[roi-agent] claim_share_chat_slot error:', claimErr)
      res.status(500).json({ error: 'internal_error' })
      return
    }
    if (claimedCount == null) {
      adminSupabase
        .from('events')
        .insert({
          user_id: persistedReport.user_id,
          report_id: reportId,
          type: 'chat_limit_reached',
        })
        .then(({ error }) => {
          if (error)
            console.error('event insert failed (chat_limit_reached)', error)
        })
      res.status(403).json({ error: 'limit_reached' })
      return
    }
    persistedReport.share_message_count = claimedCount
  }

  if (mode === 'generate' || mode === 'prepare' || mode === 'finalize') {
    const { data: genUserData } = await adminSupabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()
    const isEmployee =
      genUserData?.role === 'EMPLOYEE' ||
      user.email?.endsWith('@lyrise.ai') === true

    if (!isEmployee && (mode === 'generate' || mode === 'prepare')) {
      const { data: existingReports } = await supabase
        .from('reports')
        .select('id, status')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      const successReport = (existingReports ?? []).find(
        (report) => report.status === 'SUCCESS',
      )
      if (successReport) {
        res
          .status(409)
          .json({ error: 'report_exists', report_id: successReport.id })
        return
      }

      const pendingDraft = (existingReports ?? []).find(
        (report) => report.status === 'PENDING_VERIFICATION',
      )
      if (
        pendingDraft &&
        (mode === 'generate' || !reportId || pendingDraft.id !== reportId)
      ) {
        res.status(409).json({
          error: 'verification_pending',
          report_id: pendingDraft.id,
        })
        return
      }
    }

    if (mode === 'finalize') {
      if (!reportId) {
        res
          .status(400)
          .json({ error: 'reportId is required for finalize mode' })
        return
      }

      const { data: report } = await adminSupabase
        .from('reports')
        .select(
          'id, user_id, email, status, input_data, state_data, rendered_html, rendered_full_html, share_token',
        )
        .eq('id', reportId)
        .single()

      if (!report || report.user_id !== user.id) {
        res.status(403).json({ error: 'Unauthorized' })
        return
      }

      if (report.status !== 'PENDING_VERIFICATION') {
        res.status(409).json({
          error: 'report_not_pending_verification',
          report_id: report.id,
        })
        return
      }

      persistedReport = report
    }
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  // ── Client-disconnect handling ─────────────────────────────────────────────
  // If the browser tab closes, navigates away, or the landing page crashes
  // mid-stream, the underlying connection drops. Without this the agent keeps
  // burning tokens and still fires the PDF/email side effects for a report
  // nobody is waiting on. Abort the agent loop and skip the email when the
  // client goes away — already-saved reports stay accessible from the
  // dashboard, and an employee can still email them manually.
  const abortController = new AbortController()
  let clientDisconnected = false
  res.on('close', () => {
    if (res.writableEnded) return // normal completion, not a disconnect
    clientDisconnected = true
    abortController.abort()
    console.warn('[roi-agent] client disconnected — aborting agent run')
  })

  try {
    const execTemplateHtml = loadTemplate('roi-exec-template.html')
    const fullTemplateHtml = loadTemplate('roi-template.html')
    const useDevMock =
      IS_DEV &&
      (mode === 'generate' || mode === 'prepare') &&
      devOptions?.skipLLM === true

    let state
    if (mode === 'generate' || mode === 'prepare') {
      const payload = mapFormToPayload(formData ?? req.body)
      const normInput = normalizeInput(payload)

      if (useDevMock) {
        const mockState = buildDevMockReportState({
          normInput,
          execTemplateHtml,
          fullTemplateHtml,
        })
        state =
          mode === 'prepare' ? stripFinalReportFields(mockState) : mockState
        send(res, {
          type: 'text_delta',
          delta:
            'Using dev mock report. Skipping research and LLM calls, but still saving the report.',
        })
        if (mode === 'generate') {
          send(res, { type: 'report_update', state })
        }
      }

      if (!useDevMock) {
        state = createInitialReportState(normInput)
      }
    } else if (mode === 'finalize') {
      state = buildStateFromReportRow(persistedReport)
      applyVerificationPatch(state, verificationPatch)
    } else {
      state = buildStateFromReportRow(persistedReport)
    }

    let capturedMessages = []
    let capturedUsage = null

    if (useDevMock) {
      capturedMessages = [
        { role: 'assistant', content: 'Dev mock report ready.' },
      ]
      send(res, {
        type: 'done',
        assembled: Boolean(state?.assembled),
        messages: capturedMessages,
      })
    } else {
      await runReportAgent({
        mode,
        state,
        message,
        chatHistory: mode === 'chat' ? persistedChatHistory : chatHistory,
        templateHtml: execTemplateHtml,
        fullTemplateHtml,
        estimatesOnly: Boolean(devOptions?.estimatesOnly),
        stopAfterFinancialModel: mode === 'prepare',
        abortSignal: abortController.signal,
        callbacks: {
          onTextDelta: (delta) => send(res, { type: 'text_delta', delta }),
          onToolStart: (tool, args) =>
            send(res, { type: 'tool_start', tool, args }),
          onPipelineLog: (message) =>
            send(res, { type: 'pipeline_log', message }),
          onReportUpdate: (s, changedSections) => {
            const { renderedHtml, renderedFullHtml, ...rest } = s
            send(res, {
              type: 'report_update',
              state: { ...rest, renderedHtml, renderedFullHtml },
              changedSections,
            })
          },
          onDone: (messages) => {
            capturedMessages = messages ?? []
            send(res, {
              type: 'done',
              assembled: Boolean(state?.assembled),
              messages,
            })
          },
          onUsage: (summary) => {
            capturedUsage = summary
          },
          onError: (err) => send(res, { type: 'error', message: err.message }),
        },
      })
    }

    if (mode === 'chat' && reportId) {
      const userRole = chatUserRole
      state.specificityAssessment = assessReportSpecificity(state)

      // Persist LLM usage for this chat turn (report already exists). upsert on
      // report_id keeps one usage row per report. Awaited (not fire-and-forget):
      // on Vercel the serverless function can be frozen once the response ends,
      // dropping un-awaited background writes. persistUsage swallows its own
      // errors, so awaiting it can never break the chat turn.
      if (capturedUsage) {
        await persistUsage(capturedUsage, {
          reportId,
          userId: persistedReport?.user_id ?? user.id,
        })
      }

      // chat_messages.user_id is FK to auth.users. For share-link visitors
      // (no session) we attribute writes to the report owner so the FK
      // holds and the owner sees the conversation in their own thread.
      const chatWriterUserId = isShareLinkChat
        ? persistedReport.user_id
        : user.id
      // Use admin client for share-link writes since the chat_messages RLS
      // insert policy requires user_id = auth.uid().
      const chatWriteClient = isShareLinkChat ? adminSupabase : supabase

      await chatWriteClient.from('chat_messages').insert({
        report_id: reportId,
        user_id: chatWriterUserId,
        role: 'user',
        content: message?.trim() ?? '',
      })

      const assistantText = capturedMessages
        .filter((m) => m.role === 'assistant')
        .map((m) => {
          if (typeof m.content === 'string') return m.content
          if (Array.isArray(m.content))
            return m.content
              .filter((p) => p.type === 'text')
              .map((p) => p.text)
              .join('')
          return ''
        })
        .join('\n')
        .trim()

      if (assistantText) {
        await chatWriteClient.from('chat_messages').insert({
          report_id: reportId,
          user_id: chatWriterUserId,
          role: 'assistant',
          content: assistantText,
        })
      }

      const { stateData, renderedHtml, renderedFullHtml } =
        splitStoredState(state)
      await adminSupabase
        .from('reports')
        .update({
          rendered_html: renderedHtml,
          rendered_full_html: renderedFullHtml,
          state_data: stateData,
        })
        .eq('id', reportId)

      await persistReportEvidence(adminSupabase, reportId, state.evidenceItems)

      adminSupabase
        .from('events')
        .insert({
          user_id: chatWriterUserId,
          report_id: reportId,
          type: isShareLinkChat
            ? 'chat_message_sent_share'
            : 'chat_message_sent',
        })
        .then(({ error }) => {
          if (error)
            console.error('event insert failed (chat_message_sent)', error)
        })

      if (isShareLinkChat) {
        // Slot was already claimed atomically via claim_share_chat_slot
        // before the LLM ran, so no post-hoc increment is needed here.
      } else if (userRole !== 'EMPLOYEE') {
        const { data: usage, error: usageReadErr } = await adminSupabase
          .from('chat_usage')
          .select('id, message_count')
          .eq('user_id', user.id)
          .eq('report_id', reportId)
          .single()

        if (usageReadErr && usageReadErr.code !== 'PGRST116') {
          console.error('[roi-agent] chat_usage read error:', usageReadErr)
        }

        if (usage) {
          const { error: updateErr } = await adminSupabase
            .from('chat_usage')
            .update({ message_count: usage.message_count + 1 })
            .eq('user_id', user.id)
            .eq('report_id', reportId)
            .lt('message_count', CHAT_LIMIT)
          if (updateErr)
            console.error('[roi-agent] chat_usage update error:', updateErr)
        } else {
          const { error: upsertErr } = await adminSupabase
            .from('chat_usage')
            .upsert(
              { user_id: user.id, report_id: reportId, message_count: 1 },
              { onConflict: 'user_id,report_id' },
            )
          if (upsertErr)
            console.error('[roi-agent] chat_usage upsert error:', upsertErr)
        }
      }
    }

    // Save report state after generation/finalization
    let generatedShareToken = persistedReport?.share_token ?? null
    let savedReportId = reportId ?? persistedReport?.id ?? null
    if (mode === 'prepare' && state.calcOutput) {
      const preparedState = stripFinalReportFields(state)
      const { stateData } = splitStoredState(preparedState)
      let savedDraft = null
      let saveError = null

      if (reportId) {
        const result = await supabase
          .from('reports')
          .update({
            company_name:
              preparedState.company?.company ??
              preparedState.normInput?.companyName ??
              '',
            email: preparedState.normInput?.email ?? '',
            status: 'PENDING_VERIFICATION',
            input_data: preparedState.normInput,
            state_data: stateData,
            rendered_html: null,
            rendered_full_html: null,
            completed_at: null,
          })
          .eq('id', reportId)
          .eq('user_id', user.id)
          .select('id')
          .single()
        savedDraft = result.data
        saveError = result.error
      } else {
        const result = await supabase
          .from('reports')
          .insert({
            user_id: user.id,
            company_name:
              preparedState.company?.company ??
              preparedState.normInput?.companyName ??
              '',
            email: preparedState.normInput?.email ?? '',
            status: 'PENDING_VERIFICATION',
            input_data: preparedState.normInput,
            state_data: stateData,
          })
          .select('id')
          .single()
        savedDraft = result.data
        saveError = result.error
      }

      if (saveError) {
        console.error('[roi-agent] draft save failed:', saveError)
        send(res, {
          type: 'error',
          message: 'Failed to save prepared report: ' + saveError.message,
        })
        res.end()
        return
      }

      if (savedDraft?.id) {
        savedReportId = savedDraft.id
        if (capturedUsage) {
          await persistUsage(capturedUsage, {
            reportId: savedDraft.id,
            userId: user.id,
          })
        }
        send(res, {
          type: 'report_prepared',
          report_id: savedDraft.id,
          state: preparedState,
        })
      }
    } else if (mode === 'generate' && state.assembled) {
      state.specificityAssessment = assessReportSpecificity(state)

      if (state.specificityAssessment.level === 'weak') {
        send(res, {
          type: 'text_delta',
          delta:
            '\n\nLow-confidence note: public company evidence was limited, so some workflow assumptions may still rely on benchmarks.',
        })
      }

      const { stateData, renderedHtml, renderedFullHtml } =
        splitStoredState(state)
      generatedShareToken = crypto.randomBytes(24).toString('base64url')
      const { data: savedReport, error: saveError } = await supabase
        .from('reports')
        .insert({
          user_id: user.id,
          company_name:
            state.assembled.roi_data?.company ??
            state.normInput?.companyName ??
            '',
          email: state.normInput?.email ?? '',
          status: 'SUCCESS',
          input_data: state.normInput,
          completed_at: new Date().toISOString(),
          rendered_html: renderedHtml,
          rendered_full_html: renderedFullHtml,
          state_data: stateData,
          share_token: generatedShareToken,
        })
        .select('id')
        .single()

      if (saveError) {
        console.error('[roi-agent] report save failed:', saveError)
        send(res, {
          type: 'error',
          message: 'Failed to save report: ' + saveError.message,
        })
        res.end()
        return
      }

      if (savedReport?.id) {
        savedReportId = savedReport.id
        if (capturedUsage) {
          await persistUsage(capturedUsage, {
            reportId: savedReport.id,
            userId: user.id,
          })
        }
        await persistReportEvidence(
          adminSupabase,
          savedReport.id,
          state.evidenceItems,
        )
        adminSupabase
          .from('events')
          .insert({
            user_id: user.id,
            report_id: savedReport.id,
            type: 'report_created',
          })
          .then(({ error }) => {
            if (error)
              console.error('event insert failed (report_created)', error)
          })
        send(res, { type: 'report_saved', report_id: savedReport.id })
      }
    } else if (mode === 'finalize' && state.assembled) {
      state.specificityAssessment = assessReportSpecificity(state)

      if (state.specificityAssessment.level === 'weak') {
        send(res, {
          type: 'text_delta',
          delta:
            '\n\nLow-confidence note: public company evidence was limited, so some workflow assumptions may still rely on benchmarks.',
        })
      }

      const { stateData, renderedHtml, renderedFullHtml } =
        splitStoredState(state)
      generatedShareToken =
        persistedReport?.share_token ??
        crypto.randomBytes(24).toString('base64url')

      const { error: updateError } = await supabase
        .from('reports')
        .update({
          company_name:
            state.assembled.roi_data?.company ??
            state.normInput?.companyName ??
            '',
          email: state.normInput?.email ?? '',
          status: 'SUCCESS',
          input_data: state.normInput,
          completed_at: new Date().toISOString(),
          rendered_html: renderedHtml,
          rendered_full_html: renderedFullHtml,
          state_data: stateData,
          share_token: generatedShareToken,
        })
        .eq('id', persistedReport.id)
        .eq('user_id', user.id)

      if (updateError) {
        console.error('[roi-agent] finalize save failed:', updateError)
        send(res, {
          type: 'error',
          message: 'Failed to finalize report: ' + updateError.message,
        })
        res.end()
        return
      }

      savedReportId = persistedReport.id
      if (capturedUsage) {
        await persistUsage(capturedUsage, {
          reportId: persistedReport.id,
          userId: user.id,
        })
      }
      await persistReportEvidence(
        adminSupabase,
        persistedReport.id,
        state.evidenceItems,
      )
      adminSupabase
        .from('events')
        .insert({
          user_id: user.id,
          report_id: persistedReport.id,
          type: 'report_created',
        })
        .then(({ error }) => {
          if (error)
            console.error('event insert failed (report_created)', error)
        })
      send(res, { type: 'report_saved', report_id: persistedReport.id })
    }

    // Fire-and-forget PDF + email after generation.
    // Skip when the client has disconnected: the report is still saved above
    // and reachable from the dashboard, but we don't auto-email a company a
    // report whose request was abandoned.
    if (
      clientDisconnected &&
      (mode === 'generate' || mode === 'finalize') &&
      state.assembled
    ) {
      console.warn(
        '[roi-agent] client gone — report saved but skipping PDF/email',
      )
    }
    if (
      !IS_DEV &&
      !clientDisconnected &&
      (mode === 'generate' || mode === 'finalize') &&
      state.assembled &&
      state.renderedHtml &&
      state.normInput?.email
    ) {
      try {
        const company = state.assembled.roi_data?.company ?? 'Report'
        const slug = company
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
        const filename = `LyRise_ROI_${slug}.pdf`
        const pdf = await generatePdf(state.renderedHtml, filename)
        const overrideAddr =
          typeof emailOverride === 'string' && emailOverride.trim()
            ? emailOverride.trim().toLowerCase()
            : null
        const recipient = overrideAddr ?? state.normInput.email
        const bcc = overrideAddr
          ? DEFAULT_REPORT_BCC.filter(
              (addr) => addr.toLowerCase() !== overrideAddr,
            )
          : DEFAULT_REPORT_BCC
        const chatUrl =
          savedReportId && generatedShareToken
            ? buildShareUrl(req, savedReportId, generatedShareToken)
            : undefined
        await sendReportEmail(
          recipient,
          company,
          pdf.base64,
          pdf.filename,
          bcc,
          chatUrl,
        )
        send(res, { type: 'email_sent' })
      } catch (bgErr) {
        console.error('[roi-agent] PDF/email failed:', bgErr)
        send(res, { type: 'email_error', message: bgErr.message })
      }
    }
  } catch (err) {
    console.error('[roi-agent] Error:', err)
    send(res, { type: 'error', message: err?.message ?? 'Unknown error' })
  }

  res.end()
}
