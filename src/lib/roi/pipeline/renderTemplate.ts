// ─────────────────────────────────────────────────────────────────────────────
// renderTemplate — fills {{$json.display.*}} placeholders in the HTML template
// Extracted from pages/api/roi-report.js for shared use by agent + email routes
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

// Fields whose values are plain names (not HTML blobs) and may contain Arabic
const NAME_FIELDS = new Set(['recipientDisplay'])

// The only two report templates that exist. Whitelisted rather than trusted,
// so no caller can ever steer this path anywhere but public/.
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
  // Replace all {{$json.display.<key>}} placeholders
  Object.entries(assembled.display).forEach(([key, value]) => {
    // `key` is an AssembleReportOutput field name, not caller-supplied input.
    // eslint-disable-next-line security/detect-non-literal-regexp
    const placeholder = new RegExp(
      `\\{\\{\\s*\\$json\\.display\\.${key}\\s*\\}\\}`,
      'g',
    )
    const raw = String(value ?? '')
    out = out.replace(placeholder, NAME_FIELDS.has(key) ? wrapIfRtl(raw) : raw)
  })
  // Top-level fields
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
