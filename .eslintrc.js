/* eslint-disable prettier/prettier */
module.exports = {
  root: true,
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },

  env: {
    browser: true,
    node: true,
    es6: true,
  },

  settings: {
    react: {
      version: 'detect',
    },
    'import/resolver': {
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
      },
    },
  },

  // ESLint has no TypeScript parser set up here, so TypeScript declaration files
  // trip the "undefined variable" rule on TypeScript-only names. The TypeScript
  // compiler is what checks those files.
  overrides: [
    {
      files: ['**/*.d.ts'],
      rules: { 'no-undef': 'off' },
    },
    // Tests are not a place outside input arrives, and checking a URL that
    // changes needs a pattern built at run time. In a test, console output is
    // how it tells you what it did.
    {
      files: ['tests/**', 'evals/**', '**/__tests__/**'],
      rules: {
        'security/detect-non-literal-regexp': 'off',
        'no-console': 'off',
      },
    },
  ],

  plugins: ['sonarjs'],
  extends: [
    'next/core-web-vitals',
    'airbnb',
    'prettier',
    'plugin:jsx-a11y/recommended',
    'plugin:prettier/recommended',
    'plugin:security/recommended-legacy',
  ],

  rules: {
    // That name is PostHog's own public "has it finished loading" flag. Their
    // name, not ours.
    'no-underscore-dangle': ['error', { allow: ['_value', '__loaded'] }],

    // Our server code and the ROI pipeline log on purpose, and Sentry picks
    // those up. Only a plain console.log is noise.
    'no-console': ['warn', { allow: ['warn', 'error'] }],

    // About 100 hits, every one of them looking up a key on an object we built
    // ourselves. The rule cannot tell a genuinely risky lookup from an array
    // index, and at that volume it buries the security warnings that do
    // matter.
    'security/detect-object-injection': 'off',

    'react/prop-types': 'off',
    // Error, not warn: `npm run lint` only gates on errors, and the pre-commit
    // hook auto-formats, so a violation here means someone bypassed the hook.
    'prettier/prettier': ['error', { endOfLine: 'auto' }],
    'react/react-in-jsx-scope': 'off',
    'react/forbid-prop-types': 'off',
    'react/jsx-filename-extension': [
      'warn',
      { extensions: ['.js', '.jsx', '.ts', '.tsx'] },
    ],
    'react/jsx-props-no-spreading': 'off',
    'import/extensions': [
      'error',
      'ignorePackages',
      {
        js: 'never',
        jsx: 'never',
        ts: 'never',
        tsx: 'never',
      },
    ],
    'jsx-a11y/anchor-is-valid': [
      'error',
      {
        components: ['Link'],
        specialLink: ['hrefLeft', 'hrefRight'],
        aspects: ['invalidHref', 'preferButton'],
      },
    ],
    'no-nested-ternary': 'off',
    'import/prefer-default-export': 'off',
    'import/no-useless-path-segments': 'off',
    'react/jsx-boolean-value': 'off',
    'react/jsx-curly-brace-presence': 'off',
    'prefer-template': 'off',
    'import/no-unresolved': 'off',
    'jsx-a11y/no-noninteractive-element-to-interactive-role': 'off',
    'jsx-a11y/role-has-required-aria-props': 'off',
    'jsx-a11y/click-events-have-key-events': 'off',
    'jsx-a11y/no-static-element-interactions': 'off',
    'import/order': 'off',
    'import/no-extraneous-dependencies': [
      'error',
      {
        packageDir: [__dirname],
      },
    ],
    // Was 'off', which is how ~20 lines of dead state and three unread catch
    // bindings survived the port. `args: 'none'` keeps positional callback
    // params (req, res, next) legal.
    'no-unused-vars': [
      'warn',
      { args: 'none', varsIgnorePattern: '^_', ignoreRestSiblings: true },
    ],
    'no-shadow': 'off',
    'import/no-absolute-path': 'off',
    'react/no-unknown-property': 'off',
    'react/jsx-no-target-blank': 'off',
    'sonarjs/no-duplicate-string': 'off',
    'vars-on-top': 'off',
    'no-var': 'off',
    'no-bitwise': 'off',
    'react/jsx-no-bind': 'off',
    'react/self-closing-comp': 'off',
    'no-use-before-define': 'off',
    camelcase: 'off',
    'block-scoped-var': 'off',
    'jsx-a11y/no-noninteractive-element-interactions': 'off',
    'no-plusplus': 'off',
    'no-await-in-loop': 'off',
    'prefer-destructuring': 'off',
    'no-param-reassign': 'off',
    'react/no-array-index-key': 'off',
    'sonarjs/cognitive-complexity': 'off',
    'sonarjs/no-collapsible-if': 'off',
    'sonarjs/no-nested-conditional': 'off',
    'sonarjs/no-nested-functions': 'off',
    'sonarjs/no-unused-vars': 'off',
    'sonarjs/no-dead-store': 'off',
    'sonarjs/pseudo-random': 'off',
    'sonarjs/super-linear-regex': 'off',
    'jsx-a11y/label-has-associated-control': 'off',
    'import/newline-after-import': 'off',
    'no-empty': 'off',
    'no-return-assign': 'off',
    'dot-notation': 'off',
    'react/no-unescaped-entities': 'off',
    'prefer-const': 'off',
    'no-restricted-syntax': 'off',
    'consistent-return': 'off',
    'react/destructuring-assignment': 'off',
  },
}
