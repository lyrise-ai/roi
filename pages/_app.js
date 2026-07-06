import * as React from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { CacheProvider } from '@emotion/react'
import theme from '../src/theme'
import createEmotionCache from '../src/utilities/createEmotionCache'
import '../styles/global.css'
import { AuthSessionContext } from '../src/context/AuthSessionContext'

const clientSideEmotionCache = createEmotionCache()

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
        background: '#2957FF',
        zIndex: 9999,
        transition: 'width 0.3s ease, opacity 0.3s ease',
        opacity: progress === 100 ? 0 : 1,
        boxShadow: '0 0 8px rgba(41, 87, 255, 0.6)',
      }}
    />
  )
}

export default function MyApp(props) {
  const { Component, emotionCache = clientSideEmotionCache, pageProps } = props

  React.useEffect(() => {
    if (
      process.env.NEXT_PUBLIC_ENV === 'production' &&
      typeof window !== 'undefined' &&
      process.env.NEXT_PUBLIC_AMPLITUDE
    ) {
      let cancelled = false
      import('amplitude-js')
        .then((module) => {
          const amplitude = module.default ?? module
          if (!cancelled) {
            amplitude
              .getInstance()
              .init(process.env.NEXT_PUBLIC_AMPLITUDE, null, {
                includeReferrer: true,
                includeUtm: true,
              })
          }
        })
        .catch(() => {})
      return () => {
        cancelled = true
      }
    }
    return undefined
  }, [])

  React.useEffect(() => {
    const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
    if (!token || typeof window === 'undefined') return undefined

    let cancelled = false
    import('posthog-js')
      .then(({ default: posthog }) => {
        if (!cancelled) {
          posthog.init(token, {
            api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
          })
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [])

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

    import('../src/lib/supabase-browser')
      .then(({ createClient }) => {
        if (!active) return
        const supabase = createClient()
        const { data } = supabase.auth.onAuthStateChange((_, session) => {
          if (!active) return
          const user = session?.user ?? null
          setAuthUser(user)
          setAuthReady(true)
          setSentryUser(user).catch(() => {})
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
    <CacheProvider value={emotionCache}>
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
        <meta
          property="og:image"
          content="https://i.ibb.co/VYtV50zn/lyrise-logo.jpg"
        />
        <meta property="og:type" content="website" />
      </Head>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <NavigationProgress />
        <AuthSessionContext.Provider value={authSessionValue}>
          <Component {...pageProps} />
        </AuthSessionContext.Provider>
      </ThemeProvider>
    </CacheProvider>
  )
}
