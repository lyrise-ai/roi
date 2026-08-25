/* eslint-disable no-console */
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/roi-agent — one endpoint for both building a report and editing it
// through chat.
//
// It replaces /api/roi-report for everything new.
//
// It holds the connection open and pushes updates down it as they happen:
//   text_delta    — the agent is typing
//   tool_start    — the agent started using a tool
//   tool_result   — a tool finished, whether it worked or failed
//   pipeline_log  — a milestone: research done, model run, report assembled
//   report_update — the report itself changed
//   done          — the agent has finished
//   error         — something went wrong
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto'
import { normalizeInput } from '@/src/lib/roi/pipeline/normalize'
import { loadTemplate } from '@/src/lib/roi/pipeline/renderTemplate'
import { runReportAgent } from '@/src/lib/roi/agent'
import { buildDevMockReportState } from '@/src/lib/roi/devMockReport'
import { generatePdf } from '@/src/lib/roi/services/pdf'
import {
  sendReportEmail,
  DEFAULT_REPORT_BCC,
} from '@/src/lib/roi/services/email'
import {
  isOpenAIQuotaError,
  alertOpenAIQuotaError,
} from '@/src/lib/roi/services/openaiQuotaAlert'
import { createClient, createAdminClient } from '../../src/lib/supabase-server'
import {
  buildStateFromReportRow,
  splitStoredState,
} from '@/src/lib/roi/reportState'
import { persistReportEvidence } from '@/src/lib/roi/reportEvidence'
import { buildBaselineSnapshot } from '@/src/lib/roi/pipeline/validationBaseline'
import { persistUsage } from '@/src/lib/roi/services/usageStore'
import { assessReportSpecificity } from '@/src/lib/roi/specificity'
import { isEmployeeUser } from '@/src/lib/isEmployee'
import { REPORT_CHAT_MESSAGE_LIMIT } from '@/src/lib/roi/constants'
import { hasReportAccess, getGrantForUser } from '@/src/lib/roi/reportGrants'
import { EVENTS } from '@/src/lib/analytics'
import {
  captureServer,
  captureServerException,
  flushPostHog,
} from '@/src/lib/posthog-server'

export const config = {
  maxDuration: 300,
}

const IS_DEV = process.env.NODE_ENV === 'development'

// Turns raw errors into something we can show a user. Billing and rate-limit
// errors from OpenAI must never expose our account details to them.
function friendlyErrorMessage(err) {
  const msg = err?.message ?? ''
  // If this is a real Error, use the exact check from openaiQuotaAlert. For a
  // plain object or a string, fall back to looking for keywords.
  const isQuota =
    isOpenAIQuotaError(err) ||
    err?.status === 429 ||
    err?.statusCode === 429 ||
    msg.includes('429') ||
    msg.includes('rate limit') ||
    msg.includes('rate_limit')
  if (isQuota) {
    return "We're experiencing high demand right now — please try again in a few minutes."
  }
  return msg || 'Something went wrong. Please try again.'
}

