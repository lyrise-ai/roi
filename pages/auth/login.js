import { useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { createRouteClient } from '../../src/lib/supabaseRouteClient'
import { supabase } from '../../src/lib/supabase'

export async function getServerSideProps({ req, res, query }) {
  const supabase = createRouteClient(req, res)
  const { data } = await supabase.auth.getUser()
  const next =
    query.next && query.next.startsWith('/') ? query.next : '/dashboard'

  if (data.user) {
    return { redirect: { destination: next, permanent: false } }
  }

  return { props: { next } }
}

function GoogleIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}
export default function Login({ next = '/dashboard' }) {
  const router = useRouter()
  const [mode, setMode] = useState('login')

  const handleGoogleAuth = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })
  }
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const endpoint = mode === 'signup' ? '/api/auth/signup' : '/api/auth/login'

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.')
        setLoading(false)
        return
      }

      router.push(next)
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%',
    border: '1.5px solid #e5e7eb',
    borderRadius: '10px',
    padding: '11px 14px',
    fontSize: '14px',
    fontFamily: 'inherit',
    outline: 'none',
    background: '#fafafa',
    color: '#2C2C2C',
    boxSizing: 'border-box',
    marginBottom: '10px',
  }

  return (
    <>
      <Head>
        <title>Sign In | LyRise</title>
      </Head>

      <div
        className="flex items-center justify-center min-h-screen px-4 rebranding-landing-page"
        style={{
          position: 'relative',
          overflow: 'hidden',
          background:
            'linear-gradient(135deg, #f0f4ff 0%, #ffffff 50%, #fef0f7 100%)',
        }}
      >
        <div
          style={{
            position: 'relative',
            zIndex: 10,
            width: '100%',
            maxWidth: '380px',
            background: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(12px)',
            borderRadius: '20px',
            padding: '40px 36px',
            boxShadow: '0 8px 48px rgba(0,0,0,0.10)',
          }}
        >
          <div className="text-center mb-7">
            <div
              className="font-outfit font-bold text-[#2C2C2C] mx-auto mb-5"
              style={{ fontSize: '22px', letterSpacing: '-0.5px' }}
            >
              LyRise
            </div>
            <h1
              className="font-outfit font-bold text-[#2C2C2C]"
              style={{
                fontSize: '26px',
                letterSpacing: '-0.5px',
                lineHeight: '1.2',
                marginBottom: '8px',
              }}
            >
              Welcome
            </h1>
            <p
              className="font-outfit text-[15px] text-gray-500"
              style={{ lineHeight: '1.5' }}
            >
              Sign in to access your AI ROI reports
            </p>
          </div>

          <button
            type="button"
            onClick={handleGoogleAuth}
            className="w-full flex items-center justify-center gap-3 font-outfit font-semibold text-[#2C2C2C] bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              border: '1.5px solid #e5e7eb',
              borderRadius: '50px',
              padding: '13px 20px',
              fontSize: '15px',
            }}
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <div className="flex items-center my-5">
            <div className="flex-1 border-t border-gray-200" />
            <span className="mx-3 text-xs text-gray-400 font-outfit">or</span>
            <div className="flex-1 border-t border-gray-200" />
          </div>

          <form onSubmit={handleSubmit}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={inputStyle}
              className="font-outfit"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={inputStyle}
              className="font-outfit"
            />

            {error && (
              <p className="font-outfit text-[12px] text-red-500 mb-3 leading-relaxed">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full font-semibold text-white transition-colors cursor-pointer font-outfit disabled:opacity-60"
              style={{
                background: '#2957FF',
                borderRadius: '50px',
                padding: '13px 20px',
                fontSize: '15px',
                border: 'none',
                marginBottom: '10px',
              }}
            >
              {loading
                ? 'Please wait…'
                : mode === 'signup'
                  ? 'Sign Up'
                  : 'Log In'}
            </button>
          </form>

          <p className="font-outfit text-center text-[13px] text-gray-500">
            {mode === 'login' ? (
              <>
                Don&apos;t have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup')
                    setError('')
                  }}
                  className="font-semibold text-[#2957FF] hover:underline cursor-pointer bg-transparent border-none p-0"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('login')
                    setError('')
                  }}
                  className="font-semibold text-[#2957FF] hover:underline cursor-pointer bg-transparent border-none p-0"
                >
                  Log in
                </button>
              </>
            )}
          </p>

          <p className="font-outfit text-center text-[12px] text-gray-400 mt-4 leading-relaxed">
            By continuing you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </>
  )
}
