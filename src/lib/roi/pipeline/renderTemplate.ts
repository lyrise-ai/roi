// ─────────────────────────────────────────────────────────────────────────────
// renderTemplate — fills the {{$json.display.*}} gaps in the HTML template.
// Pulled out of pages/api/roi-report.js so the agent and the email route can
// both use it.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs'
import path from 'path'

import type { AssembleReportOutput } from '@/src/lib/roi/types'

const ARABIC_RE =
  /[\u0600-\u06FF\u0750-\u077F\u0870-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function wrapIfRtl(text: string): string {
  if (!ARABIC_RE.test(text)) return escapeHtml(text)
  return `<span dir="rtl" style="font-family:'Cairo',sans-serif;unicode-bidi:embed;">${escapeHtml(text)}</span>`
}

// Fields that hold plain names rather than HTML, and may be in Arabic
const NAME_FIELDS = new Set(['recipientDisplay'])

// The only two report templates there are. Listed explicitly rather than
// trusted, so no caller can ever point this at a file outside public/.
const TEMPLATES = new Set(['roi-template.html', 'roi-exec-template.html'])

export function loadTemplate(filename = 'roi-template.html'): string {
  if (!TEMPLATES.has(filename)) throw new Error(`Unknown template: ${filename}`)
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- whitelisted above
  return fs.readFileSync(path.join(process.cwd(), 'public', filename), 'utf-8')
}

export function renderTemplate(
  templateHtml: string,
  assembled: AssembleReportOutput,
): string {
  let out = templateHtml
  // Fill in every {{$json.display.<key>}} gap
  Object.entries(assembled.display).forEach(([key, value]) => {
    // The key is one of our own field names, never anything a caller passed in.
    // eslint-disable-next-line security/detect-non-literal-regexp
    const placeholder = new RegExp(
      `\\{\\{\\s*\\$json\\.display\\.${key}\\s*\\}\\}`,
      'g',
    )
    const raw = String(value ?? '')
    out = out.replace(placeholder, NAME_FIELDS.has(key) ? wrapIfRtl(raw) : raw)
  })
  // The few gaps that are not under display
  out = out.replace(
    /\{\{\s*\$json\.roi_data\.company\s*\}\}/g,
    wrapIfRtl(String(assembled.roi_data?.company ?? '')),
  )
  out = out.replace(
    /\{\{\s*\$json\.current_date\s*\}\}/g,
    String(assembled.current_date ?? ''),
  )
  return out
}
