// Cuts an Apollo export down to one row per company, keeping the most senior
// contact.

import type { BulkRow } from './parseBulkCsv'
import { seniorityRank } from './seniorityRank'

function normalizeCompanyKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+&\s+/g, ' and ')
    .replace(/[.,]/g, '')
    .replace(
      /\b(inc|llc|ltd|limited|llp|plc|gmbh|co|corp|corporation|company)\b/g,
      '',
    )
    .replace(/\s+/g, ' ')
    .trim()
}

export function dedupByCompany(rows: BulkRow[]): {
  rows: BulkRow[]
  dedupedCount: number
  warnings: string[]
} {
  const groups = new Map<string, BulkRow[]>()
  const unnamedRows: BulkRow[] = []
  const orderedKeys: string[] = []

  rows.forEach((row) => {
    if (!row.companyName) {
      unnamedRows.push(row)
      return
    }
    const key = normalizeCompanyKey(row.companyName)
    if (!key) {
      unnamedRows.push(row)
      return
    }
    if (!groups.has(key)) {
      groups.set(key, [])
      orderedKeys.push(key)
    }
    groups.get(key)!.push(row)
  })

  const dedupedRows = orderedKeys.map((key) => {
    const candidates = groups.get(key)!
    return candidates.reduce((best, row) => {
      const bestScore = seniorityRank(best.seniority, best.recipientTitle)
      const score = seniorityRank(row.seniority, row.recipientTitle)
      return score > bestScore ? row : best
    }, candidates[0])
  })

  const finalRows = [...dedupedRows, ...unnamedRows]
  const dedupedCount = rows.length - unnamedRows.length - dedupedRows.length

  return {
    rows: finalRows,
    dedupedCount,
    warnings:
      dedupedCount > 0
        ? [
            `Collapsed ${dedupedCount} duplicate ${
              dedupedCount === 1 ? 'row' : 'rows'
            } by company name.`,
          ]
        : [],
  }
}
