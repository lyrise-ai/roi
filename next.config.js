const path = require('path')

module.exports = {
  reactStrictMode: false,
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
    config.resolve.alias = {
      ...config.resolve.alias,
      '@components': path.resolve(__dirname, 'src/components'),
      '@hooks': path.resolve(__dirname, 'src/hooks'),
      // ROI pipeline uses @/ as project root alias
      '@': path.resolve(__dirname),
    }
    return config
  },
}
