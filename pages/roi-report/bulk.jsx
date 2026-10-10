import Head from 'next/head'
import { createClient as createServerClient } from '../../src/lib/supabase-server'
import MainHeader from '@/src/v1/layout/MainHeader'
import BulkIntake from '@/src/v1/components/ROIGenerator/BulkUpload/BulkIntake'
import { ROUTES, loginRedirect } from '@/src/v1/lib/routes'

export async function getServerSideProps({ req, res, resolvedUrl }) {
  const supabase = createServerClient(req, res)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      redirect: { destination: loginRedirect(resolvedUrl), permanent: false },
    }
  }

  const isEmployee = user.email?.endsWith('@lyrise.ai') === true
  if (!isEmployee) {
    return { redirect: { destination: ROUTES.dashboard, permanent: false } }
  }

  return { props: {} }
}

export default function BulkUploadPage() {
  return (
    <div className="min-h-screen -mt-[12px]">
      <Head>
        <title>Bulk Upload | LyRise</title>
      </Head>
      <MainHeader />
      <BulkIntake />
    </div>
  )
}
