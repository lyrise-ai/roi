// ─────────────────────────────────────────────────────────────────────────────
// pdf — converts rendered HTML to PDF using Puppeteer + @sparticuz/chromium
// Works locally (uses locally-installed Chrome) and on Vercel serverless
// (uses the pre-built Chromium binary from @sparticuz/chromium).
// No external API or credentials required.
//
// Renders are serialised per process. @sparticuz/chromium inflates its binary
// to /tmp/chromium, and executablePath() returns that path as soon as it
// exists — which is the moment the write stream is created, not the moment the
// write finishes. Two overlapping renders in one instance therefore had the
// second one exec a half-written binary and die with `spawn ETXTBSY`. Fluid
// Compute reuses an instance across concurrent requests, and bulk upload
// starts a row every 60s while a run takes minutes, so overlap is the norm
// there, not the exception: it cost a 28-report batch its PDFs and, because
// the email is sent from the same try block, every one of its emails.
// ─────────────────────────────────────────────────────────────────────────────

export interface PdfResult {
  base64: string
  filename: string
}

// ponytail: one lock per process, so renders queue instead of overlapping.
// The ceiling is throughput — a batch's PDFs render one at a time within an
// instance. If that ever matters, inflate Chromium to a per-call path instead.
let queue: Promise<unknown> = Promise.resolve()

/** Runs `task` after every task already queued in this process. */
export function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task)
  queue = run.catch(() => undefined)
  return run
}

export function generatePdf(
  html: string,
  filename = 'ROI_Report.pdf',
): Promise<PdfResult> {
  return runExclusive(() => renderPdf(html, filename))
}

async function renderPdf(html: string, filename: string): Promise<PdfResult> {
  const puppeteer = await import('puppeteer-core')

  let executablePath: string
  let args: string[]

  if (process.env.AWS_EXECUTION_ENV || process.env.VERCEL) {
    // Serverless — use the pre-built Chromium binary
    const chromium = (await import('@sparticuz/chromium')).default
    executablePath = await chromium.executablePath()
    args = chromium.args
  } else {
    // Local development — use the system Chrome / Chromium
    const localPaths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', // macOS
      '/usr/bin/google-chrome', // Linux
      '/usr/bin/chromium-browser', // Linux alt
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', // Windows
    ]
    const fs = await import('fs')
    const found = localPaths.find((p) => fs.existsSync(p))
    if (!found) {
      throw new Error(
        'PDF generation: no Chrome/Chromium found locally. ' +
          'Install Google Chrome or set VERCEL=1 to use the bundled binary.',
      )
    }
    executablePath = found
    args = ['--no-sandbox', '--disable-setuid-sandbox']
  }

  const browser = await puppeteer.launch({
    executablePath,
    args,
    headless: true,
  })

  try {
    const page = await browser.newPage()

    // Load the HTML directly — base64 encode to avoid any URL length limits
    await page.setContent(html, { waitUntil: 'networkidle0' })

    // Ensure web fonts (Inter via Google Fonts) are fully loaded before
    // rendering, so the PDF matches the browser preview byte-for-byte
    // instead of falling back to a generic sans-serif mid-render.
    await page.evaluate(() => document.fonts.ready)

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    })

    const base64 = Buffer.from(pdfBuffer).toString('base64')
    return { base64, filename }
  } finally {
    await browser.close()
  }
}
