const path = require('path')
const { withSentryConfig } = require('@sentry/nextjs')

const nextConfig = {
  reactStrictMode: false,
  transpilePackages: [
    '@mui/material',
    '@mui/system',
    '@mui/styled-engine',
    '@mui/icons-material',
    '@mui/base',
    '@mui/utils',
    '@mui/private-theming',
    '@mui/types',
  ],
  eslint: {
    ignoreDuringBuilds: true,
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
    }
    return config
  },
}

module.exports = withSentryConfig(nextConfig, {
  silent: true,
})
