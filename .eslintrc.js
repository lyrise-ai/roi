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

  // ESLint has no TypeScript parser here, so declaration files trip `no-undef`
  // on TS-only globals (`JSX.Element`). tsc is the gate for those files.
  overrides: [
    {
      files: ['**/*.d.ts'],
      rules: { 'no-undef': 'off' },
    },
    // Tests aren't a trust boundary, and asserting a dynamic URL needs a
    // built regex. console is how a test reports what it did.
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
    'no-underscore-dangle': ['error', { allow: ['_value'] }],

    // Server handlers and the ROI pipeline log deliberately, and Sentry picks
    // those up. Only a bare console.log is noise.
    'no-console': ['warn', { allow: ['warn', 'error'] }],

    // ~100 hits, every one of them `obj[key]` on an object we built. The rule
    // can't tell a prototype-pollution sink from an array index, and at that
    // volume it buries the security warnings that do matter.
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
