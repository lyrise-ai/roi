/* eslint-disable prettier/prettier */
/*
 * What lint is for here: catching bugs. Not style — Prettier owns style, and the
 * pre-commit hook runs it.
 *
 * This used to extend `airbnb` and `sonarjs`, carried over from the marketing
 * site. Roughly sixty lines of this file existed only to switch those rules back
 * off again, one at a time, as each one complained about correct code. Dropping
 * the two presets deleted all sixty. If a rule below ever starts complaining
 * about correct code, delete the rule — do not add a disable comment, and do not
 * silence it file by file.
 */
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
  },

  overrides: [
    // ESLint has no TypeScript parser set up here, so TypeScript declaration
    // files trip the "undefined variable" rule on TypeScript-only names. The
    // TypeScript compiler is what checks those files.
    {
      files: ['**/*.d.ts'],
      rules: { 'no-undef': 'off' },
    },
    // In a test, console output is how it tells you what it did.
    {
      files: ['tests/**', 'evals/**', '**/__tests__/**'],
      rules: { 'no-console': 'off' },
    },
    // The research agent picks its own next move, so a log of what it tried is
    // the only way to answer "why did this company come back empty?". That log
    // has to work in production, which rules out the ROI_DEBUG switch in
    // src/lib/roi/debug.ts.
    //
    // Scoped to this ONE file on purpose. It is the only place in the research
    // code allowed to touch the console — everything else goes through the
    // logger it exports. Widen this and the invariant is gone.
    //
    // It still must not use console.log for a FAILURE. In this system a page
    // that is not there is the ordinary result of looking, and error level is
    // for a real fault. See the note at the top of that file.
    {
      files: ['src/lib/roi/research/log.ts'],
      rules: { 'no-console': 'off' },
    },
  ],

  extends: [
    // Next's own checks. These catch real breakage — a plain <img> that kills
    // the page score, a <Head> used where it does nothing.
    'next/core-web-vitals',
    // Accessibility. Cheap, and this is shown to prospects.
    'plugin:jsx-a11y/recommended',
    // Formatting, and turning off anything that argues with Prettier.
    'prettier',
    'plugin:prettier/recommended',
  ],

  rules: {
    // Error, not warn: `npm run lint` gates on errors, and the pre-commit hook
    // formats automatically, so a violation here means someone bypassed it.
    'prettier/prettier': ['error', { endOfLine: 'auto' }],

    // Dead code hides bugs. This one caught about 20 lines of unused state and
    // three unread catch bindings when it was first switched on.
    // `args: 'none'` keeps positional callback params (req, res, next) legal.
    'no-unused-vars': [
      'warn',
      { args: 'none', varsIgnorePattern: '^_', ignoreRestSiblings: true },
    ],

    // A plain console.log left behind is noise; warn and error are deliberate.
    // This is load-bearing rather than tidiness: CLAUDE.md says never to switch
    // Sentry's console capture back on, because it turns every console.error
    // into an issue and therefore a Linear ticket.
    'no-console': ['warn', { allow: ['warn', 'error'] }],

    // An import with no entry in package.json builds locally and fails on
    // Vercel. Worth keeping for that alone.
    'import/no-extraneous-dependencies': ['error', { packageDir: [__dirname] }],

    // Next resolves its own aliases; this rule does not know about them.
    'import/no-unresolved': 'off',

    // An apostrophe in prose is an apostrophe. React renders it correctly.
    'react/no-unescaped-entities': 'off',

    // A11y rules that fire constantly on correct code in this app.
    'jsx-a11y/click-events-have-key-events': 'off',
    'jsx-a11y/no-static-element-interactions': 'off',
    'jsx-a11y/anchor-is-valid': 'off',
  },
}
