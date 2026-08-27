import { defineConfig, devices } from '@playwright/test'
import { loadEnvConfig } from '@next/env'

// Make .env.local readable by the setup step and by this config file
loadEnvConfig(process.cwd())

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: ['**/global-setup.ts'],
  timeout: 45_000,
  // Retrying on your own machine doubles the wait on a test you are in the
  // middle of fixing, and with a 45-second timeout a hang costs 90 seconds
  // before you see anything. CI keeps the retry, because a genuine flake there
  // costs a whole re-run.
  retries: process.env.CI ? 1 : 0,
  // In CI we run several files at once. Tests INSIDE one file still run one at
  // a time, so each file's setup still sees its own tests in order. That took
  // the CI run from 61 seconds to 25.
  // The access tests give their data unique names per run, so files running
  // side by side do not collide in the shared database.
  //
  // On your own machine it stays one at a time, because golden-path.spec.ts
  // fails every time under parallel runs and passes every time in series. Its
  // freshly generated report gets served straight from the report page instead
  // of redirecting to the check-it-over page — meaning something marked it as
  // already checked before it got there. That test is skipped in CI anyway, so
  // CI keeps the full speed-up. Turning this up locally means finding whatever
  // writes that flag first.
  workers: process.env.CI ? 4 : 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }], ['list']]
    : [['list']],
  globalSetup: require.resolve('./tests/e2e/global-setup'),

  use: {
    baseURL: 'http://localhost:3777',
    trace: 'on-first-retry',
  },

  projects: [
    // The signed-out set, used by the smoke tests, the sign-in wall, public
    // pages and the API tests. A test opts into it with:
    //   test.use({ storageState: { cookies: [], origins: [] } })
    {
      name: 'anon',
      use: {
        ...devices['Desktop Chrome'],
        storageState: { cookies: [], origins: [] },
      },
      testIgnore: [
        '**/dashboard.spec.ts',
        '**/roi-report-form.spec.ts',
        '**/report-access.spec.ts',
        '**/golden-path.spec.ts',
      ],
    },

    // The signed-in set, using the session saved during setup. Only tests that
    // deliberately need to be signed in run here.
    {
      name: 'authenticated',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/.auth/session.json',
      },
      testMatch: [
        '**/dashboard.spec.ts',
        '**/roi-report-form.spec.ts',
        '**/report-access.spec.ts',
        '**/golden-path.spec.ts',
      ],
    },
  ],

  webServer: {
    // In CI: run against the production build, made earlier in the workflow, so
    // every page serves instantly instead of being compiled on first visit.
    // Locally: reuse the dev server if one is running, otherwise start one.
    command: process.env.CI ? 'npm start -- -p 3777' : 'npm run dev -- -p 3777',
    port: 3777,
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
  },
})
