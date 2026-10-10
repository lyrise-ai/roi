import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 4 : 1,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:3777',
    trace: 'on-first-retry',
  },
  // CI serves the build made earlier in the workflow; locally, the dev server.
  webServer: {
    command: process.env.CI ? 'npm start -- -p 3777' : 'npm run dev -- -p 3777',
    port: 3777,
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
  },
})
