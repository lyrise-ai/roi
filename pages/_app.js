import * as React from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { Analytics } from '@vercel/analytics/next'
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
  const posthogUserId = React.useRef(null)

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

    // Tie the person in PostHog to their user id, not their email. Emails
    // change; the id does not. Without this, every session is a brand new
    // anonymous person and "show me everything this user did" is impossible.
    //
    // We only clear the identity on an actual SIGN-OUT, never on "there is no
    // user right now". Supabase reports "no session" on every anonymous page
    // load, and clearing there would create a new anonymous id and cut the
    // session recording in half on every navigation. It would also break the
    // anonymous-to-signed-up funnel, which is the one thing identifying a person
    // exists to protect.
    //
    // Only a real sign-out clears it, so the next person on a shared machine
    // does not inherit the previous one's identity.
    const setPostHogUser = async (event, user) => {
      const { getPostHog } = await import('../src/lib/posthog-browser')
      const posthog = await getPostHog()
      if (!active || !posthog) return

      if (event === 'SIGNED_OUT') {
        posthog.reset()
        posthogUserId.current = null
        return
      }

      // Supabase reports one event after a page reload and another when signing
      // in finishes. Both are moments where we learn who someone is. A token
      // being refreshed is not.
      // If a second account signs in without the first signing out, start a
      // fresh identity rather than merging the two accounts together.
      if (user && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')) {
        if (posthogUserId.current && posthogUserId.current !== user.id) {
          posthog.reset()
        }
        posthog.identify(user.id, { email: user.email })
        posthogUserId.current = user.id
      }
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
      <Analytics />
    </>
  )
}
