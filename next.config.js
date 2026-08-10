const path = require('path')
const { withSentryConfig } = require('@sentry/nextjs')
const { withPostHogConfig } = require('@posthog/nextjs-config')

// Source maps only get built when something is going to upload them. Next
// doesn't emit browser source maps in a production build by default, so
// without this the PostHog plugin finds nothing and fails the build step; and
// generating them unconditionally would both slow every build and serve this
// app's source publicly on any build that doesn't upload-and-delete them.
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
  // Sentry's plugin runs first and, by default, deletes the client source maps
  // as soon as it has uploaded them — which left PostHog's plugin with nothing
  // to upload and failed the build. Both tools need the same maps, so Sentry
  // hands them on and PostHog (running second) does the deleting.
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
        // Vercel sets this on every deploy; it's what ties a stack trace back
        // to the exact commit that produced it.
        releaseVersion: process.env.VERCEL_GIT_COMMIT_SHA,
        // Uploaded maps must not also ship in the bundle — that would publish
        // this app's source to anyone who opens devtools.
        deleteAfterUpload: true,
      },
    })
  : sentryWrapped
