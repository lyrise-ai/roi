import { useEffect } from 'react'
import Head from 'next/head'
import { createAdminClient } from '../../src/lib/supabase-server'
import ReportViewerWithBatch from '../../src/components/ROIGenerator/BulkUpload/ReportViewerWithBatch'
import { buildStateFromReportRow } from '@/src/lib/roi/reportState'
import { resolveReportViewerAccess } from '@/src/lib/roi/reportViewerAccess'
import { motion } from 'framer-motion'
import { trackReportAccess } from '@/src/lib/roi/services/reportAccess'
import ErrorBoundary from '../../src/components/shared/ErrorBoundary'

export async function getServerSideProps({
  req,
  res,
  params,
  query,
  resolvedUrl,
}) {
  const access = await resolveReportViewerAccess({
    req,
    res,
    params,
    query,
    resolvedUrl,
  })
  if (access.redirect) return access

  const {
    report,
    isShareLink,
    isEmployee,
    isBulk,
    viewerUserId,
    viewerEmail,
    isAlpha,
    token,
  } = access

  // Self-serve prospects confirm the AI's assumptions in the validation
  // wizard before seeing the polished report. Share-link recipients (already
  // finished, reviewing by email) and bulk-outbound reports (an employee's
  // own internal review flow) bypass this redirect. Employees still get
  // redirected to the wizard for their own reports — they just get the
  // `canSkip` button there (see pages/report/[id]/validate.jsx) instead of
  // bypassing it outright.
  if (!isShareLink && !isBulk && !report.validated_at) {
    return {
      redirect: {
        destination: `/report/${report.id}/validate`,
        permanent: false,
      },
    }
  }

  const admin = createAdminClient()
  const initialState = buildStateFromReportRow(report)

  // Load chat history and usage count in parallel.
  // Share-link visitors see the full thread so they have the owner's prior
  // context; their per-report cap lives on reports.share_message_count, not
  // chat_usage.
  let msgQuery = admin
    .from('chat_messages')
    .select('role, content')
    .eq('report_id', report.id)
    .order('created_at', { ascending: true })
    .limit(20)
  if (!isShareLink && !isEmployee) {
    msgQuery = msgQuery.eq('user_id', viewerUserId)
  }

  let initialMessagesUsed = 0
  if (isShareLink) {
    initialMessagesUsed = report.share_message_count ?? 0
  }

  const [{ data: messages }, usageResult] = await Promise.all([
    msgQuery,
    isShareLink
      ? Promise.resolve({ data: null })
      : admin
          .from('chat_usage')
          .select('message_count')
          .eq('user_id', viewerUserId)
          .eq('report_id', report.id)
          .single(),
  ])

  if (!isShareLink) {
    initialMessagesUsed = usageResult.data?.message_count ?? 0
  }

  const initialChatHistory = (messages ?? [])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .filter((m) => m.content && m.content.trim() !== '')

  await trackReportAccess({
    admin,
    req,
    report,
    reportId: report.id,
    token: isShareLink ? token : null,
    viewerEmail: isShareLink ? report.email : viewerEmail,
    viewerUserId,
    isShareLink,
    isAlpha,
    isEmployee,
  })

  return {
    props: {
      initialState,
      email: report.email,
      reportId: report.id,
      isEmployee,
      isAlpha,
      initialMessagesUsed,
      initialChatHistory,
      isShareLink,
      shareToken: isShareLink ? token : null,
      validatedAt: report.validated_at ?? null,
    },
  }
}

export default function ReportPage({
  initialState,
  email,
  reportId,
  isEmployee,
  isAlpha,
  initialMessagesUsed,
  initialChatHistory,
  isShareLink,
  shareToken,
  validatedAt,
}) {
  // Track that the tester reached and loaded the report page
  useEffect(() => {
    if (!isAlpha) return
    try {
      const token = localStorage.getItem('alpha_token')
      if (!token) return
      import('../../src/lib/supabase-browser').then(({ createClient }) => {
        createClient()
          .from('alpha_feedback')
          .upsert(
            { alpha_token: token, step_generation_completed: true },
            { onConflict: 'alpha_token' },
          )
          .then(({ error }) => {
            if (error) console.error('[alpha] generation page tracking:', error)
          })
      })
    } catch (err) {
      console.error('[alpha] generation page tracking failed:', err)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAlpha])

  // Inject a short usage hint just above the chat textarea when alpha is active.
  // Uses DOM injection because the textarea lives inside ReportViewerWithBatch.
  useEffect(() => {
    if (!isAlpha) return undefined

    const injectChatHint = () => {
      if (document.getElementById('alpha-chat-hint')) return
      const textarea = document.querySelector(
        'textarea[placeholder="Ask me to change anything in the report…"]',
      )
      if (!textarea) return
      const form = textarea.closest('form')
      if (!form) return
      const hint = document.createElement('div')
      hint.id = 'alpha-chat-hint'
      hint.style.cssText = [
        'color:#2957FF;font-size:11px;padding:4px 14px 2px;',
        'line-height:1.5;font-family:inherit',
      ].join('')
      hint.textContent =
        '💡 Try: change currency to EGP · adjust team size · rewrite a section'
      form.parentNode.insertBefore(hint, form)
    }

    const t = setTimeout(injectChatHint, 800)
    return () => clearTimeout(t)
  }, [isAlpha])

  return (
    <ErrorBoundary
      isEmployee={isEmployee}
      pageContext={{ page: 'report', reportId }}
    >
      <Head>
        <title>ROI Report | LyRise</title>
      </Head>
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <ReportViewerWithBatch
          key={reportId}
          initialState={initialState}
          email={email}
          reportId={reportId}
          isEmployee={isEmployee}
          isAlpha={isAlpha}
          initialMessagesUsed={initialMessagesUsed}
          initialChatHistory={initialChatHistory}
          isShareLink={isShareLink}
          shareToken={shareToken}
          forceTour={isShareLink}
          backHref={isShareLink ? null : '/dashboard'}
          validatedAt={validatedAt}
        />
      </motion.div>
    </ErrorBoundary>
  )
}
