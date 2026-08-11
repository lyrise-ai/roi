import { defineConfig, devices } from '@playwright/test'
import { loadEnvConfig } from '@next/env'

// Make .env.local available to global-setup and to the config itself
loadEnvConfig(process.cwd())

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: ['**/global-setup.ts'],
  timeout: 45_000,
  // Retrying locally doubles the wait on a test you are actively fixing, and
  // the 45s timeout means a hang costs 90s before you see it. CI keeps the
  // retry because a real flake there costs a whole re-run.
  retries: process.env.CI ? 1 : 0,
  // Files run in parallel, tests inside a file stay serial (`fullyParallel` is
  // off) so `beforeAll` fixtures still see their own file's tests one at a
  // time. Two files own ~70% of the suite — golden-path and report-access —
  // so serial workers meant everything else queued behind them for nothing.
  // Fixtures are namespaced per run (report-access's `runId`), so concurrent
  // files don't collide in the shared Supabase project.
  workers: process.env.CI ? 4 : undefined,
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
      testIgnore: [
        '**/dashboard.spec.ts',
        '**/roi-report-form.spec.ts',
        '**/report-access.spec.ts',
        '**/golden-path.spec.ts',
      ],
    },

    // Authenticated project — uses the session saved by global-setup.
    // Runs only tests that explicitly target authenticated flows.
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
    // CI: run against the production build (pre-built in the workflow) so
    // every page serves instantly instead of triggering on-demand compilation.
    // Local: reuse the dev server if already running, otherwise start one.
    command: process.env.CI ? 'npm start -- -p 3777' : 'npm run dev -- -p 3777',
    port: 3777,
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
  },
})
