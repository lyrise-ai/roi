import Head from 'next/head'
import { createClient, createAdminClient } from '../../src/lib/supabase-server'
import ReportViewerWithBatch from '../../src/components/ROIGenerator/BulkUpload/ReportViewerWithBatch'
import { buildStateFromReportRow } from '@/src/lib/roi/reportState'
import { motion } from 'framer-motion'
import ErrorBoundary from '../../src/components/shared/ErrorBoundary'
import { isEmployeeUser } from '@/src/lib/isEmployee'

export async function getServerSideProps({ req, res, params, query }) {
  const supabase = createClient(req, res)
  const admin = createAdminClient()

  const token = typeof query?.t === 'string' ? query.t : null

  // Always fetch the report once with its share fields so we can decide
  // whether to grant share-link access before requiring a Supabase session.
  const { data: report } = await admin
    .from('reports')
    .select(
      'id, company_name, email, status, state_data, user_id, share_token, share_revoked_at, share_message_count',
    )
    .eq('id', params.id)
    .single()

  if (!report) {
    return { redirect: { destination: '/dashboard', permanent: false } }
  }

  const isShareLink =
    !!token &&
    !!report.share_token &&
    token === report.share_token &&
    !report.share_revoked_at

  let isEmployee = false
  let viewerUserId = null

  if (!isShareLink) {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { redirect: { destination: '/login', permanent: false } }
    }

    const { data: userData } = await admin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    isEmployee = isEmployeeUser(user, userData)
    viewerUserId = user.id

    if (!isEmployee && report.user_id !== user.id) {
      return { redirect: { destination: '/dashboard', permanent: false } }
    }

    if (!isEmployee && report.status !== 'SUCCESS') {
      return { redirect: { destination: '/dashboard', permanent: false } }
    }
  }

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
    isShareLink || isEmployee
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

  return {
    props: {
      initialState,
      email: report.email,
      reportId: report.id,
      isEmployee,
      initialMessagesUsed,
      initialChatHistory,
      isShareLink,
      shareToken: isShareLink ? token : null,
    },
  }
}

export default function ReportPage({
  initialState,
  email,
  reportId,
  isEmployee,
  initialMessagesUsed,
  initialChatHistory,
  isShareLink,
  shareToken,
}) {
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
          initialState={initialState}
          email={email}
          reportId={reportId}
          isEmployee={isEmployee}
          initialMessagesUsed={initialMessagesUsed}
          initialChatHistory={initialChatHistory}
          isShareLink={isShareLink}
          shareToken={shareToken}
          forceTour={isShareLink}
          backHref={isShareLink ? null : '/dashboard'}
        />
      </motion.div>
    </ErrorBoundary>
  )
}
