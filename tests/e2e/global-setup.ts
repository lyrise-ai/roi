import { chromium, type FullConfig } from '@playwright/test'
import { loadEnvConfig } from '@next/env'
import * as fs from 'fs'
import * as path from 'path'

const AUTH_FILE = path.join(__dirname, '../.auth/session.json')

export default async function globalSetup(_config: FullConfig) {
  // Load .env.local so TEST_USER_* vars are available when running via CLI
  loadEnvConfig(process.cwd())

  const email = process.env.TEST_USER_EMAIL
  const password = process.env.TEST_USER_PASSWORD

  if (!email || !password) {
    console.warn(
      '[globalSetup] TEST_USER_EMAIL / TEST_USER_PASSWORD not set — ' +
        'authenticated tests will fail. Add them to .env.local to enable them.',
    )
    fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true })
    fs.writeFileSync(AUTH_FILE, JSON.stringify({ cookies: [], origins: [] }))
    return
  }

  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    await page.goto('http://localhost:3777/auth/login')
    await page.fill('[placeholder="Work email"]', email)
    await page.fill('[placeholder="Password"]', password)
    await page.click('button[type="submit"]')
    // Wait for the post-login redirect — dashboard is the standard destination
    await page.waitForURL('**/dashboard**', { timeout: 30_000 })
    fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true })
    await context.storageState({ path: AUTH_FILE })
    console.log('[globalSetup] Auth state saved for', email)
  } finally {
    await browser.close()
  }
}
