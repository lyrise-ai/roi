// Lint is for catching bugs. Prettier owns style. If a rule fights correct
// code, turn it off here, never file by file.
import { createRequire } from 'node:module'
import path from 'node:path'
import { FlatCompat } from '@eslint/eslintrc'

// Next's preset ships its own react and react-hooks plugins; find them there.
const nextDir = path.dirname(
  createRequire(import.meta.url).resolve('eslint-config-next/package.json'),
)
const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
  resolvePluginsRelativeTo: nextDir,
})

const config = [
  { files: ['**/*.{js,jsx,mjs,ts,tsx}'] },
  { linterOptions: { reportUnusedDisableDirectives: 'off' } },
  {
    ignores: [
      '.next/',
      'node_modules/',
      'public/',
      'playwright-report/',
      'test-results/',
    ],
  },
  ...compat.extends(
    'next/core-web-vitals',
    'plugin:jsx-a11y/recommended',
    'plugin:prettier/recommended',
  ),
  {
    rules: {
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
      'no-unused-vars': [
        'warn',
        { args: 'none', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      // Sentry must never capture console (CLAUDE.md), so plain logs stay out.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // An import missing from package.json builds locally and fails on Vercel.
      'import/no-extraneous-dependencies': 'error',
      'import/no-unresolved': 'off',
      'react/no-unescaped-entities': 'off',
      'jsx-a11y/click-events-have-key-events': 'off',
      'jsx-a11y/no-static-element-interactions': 'off',
      'jsx-a11y/anchor-is-valid': 'off',
    },
  },
  {
    files: [
      'tests/**',
      'evals/**',
      '**/__tests__/**',
      'src/lib/roi/research/log.ts',
    ],
    rules: { 'no-console': 'off' },
  },
]

export default config
