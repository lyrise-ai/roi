const path = require('path')
const { withSentryConfig } = require('@sentry/nextjs')
const { withPostHogConfig } = require('@posthog/nextjs-config')

const nextConfig = {
  reactStrictMode: false,
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
    return [
      {
        source: '/api/roi-agent',
        headers: [{ key: 'x-vercel-max-duration', value: '300' }],
      },
    ]
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
      // framer-motion probes for this at import time purely for
      // styled-components interop, which this app doesn't use. Telling webpack
      // it resolves to nothing is the whole fix — installing @emotion to
      // silence a warning would ship a package we never call.
      // Webpack only; turbopack (npm run dev) doesn't emit the warning.
      '@emotion/is-prop-valid': false,
    }
    return config
  },
}

const sentryWrapped = withSentryConfig(nextConfig, {
  silent: true,
})

// Source maps for PostHog error tracking. Without this a production stack
// trace is minified nonsense, which is exactly when you need to read it.
//
// Skipped unless POSTHOG_API_KEY is present, so local builds and CI don't fail
// on a missing personal API key. That means source maps upload from wherever
// the key is set — Vercel — and nowhere else.
module.exports = process.env.POSTHOG_API_KEY
  ? withPostHogConfig(sentryWrapped, {
      personalApiKey: process.env.POSTHOG_API_KEY,
      projectId: process.env.POSTHOG_PROJECT_ID,
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      sourcemaps: {
        enabled: true,
        releaseName: 'lyrise-roi',
        // Vercel sets this on every deploy; it's what ties a stack trace back
        // to the exact commit that produced it.
        releaseVersion: process.env.VERCEL_GIT_COMMIT_SHA,
        // Uploaded maps must not also ship in the bundle — that would publish
        // this app's source to anyone who opens devtools.
        deleteAfterUpload: true,
      },
    })
  : sentryWrapped
