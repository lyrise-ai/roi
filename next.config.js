const path = require('path')
const { withSentryConfig } = require('@sentry/nextjs')

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

module.exports = withSentryConfig(nextConfig, {
  silent: true,
})
