import { useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { createRouteClient } from '../../src/lib/supabaseRouteClient'
import { createClient as createBrowserClient } from '../../src/lib/supabase-browser'
import { INTER_FONT_FAMILY } from '../../src/utilities/fonts'
import LoadingButton from '../../src/components/shared/Button/LoadingButton'

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
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')

  const handleGoogleAuth = async () => {
    setGoogleLoading(true)
    try {
      document.cookie = `auth_next=${encodeURIComponent(next)}; path=/; max-age=300; SameSite=Lax`
    } catch {}
    try {
      const supabase = createBrowserClient()
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })
    } finally {
      setGoogleLoading(false)
    }
  }

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

  return (
    <>
      <Head>
        <title>Sign In | LyRise</title>
      </Head>

      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#E2DED8',
          padding: '24px 16px',
          fontFamily: INTER_FONT_FAMILY,
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '400px',
            background: '#ffffff',
            borderRadius: '16px',
            padding: '40px 36px',
            boxShadow: '0 2px 24px rgba(0,0,0,0.08)',
          }}
        >
          {/* Logo */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 32,
            }}
          >
            <div
              style={{
                background: '#0B1528',
                color: 'white',
                borderRadius: 6,
                width: 28,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                fontWeight: 700,
                flexShrink: 0,
                letterSpacing: '-0.3px',
              }}
            >
              Ly
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#0B1528' }}>
              LyRise
            </span>
            <span style={{ color: '#D1D5DB', fontSize: 13 }}>/</span>
            <span style={{ fontSize: 12, color: '#9CA3AF' }}>
              AI Profit Map
            </span>
          </div>

          {/* Heading */}
          <div style={{ marginBottom: 28 }}>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: '#0F172A',
                margin: '0 0 6px',
                letterSpacing: '-0.4px',
                lineHeight: 1.2,
              }}
            >
              {mode === 'signup' ? 'Create your account' : 'Welcome back'}
            </h1>
            <p
              style={{
                fontSize: 14,
                color: '#6B7280',
                margin: 0,
                lineHeight: 1.55,
              }}
            >
              {mode === 'signup'
                ? 'Start building AI Profit Maps for your clients.'
                : 'Sign in to access your AI Profit Maps.'}
            </p>
          </div>

          {/* Google OAuth */}
          <LoadingButton
            type="button"
            onClick={handleGoogleAuth}
            loading={googleLoading}
            loadingText="Connecting…"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              border: '1.5px solid #E5E7EB',
              borderRadius: 10,
              padding: '11px 16px',
              fontSize: 14,
              fontWeight: 500,
              color: '#0F172A',
              background: '#fff',
              cursor: googleLoading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              marginBottom: 20,
              boxSizing: 'border-box',
              transition: 'border-color 0.15s',
              opacity: googleLoading ? 0.7 : 1,
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.borderColor = '#9CA3AF')
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.borderColor = '#E5E7EB')
            }
          >
            <GoogleIcon />
            Continue with Google
          </LoadingButton>

          {/* Divider */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 20,
            }}
          >
            <div style={{ flex: 1, height: 1, background: '#F3F4F6' }} />
            <span style={{ fontSize: 12, color: '#9CA3AF' }}>or</span>
            <div style={{ flex: 1, height: 1, background: '#F3F4F6' }} />
          </div>

          {/* Email / password form */}
          <form onSubmit={handleSubmit}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                marginBottom: 12,
              }}
            >
              <input
                type="email"
                placeholder="Work email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                style={{
                  border: '1.5px solid #E5E7EB',
                  borderRadius: 10,
                  padding: '11px 14px',
                  fontSize: 14,
                  fontFamily: 'inherit',
                  outline: 'none',
                  color: '#0F172A',
                  background: '#FAFAFA',
                  boxSizing: 'border-box',
                  width: '100%',
                  transition: 'border-color 0.15s',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#5B48F8')}
                onBlur={(e) => (e.target.style.borderColor = '#E5E7EB')}
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={
                  mode === 'signup' ? 'new-password' : 'current-password'
                }
                style={{
                  border: '1.5px solid #E5E7EB',
                  borderRadius: 10,
                  padding: '11px 14px',
                  fontSize: 14,
                  fontFamily: 'inherit',
                  outline: 'none',
                  color: '#0F172A',
                  background: '#FAFAFA',
                  boxSizing: 'border-box',
                  width: '100%',
                  transition: 'border-color 0.15s',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#5B48F8')}
                onBlur={(e) => (e.target.style.borderColor = '#E5E7EB')}
              />
            </div>

            {error && (
              <p
                style={{
                  fontSize: 12,
                  color: '#EF4444',
                  margin: '0 0 12px',
                  lineHeight: 1.5,
                }}
              >
                {error}
              </p>
            )}

            <LoadingButton
              type="submit"
              loading={loading}
              loadingText="Please wait…"
              style={{
                width: '100%',
                background: loading ? '#A49CF4' : '#5B48F8',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                padding: '12px 16px',
                fontSize: 14,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                marginBottom: 16,
                boxSizing: 'border-box',
                transition: 'background 0.15s',
              }}
            >
              {mode === 'signup' ? 'Create account' : 'Sign in'}
            </LoadingButton>
          </form>

          {/* Mode toggle */}
          <p
            style={{
              fontSize: 13,
              color: '#6B7280',
              textAlign: 'center',
              margin: 0,
            }}
          >
            {mode === 'login' ? (
              <>
                Don&apos;t have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup')
                    setError('')
                  }}
                  style={{
                    color: '#5B48F8',
                    fontWeight: 600,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    fontFamily: 'inherit',
                    fontSize: 'inherit',
                  }}
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
                  style={{
                    color: '#5B48F8',
                    fontWeight: 600,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    fontFamily: 'inherit',
                    fontSize: 'inherit',
                  }}
                >
                  Sign in
                </button>
              </>
            )}
          </p>

          <p
            style={{
              fontSize: 11,
              color: '#9CA3AF',
              textAlign: 'center',
              marginTop: 16,
              marginBottom: 0,
              lineHeight: 1.5,
            }}
          >
            By continuing you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </>
  )
}
