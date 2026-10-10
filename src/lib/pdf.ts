// ─────────────────────────────────────────────────────────────────────────────
// pdf — turns the rendered HTML into a PDF, using Puppeteer with a bundled copy
// of Chromium. It works locally, where it uses the Chrome you already have
// installed, and on Vercel, where it uses the bundled build. No outside service
// and no credentials needed.
//
// PDFs are rendered one at a time per server process. Here is why. The bundled
// Chromium unpacks itself to a file in /tmp, and the function that tells us
// where it is returns that path as soon as the file EXISTS — which is when
// writing starts, not when it finishes. So two PDFs rendering at once in the
// same server meant the second one tried to run a half-written program and died
// with `spawn ETXTBSY`.
//
// Vercel reuses one server for several requests at once, and bulk upload starts
// a new report every 60 seconds while each takes minutes. So overlapping is
// normal there, not rare. It cost one 28-report batch all of its PDFs — and,
// because the email is sent inside the same block, all of its emails too.
// ─────────────────────────────────────────────────────────────────────────────

export interface PdfResult {
  base64: string
  filename: string
}

// ponytail: one queue per server process, so renders line up instead of
// overlapping. The limit is speed: a batch's PDFs render one after another
// inside one server. If that ever matters, unpack Chromium to its own path per
// call instead.
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
    // On Vercel: use the bundled Chromium
    const chromium = (await import('@sparticuz/chromium')).default
    executablePath = await chromium.executablePath()
    args = chromium.args
  } else {
    // On a laptop: use the Chrome that is already installed
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

    // Hand the HTML straight to the page, rather than through a URL, so page
    // length can never hit a URL limit
    await page.setContent(html, { waitUntil: 'networkidle0' })

    // Wait for the web fonts to finish loading before rendering, so the PDF
    // looks exactly like the preview in the browser instead of falling back to
    // a plain system font halfway through.
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