function send(res, event) {
  // Once the connection is closed, writing to it throws. Just drop it.
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
    const { data: report } = await supabase
      .from('reports')
      .select('id, rendered_html, rendered_full_html, state_data')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

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
  } = req.body

  if (!mode || !['generate', 'chat'].includes(mode)) {
    res
      .status(400)
      .json({ error: 'Invalid mode. Must be "generate" or "chat".' })
    return
  }

  const CHAT_LIMIT = REPORT_CHAT_MESSAGE_LIMIT
  let chatUserRole = 'CLIENT'
  const adminSupabase = createAdminClient()
  let persistedReport = null
  let persistedChatHistory = []
  // Chat from a share link: someone who received the report by email is editing
  // it through the link. They are not signed in, so we record their messages
  // against the report owner, and count their 5-message limit on the report
  // itself rather than against a user account.
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

  // Whether this is an alpha tester comes from their own account record, not
  // from anything the browser sent. It is set once when their sign-in link is
  // created, so a request cannot fake it.
  const isAlpha = user?.user_metadata?.alpha === true

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
    const isEmployeeChat = isEmployeeUser(user, userData)
    const grant = report
      ? await getGrantForUser({
          admin: adminSupabase,
          reportId,
          userId: user.id,
        })
      : null

    if (
      !report ||
      !hasReportAccess({
        report,
        userId: user.id,
        isEmployee: isEmployeeChat,
        grant,
      })
    ) {
      res.status(403).json({ error: 'Unauthorized' })
      return
    }

    // The chat history belongs to the report. Everyone who can see the report —
    // the owner, our staff, an invited colleague — sees the same full
    // conversation. Only the message allowance below is per person.
    const { data: messages } = await adminSupabase
      .from('chat_messages')
      .select('role, content')
      .eq('report_id', reportId)
      .order('created_at', { ascending: true })
      .limit(20)
    chatUserRole = isEmployeeChat ? 'EMPLOYEE' : (userData?.role ?? 'CLIENT')

    // Our own staff have no message limit. Clients, alpha testers and invited
    // colleagues each have their own allowance.
    if (!isEmployeeChat && grant && grant.message_count >= CHAT_LIMIT) {
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

    persistedReport = report
    persistedChatHistory = buildPersistedChatHistory(messages ?? [])
  }

  if (mode === 'chat' && isShareLinkChat) {
    chatUserRole = 'CLIENT'
    // Someone on a share link sees the whole conversation on the report.
    const { data: messages } = await adminSupabase
      .from('chat_messages')
      .select('role, content')
      .eq('report_id', reportId)
      .order('created_at', { ascending: true })
      .limit(20)
    persistedChatHistory = buildPersistedChatHistory(messages ?? [])

    // Take a message slot in one step before doing any work. The database
    // function adds one to the count only if it is still under the limit, and
    // returns the new count. Nothing back means the limit is reached.
    //
    // Claiming the slot up front, rather than adding to the count after the
    // model call, closes a race: two messages sent at the same moment both read
    // the same count, both run the model, and only one of the two updates
    // afterwards actually lands.
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

  // An alpha tester gets one report per account, which keeps the guided tour to
  // a single run. Normal clients and our own staff can generate as many as they
  // like.
  if (mode === 'generate' && isAlpha && user) {
    const { data: existingReport } = await supabase
      .from('reports')
      .select('id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()
    if (existingReport) {
      res
        .status(409)
        .json({ error: 'report_exists', report_id: existingReport.id })
      return
    }
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  // -- Tracking ---------------------------------------------------------------
  // Everything past this point is the slow work. We record a start, and then
  // either a finish or a failure. That pairing is what makes a stuck run
  // visible: a start with neither of the other two means a run that died without
  // even reaching our error handler — a server timeout, or the browser
  // disappearing mid-stream.
  const telemetryStartedAt = Date.now()
  // Someone on a share link is not signed in and has no lasting id here. We
  // leave the field empty, which PostHog treats as anonymous, rather than
  // filing them under the report owner or under one shared label — either of
  // which would make every share-link visitor in the product look like a single
  // user.
  const phDistinctId = user?.id ?? null
  const phBase = {
    mode,
    is_alpha: Boolean(isAlpha),
    // The link back to the report. Without it, a failure names no particular
    // run, and there is nothing to open when working out what went wrong.
    report_id: reportId ?? null,
    is_share_link: isShareLinkChat,
  }
  captureServer(
    mode === 'generate' ? EVENTS.GENERATION_STARTED : EVENTS.CHAT_MESSAGE_SENT,
    phBase,
    phDistinctId,
  )

  // -- When the browser goes away ---------------------------------------------
  // If the tab closes, the user navigates away, or the page crashes mid-run, the
  // connection drops. Without this, the agent keeps spending money and still
  // makes the PDF and sends the email for a report nobody is waiting for.
  //
  // So we stop the agent and skip the email when that happens. Reports already
  // saved stay available on the dashboard, and a member of staff can still email
  // one by hand.
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
      IS_DEV && mode === 'generate' && devOptions?.skipLLM === true

    let state
    if (mode === 'generate') {
      const payload = mapFormToPayload(formData ?? req.body)
      const normInput = normalizeInput(payload)

      if (useDevMock) {
        state = buildDevMockReportState({
          normInput,
          execTemplateHtml,
          fullTemplateHtml,
        })
        send(res, {
          type: 'text_delta',
          delta:
            'Using dev mock report. Skipping research and LLM calls, but still saving the report.',
        })
        send(res, { type: 'report_update', state })
      }

      if (!useDevMock) {
        state = {
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
        }
      }
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
        assembled: true,
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
        abortSignal: abortController.signal,
        callbacks: {
          onTextDelta: (delta) => send(res, { type: 'text_delta', delta }),
          onToolStart: (tool, args) =>
            send(res, { type: 'tool_start', tool, args }),
          onToolResult: (tool, output) =>
            send(res, { type: 'tool_result', tool, output }),
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
          onError: (err) => {
            if (isOpenAIQuotaError(err)) {
              alertOpenAIQuotaError(err, {
                company: state?.normInput?.companyName ?? null,
                mode,
              })
            }
            send(res, { type: 'error', message: friendlyErrorMessage(err) })
          },
        },
      })
    }

    if (mode === 'chat' && reportId) {
      const userRole = chatUserRole
      state.specificityAssessment = assessReportSpecificity(state)

      // Save what this chat turn cost. The report already exists, and there is
      // one usage row per report, so this adds to it.
      //
      // We wait for it rather than firing it off in the background: Vercel can
      // freeze the server the moment the response ends, and a background write
      // would be lost. This save swallows its own errors, so waiting for it can
      // never break the chat turn.
      if (capturedUsage) {
        await persistUsage(capturedUsage, {
          reportId,
          userId: persistedReport?.user_id ?? user.id,
        })
      }

      // Every chat message has to point at a real user account. Someone on a
      // share link is not signed in, so we record their messages against the
      // report owner. That keeps the database happy, and the owner sees the
      // conversation in their own thread.
      const chatWriterUserId = isShareLinkChat
        ? persistedReport.user_id
        : user.id
      // Share-link messages are written with the admin key, because the normal
      // rule requires the message's user to be the one making the request.
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
        // The message slot was already taken before the model ran, so there is
        // nothing to add to the count here.
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

    // Save the finished report to the database
    let generatedShareToken = null
    let savedReportId = null
    if (mode === 'generate' && state.assembled) {
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
      const validationBaseline = buildBaselineSnapshot(
        state.workflows,
        new Date().toISOString(),
        'generation',
      )
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
          is_alpha: Boolean(isAlpha),
          validation_data: { baseline: validationBaseline },
        })
        .select('id')
        .single()

      if (saveError) {
        console.error('[roi-agent] report save failed:', saveError)
        send(res, {
          type: 'error',
          message: 'Failed to save report: ' + saveError.message,
        })
        await flushPostHog()
        res.end()
        return
      }

      if (savedReport?.id) {
        savedReportId = savedReport.id
        // Now that the report row exists, save what the run cost.
        // We wait for it rather than firing it off in the background: Vercel can
        // freeze the server the moment the response ends, and a background write
        // would be lost. This save swallows its own errors, so waiting for it
        // can never block or fail generation.
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
    }

    // Make the PDF and send the email after generation, without waiting.
    // We skip this when the browser has gone away: the report is still saved
    // above and available on the dashboard, but we do not automatically email a
    // company a report whose request was abandoned.
    if (clientDisconnected && mode === 'generate' && state.assembled) {
      console.warn(
        '[roi-agent] client gone — report saved but skipping PDF/email',
      )
    }
    if (
      !IS_DEV &&
      !clientDisconnected &&
      mode === 'generate' &&
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
        // Whoever generated the report gets a copy. The default blind-copy list
        // is a fixed pair of addresses, so anyone outside it — a new salesperson
        // running a bulk batch — had no way to see what went to their own
        // prospects.
        const bcc = [
          ...new Set(
            [...DEFAULT_REPORT_BCC, user.email]
              .filter(Boolean)
              .map((addr) => addr.toLowerCase()),
          ),
        ].filter((addr) => addr !== recipient.toLowerCase())
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
    captureServer(
      EVENTS.GENERATION_COMPLETED,
      {
        ...phBase,
        duration_ms: Date.now() - telemetryStartedAt,
        client_disconnected: clientDisconnected,
      },
      phDistinctId,
    )
  } catch (err) {
    console.error('[roi-agent] Error:', err)
    if (isOpenAIQuotaError(err)) {
      alertOpenAIQuotaError(err, {
        company:
          req.body?.formData?.companyName ?? req.body?.companyName ?? null,
        mode: req.body?.mode ?? null,
      })
    }
    // We send both. The event so the failure shows up in the funnel next to the
    // successful runs, and the exception so it lands in the error list that
    // creates the ticket.
    captureServer(
      EVENTS.GENERATION_FAILED,
      {
        ...phBase,
        duration_ms: Date.now() - telemetryStartedAt,
        // PostHog is the error list we actually work through. A failure count
        // with no reason attached is not something anyone can act on.
        error_message: err?.message ?? String(err),
      },
      phDistinctId,
    )
    captureServerException(err, phBase, phDistinctId)
    send(res, { type: 'error', message: friendlyErrorMessage(err) })
  }

  // The server can be frozen the instant the connection closes, so send the
  // tracking data now rather than trusting a timer that may never fire.
  await flushPostHog()
  res.end()
}
