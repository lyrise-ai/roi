// Turns one row of a bulk upload into the shape POST /api/roi-agent expects —
// the same shape mapFormToPayload builds in pages/api/roi-agent.js.

import type { BulkRow } from './parseBulkCsv'
import { countryToCurrency } from './countryToCurrency'

const TEAM_SIZE_BANDS: Array<{ max: number; label: string }> = [
  { max: 10, label: '1–10' },
  { max: 50, label: '11–50' },
  { max: 200, label: '51–200' },
  { max: 500, label: '201–500' },
  { max: 1000, label: '501–1,000' },
  { max: 5000, label: '1,001–5,000' },
  { max: Infinity, label: '5,000+' },
]

const REVENUE_BANDS: Array<{ max: number; label: string }> = [
  { max: 1_000_000, label: 'Under $1M' },
  { max: 5_000_000, label: '$1M – $5M' },
  { max: 20_000_000, label: '$5M – $20M' },
  { max: 50_000_000, label: '$20M – $50M' },
  { max: 200_000_000, label: '$50M – $200M' },
  { max: Infinity, label: '$200M+' },
]

function bandifyEmployees(raw: string): string {
  if (!raw) return ''
  const n = Number(String(raw).replace(/[,\s]/g, ''))
  if (!Number.isFinite(n) || n <= 0) return ''
  return TEAM_SIZE_BANDS.find((b) => n <= b.max)?.label ?? ''
}

function bandifyRevenue(raw: string): string {
  if (!raw) return ''
  const n = Number(String(raw).replace(/[,$\s]/g, ''))
  if (!Number.isFinite(n) || n <= 0) return ''
  return REVENUE_BANDS.find((b) => n <= b.max)?.label ?? ''
}

function truncate(s: string, max: number): string {
  if (!s || s.length <= max) return s
  const cut = s.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim()
}

export interface RoiFormPayload {
  companyName: string
  website: string
  businessDescription: string
  email: string
  industry: string
  country: string
  teamSize: string
  revenueRange: string
  currency: string
  recipientName: string
  recipientTitle: string
  linkedin: string
  keyPriorities: string[]
  processes: unknown[]
}

export function mapRowToFormPayload(row: BulkRow): RoiFormPayload {
  const recipientName = `${row.recipientFirstName} ${row.recipientLastName}`
    .replace(/\s+/g, ' ')
    .trim()

  return {
    companyName: row.companyName,
    website: row.website,
    businessDescription: truncate(row.keywords, 200),
    email: row.email,
    industry: row.industry,
    country: row.country,
    teamSize: bandifyEmployees(row.employees),
    revenueRange: bandifyRevenue(row.annualRevenue),
    currency: countryToCurrency(row.country),
    recipientName,
    recipientTitle: row.recipientTitle,
    linkedin: row.companyLinkedinUrl,
    keyPriorities: [],
    processes: [],
  }
}
