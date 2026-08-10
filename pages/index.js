export async function getServerSideProps({ query }) {
  // Safety net: if Supabase's OAuth callback fails its redirectTo validation it
  // falls back to the site root with ?code=... appended. Rescue the code here
  // so the session exchange still happens at /auth/callback.
  if (query.code) {
    return {
      redirect: {
        destination: `/auth/callback?code=${query.code}`,
        permanent: false,
      },
    }
  }
  return { redirect: { destination: '/dashboard', permanent: false } }
}

export default function Index() {
  return null
}
