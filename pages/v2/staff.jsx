import Link from 'next/link'
import { isStaff, NOT_STAFF } from '../../src/v2/staff'
import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin'

export async function getServerSideProps({ req, res }) {
  const staffCheck = await isStaff(req, res)
  if (!staffCheck) {
    return NOT_STAFF
  }

  const { data: reports, error } = await getSupabaseAdmin()
    .from('v2_reports')
    .select('id, company, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching reports:', error)
  }

  return {
    props: {
      reports: reports || [],
    },
  }
}

export default function StaffPage({ reports }) {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Staff Reports List</h1>

      <div className="bg-white shadow rounded-lg overflow-hidden border">
        <ul className="divide-y divide-gray-200">
          {reports.length === 0 ? (
            <li className="p-4 text-gray-500">No reports found.</li>
          ) : (
            reports.map((report) => (
              <li
                key={report.id}
                className="p-4 hover:bg-gray-50 flex justify-between items-center"
              >
                <div>
                  <span className="font-semibold text-gray-800">
                    {report.company || 'Unnamed Company'}
                  </span>
                  <span className="text-sm text-gray-400 block">
                    {new Date(report.created_at).toLocaleDateString()}
                  </span>
                </div>
                <Link
                  href={`/v2/report/${report.id}`}
                  className="text-blue-600 hover:underline text-sm font-medium"
                >
                  View Report →
                </Link>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
