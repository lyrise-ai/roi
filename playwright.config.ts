import { defineConfig, devices } from '@playwright/test'
import { loadEnvConfig } from '@next/env'

// Make .env.local available to global-setup and to the config itself
loadEnvConfig(process.cwd())

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: ['**/global-setup.ts'],
  timeout: 45_000,
  retries: 1,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }], ['list']]
    : [['list']],
  globalSetup: require.resolve('./tests/e2e/global-setup'),

  use: {
    baseURL: 'http://localhost:3777',
    trace: 'on-first-retry',
  },

  projects: [
    // Anonymous project — used by smoke, auth wall, public-page, and API tests.
    // Tests that opt in to this project use:
    //   test.use({ storageState: { cookies: [], origins: [] } })
    {
      name: 'anon',
      use: {
        ...devices['Desktop Chrome'],
        storageState: { cookies: [], origins: [] },
      },
      testIgnore: ['**/dashboard.spec.ts', '**/roi-report-form.spec.ts'],
    },

    // Authenticated project — uses the session saved by global-setup.
    // Runs only tests that explicitly target authenticated flows.
    {
      name: 'authenticated',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/.auth/session.json',
      },
      testMatch: ['**/dashboard.spec.ts', '**/roi-report-form.spec.ts'],
    },
  ],

  webServer: {
    // CI: run against the production build (pre-built in the workflow) so
    // every page serves instantly instead of triggering on-demand compilation.
    // Local: reuse the dev server if already running, otherwise start one.
    command: process.env.CI ? 'npm start -- -p 3777' : 'npm run dev -- -p 3777',
    port: 3777,
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
  },
})
