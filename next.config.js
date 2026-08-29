const path = require('path')
const { withSentryConfig } = require('@sentry/nextjs')
const { withPostHogConfig } = require('@posthog/nextjs-config')

// We only build source maps — the files that turn minified code back into
// readable code — when something is going to upload them. Next.js does not make
// them for a production build by default, so without this the PostHog plugin
// finds nothing and fails the build. But making them every time would slow every
// build AND publish this app's source code on any build that does not upload
// and then delete them.
const uploadSourcemaps = Boolean(process.env.POSTHOG_API_KEY)

const nextConfig = {
  reactStrictMode: false,
  productionBrowserSourceMaps: uploadSourcemaps,
  turbopack: {
    resolveAlias: {
      '@components': path.resolve(__dirname, 'src/components'),
      '@hooks': path.resolve(__dirname, 'src/hooks'),
      '@': path.resolve(__dirname),
    },
  },
  async redirects() {
    return [
      {
        source: '/login',
        destination: '/auth/login',
        permanent: false,
      },
    ]
  },
  async headers() {
    return []
  },
  webpack: (config) => {
    config.module.rules.push({
      test: /\.m?js$/,
      type: 'javascript/auto',
      resolve: { fullySpecified: false },
    })
    config.resolve.alias = {
      ...config.resolve.alias,
      '@components': path.resolve(__dirname, 'src/components'),
      '@hooks': path.resolve(__dirname, 'src/hooks'),
      '@': path.resolve(__dirname),
      // The animation library looks for this package when it loads, purely to
      // work with a styling library we do not use. Telling the bundler it
      // resolves to nothing is the whole fix. Installing that package just to
      // silence a warning would ship code we never call.
      // Only needed for the production bundler; the dev one does not warn.
      '@emotion/is-prop-valid': false,
    }
    return config
  },
}

const sentryWrapped = withSentryConfig(nextConfig, {
  silent: true,
  // Sentry's plugin runs first and normally deletes the source maps as soon as
  // it has uploaded them — which left PostHog's plugin with nothing and failed
  // the build. Both tools need the same files, so Sentry now passes them on and
  // PostHog, running second, does the deleting.
  sourcemaps: { deleteSourcemapsAfterUpload: !uploadSourcemaps },
})

// Source maps for PostHog error tracking. Without this a production stack
// trace is minified nonsense, which is exactly when you need to read it.
//
// Skipped unless POSTHOG_API_KEY is present, so local builds and CI don't fail
// on a missing personal API key. That means source maps upload from wherever
// the key is set — Vercel — and nowhere else.
module.exports = uploadSourcemaps
  ? withPostHogConfig(sentryWrapped, {
      personalApiKey: process.env.POSTHOG_API_KEY,
      projectId: process.env.POSTHOG_PROJECT_ID,
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      sourcemaps: {
        enabled: true,
        releaseName: 'lyrise-roi',
        // Vercel sets this on every deploy. It is what ties a stack trace back
        // to the exact commit that produced it.
        releaseVersion: process.env.VERCEL_GIT_COMMIT_SHA,
        // Once uploaded, these files must not also ship to the browser — that
        // would publish this app's source to anyone who opens devtools.
        deleteAfterUpload: true,
      },
    })
  : sentryWrapped
