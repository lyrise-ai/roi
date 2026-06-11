import * as React from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { CacheProvider } from '@emotion/react'
import theme from '../src/theme'
import createEmotionCache from '../src/utilities/createEmotionCache'
import '../styles/global.css'
import { initAmplitude } from '../src/utilities/amplitude'

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
      typeof window !== 'undefined'
    ) {
      initAmplitude()
    }
  }, [])

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
        <Component {...pageProps} />
      </ThemeProvider>
    </CacheProvider>
  )
}
