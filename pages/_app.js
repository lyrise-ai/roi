import * as React from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import '../styles/global.css'
import { AuthSessionContext } from '../src/context/AuthSessionContext'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://roi.lyrise.ai'

function NavigationProgress() {
  const router = useRouter()
  const [progress, setProgress] = React.useState(0)
  const [visible, setVisible] = React.useState(false)
  const timerRef = React.useRef(null)

  React.useEffect(() => {
    const start = () => {
      setVisible(true)
      setProgress(15)
      timerRef.current = setInterval(() => {
        setProgress((p) => (p >= 85 ? 85 : p + Math.random() * 12))
      }, 400)
    }
    const done = () => {
      clearInterval(timerRef.current)
      setProgress(100)
      setTimeout(() => {
        setVisible(false)
        setProgress(0)
      }, 300)
    }

    router.events.on('routeChangeStart', start)
    router.events.on('routeChangeComplete', done)
    router.events.on('routeChangeError', done)
    return () => {
      clearInterval(timerRef.current)
      router.events.off('routeChangeStart', start)
      router.events.off('routeChangeComplete', done)
      router.events.off('routeChangeError', done)
    }
  }, [router])

  if (!visible) return null
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: `${progress}%`,
        height: 3,
        background: 'var(--lyrise-purple)',
        zIndex: 9999,
        transition: 'width 0.3s ease, opacity 0.3s ease',
        opacity: progress === 100 ? 0 : 1,
        boxShadow: 'var(--shadow-accent)',
      }}
    />
  )
}

export default function MyApp(props) {
  const { Component, pageProps } = props

  const [authUser, setAuthUser] = React.useState(null)
  const [authReady, setAuthReady] = React.useState(false)

  React.useEffect(() => {
    let active = true
    let subscription
    let sentryPromise

    const setSentryUser = async (user) => {
      if (!user && !sentryPromise) return
      sentryPromise ||= import('@sentry/nextjs')
      const Sentry = await sentryPromise
      if (!active) return
      Sentry.setUser(user ? { id: user.id, email: user.email } : null)
    }

    // Tie the PostHog person to the Supabase user id — not the email, which
    // changes and isn't a stable key. Without this, every session is a fresh
    // anonymous person and "show me everything this user did" is impossible.
    //
    // reset() is gated on the SIGNED_OUT event specifically, NOT on "no user".
    // onAuthStateChange fires INITIAL_SESSION with a null session on every
    // anonymous page load, and resetting there would mint a new anonymous id
    // and cut the session recording in two on each navigation — while also
    // breaking the anonymous→signed-up funnel, which is the one thing
    // identify() exists to preserve. Only an actual sign-out should clear the
    // identity, so the next person on a shared machine doesn't inherit it.
    const setPostHogUser = async (event, user) => {
      const { getPostHog } = await import('../src/lib/posthog-browser')
      const posthog = await getPostHog()
      if (!active || !posthog) return
      if (user) posthog.identify(user.id, { email: user.email })
      else if (event === 'SIGNED_OUT') posthog.reset()
    }

    import('../src/lib/supabase-browser')
      .then(({ createClient }) => {
        if (!active) return
        const supabase = createClient()
        const { data } = supabase.auth.onAuthStateChange((event, session) => {
          if (!active) return
          const user = session?.user ?? null
          setAuthUser(user)
          setAuthReady(true)
          setSentryUser(user).catch(() => {})
          setPostHogUser(event, user).catch(() => {})
        })
        subscription = data.subscription
      })
      .catch(() => {
        if (active) setAuthReady(true)
      })

    return () => {
      active = false
      subscription?.unsubscribe()
    }
  }, [])

  const authSessionValue = React.useMemo(
    () => ({ user: authUser, isReady: authReady }),
    [authUser, authReady],
  )

  return (
    <>
      <Head>
        <meta name="viewport" content="initial-scale=1, width=device-width" />
        <title>LyRise ROI Reports</title>
        <meta
          name="description"
          content="AI-powered ROI analysis for your business workflows"
        />
        <meta property="og:title" content="LyRise ROI Reports" />
        <meta
          property="og:description"
          content="Unlock hidden ROI in your operations with AI-powered analysis"
        />
        {/* Absolute — link scrapers won't resolve a relative og:image.
            Self-hosted since the old value pointed at a free image host. */}
        <meta property="og:image" content={`${BASE_URL}/og-image.png`} />
        <meta property="og:type" content="website" />
      </Head>
      <NavigationProgress />
      <AuthSessionContext.Provider value={authSessionValue}>
        <Component {...pageProps} />
      </AuthSessionContext.Provider>
    </>
  )
}
