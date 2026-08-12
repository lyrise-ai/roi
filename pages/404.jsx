/* The 404, built from the design (`404 Page.dc.html`).

   It also exists for a build reason. `pages/_error.tsx` is Sentry's — it
   reports the exception, then renders Next's default error page. Without a
   `pages/404` of its own, Next routes every missing page through `_error`,
   which opts the 404 out of static optimization and reports a plain 404 to
   Sentry as though it were a fault. `next build` warns about exactly this.

   So: no `getInitialProps` and no data fetching here, or the page goes back
   to being server-rendered on demand. Sizes are tokens or relative units —
   the two display sizes the design uses sit between type-scale roles, so they
   interpolate between existing size tokens rather than naming new ones. */
import Head from 'next/head'
import Image from 'next/image'
import Link from 'next/link'
import Logo from '@/src/assets/logo.svg'
import { Button } from '@components/ui'

const SUPPORT_EMAIL = 'support@lyrise.ai'

export default function NotFound() {
  return (
    <>
      <Head>
        <title>Page not found | LyRise</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main
        style={{
          position: 'relative',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'var(--surface-subtle)',
          color: 'var(--text-heading)',
        }}
      >
        {/* The one piece of brand warmth on an error page: a soft purple
            bloom behind the numeral, not a decorated box around it. */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background:
              'radial-gradient(46% 42% at 50% 34%, rgba(102, 102, 255, 0.13) 0%, rgba(102, 102, 255, 0) 70%)',
          }}
        />

        <header
          style={{
            position: 'relative',
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-4)',
            padding: 'var(--space-5) var(--space-6)',
          }}
        >
          {/* 70x24 is the asset's own 138:47 ratio at --space-6 tall, sized by
              attribute: next/image warns when a rendered dimension disagrees
              with the one it was given. */}
          <Image src={Logo} alt="LyRise" width={70} height={24} priority />
          <Link
            href="/auth/login"
            style={{
              font: 'var(--type-label)',
              color: 'var(--text-body)',
              textDecoration: 'none',
            }}
          >
            Sign in
          </Link>
        </header>

        <section
          style={{
            position: 'relative',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: 'var(--space-12) var(--space-6) var(--space-20)',
          }}
        >
          <p
            style={{
              margin: '0 0 var(--space-6)',
              font: 'var(--type-eyebrow)',
              letterSpacing: 'var(--tracking-caps)',
              textTransform: 'uppercase',
              color: 'var(--lyrise-purple)',
            }}
          >
            Error 404
          </p>

          <p
            aria-hidden="true"
            style={{
              margin: '0 0 var(--space-8)',
              font: 'var(--weight-extrabold) clamp(var(--text-5xl), 16vw, 7.4rem)/var(--leading-tight) var(--font-display)',
              letterSpacing: '-0.045em',
            }}
          >
            4<span style={{ color: 'var(--lyrise-purple)' }}>0</span>4
          </p>

          <h1
            style={{
              margin: '0 0 var(--space-4)',
              maxWidth: '24ch',
              font: 'var(--weight-extrabold) clamp(var(--text-xl), 5vw, var(--text-3xl))/var(--leading-snug) var(--font-display)',
              letterSpacing: 'var(--tracking-tight)',
              textWrap: 'pretty',
            }}
          >
            This page isn&rsquo;t here.
          </h1>

          <p
            style={{
              margin: '0 0 var(--space-10)',
              maxWidth: '46ch',
              font: 'var(--type-body)',
              color: 'var(--text-body)',
              textWrap: 'pretty',
            }}
          >
            The link may be out of date, or the Profit Map it pointed to was
            deleted. Nothing you&rsquo;ve saved is affected.
          </p>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 'var(--space-3)',
            }}
          >
            {/* `as={Link}` rather than a bare href: both targets are routes in
                this app, so the navigation stays client-side. */}
            <Button as={Link} href="/dashboard">
              Back to my Profit Maps
            </Button>
            <Button as={Link} variant="secondary" href="/roi-report">
              Start a new map
            </Button>
          </div>

          <p
            style={{
              margin: 'var(--space-12) 0 0',
              font: 'var(--weight-regular) var(--text-sm)/var(--leading-relaxed) var(--font-body)',
              color: 'var(--text-muted)',
            }}
          >
            Think this page should exist? Email{' '}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              style={{
                color: 'var(--text-link)',
                fontWeight: 'var(--weight-semibold)',
              }}
            >
              {SUPPORT_EMAIL}
            </a>{' '}
            and we&rsquo;ll take a look.
          </p>
        </section>
      </main>
    </>
  )
}
