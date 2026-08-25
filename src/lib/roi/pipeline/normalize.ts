// ─────────────────────────────────────────────────────────────────────────────
// normalize — a rewrite of the old n8n "Normalize Input" step.
// Handles both the current form, which sends a list of processes, and the older
// flat field names.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  NormalizedInput,
  ProcessInput,
  QuestionnairePayload,
} from '@/src/lib/roi/types'

export function normalizeInput(
  body: Partial<QuestionnairePayload>,
): NormalizedInput {
  const src = body

  const companyName = src['Company Name'] ?? ''
  const website = src['Company Website URL'] ?? ''
  const email = src.Email ?? ''
  const recipientName = src['Recipient Name'] ?? ''
  const recipientTitle = src['Recipient Title'] ?? ''
  const selectedCurrency = src['Operating Currency'] ?? ''
  const businessDescription = src['What does your company do?'] ?? ''
  const teamSize = src['Number of Employees'] ?? ''
  const revenueRange = src['Estimated Annual Revenue'] ?? ''
  const industry = src.Industry ?? ''
  const country = src.Country ?? ''
  const keyPriorities = Array.isArray(src['Key Priorities'])
    ? src['Key Priorities']
    : []

  let processes: ProcessInput[] = []

  if (Array.isArray(src.processes) && src.processes.length > 0) {
    // The current form: already in the right shape
    processes = src.processes.map((p) => ({
      name: p.name ?? '',
      department: p.department ?? 'Operations',
      icon: p.icon ?? '🔧',
      volume_per_month: p.volume_per_month ?? null,
      time_per_item: p.time_per_item ?? null,
      owner_role: p.owner_role ?? null,
      systems_used: p.systems_used ?? [],
      decision_points: p.decision_points ?? [],
      handoffs: p.handoffs ?? [],
      steps: p.steps ?? [],
    }))
  } else {
    // The older form: flat field names
    const primary = src['Biggest time drain on your team'] ?? ''
    const primVol = src['Monthly volume of this process (approx.)'] ?? null
    const primTime = src['Primary process time per item'] ?? null
    const extra = src['Any other bottlenecks to mention? (optional)'] ?? ''

    if (primary) {
      processes.push({
        name: primary,
        department: 'Operations',
        icon: '🔧',
        volume_per_month: primVol,
        time_per_item: primTime,
        owner_role: null,
        systems_used: [],
        decision_points: [],
        handoffs: [],
        steps: [],
      })
    }

    if (extra) {
      extra
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((chunk) => {
          const nameMatch = chunk.match(/^([^(~]+)/)
          const volMatch = chunk.match(/~([^,)]+per\s+month[^,)]*)/i)
          const timeMatch = chunk.match(/~([^,)]+(?:minutes?|hours?)[^,)]*)/i)
          const procName = nameMatch
            ? nameMatch[1].replace(/^Also:\s*/i, '').trim()
            : chunk.split('(')[0].trim()
          if (procName) {
            processes.push({
              name: procName,
              department: 'Operations',
              icon: '🔧',
              volume_per_month: volMatch ? volMatch[1].trim() : null,
              time_per_item: timeMatch ? timeMatch[1].trim() : null,
              owner_role: null,
              systems_used: [],
              decision_points: [],
              handoffs: [],
              steps: [],
            })
          }
        })
    }
  }

  const primaryProcess = processes[0]?.name ?? ''
  const volumeHint = processes[0]?.volume_per_month ?? 'Not sure'
  const primaryTimeHint = processes[0]?.time_per_item ?? ''
  const additionalContext = processes
    .slice(1)
    .map((p) => {
      let s = p.name
      if (p.volume_per_month) s += ` (~${p.volume_per_month})`
      if (p.time_per_item) s += ` (~${p.time_per_item})`
      return s
    })
    .join('; ')

  const workContext = [primaryProcess, additionalContext]
    .filter(Boolean)
    .join('. Also: ')

  return {
    companyName,
    website,
    email,
    recipientName,
    recipientTitle,
    selectedCurrency,
    businessDescription,
    teamSize,
    revenueRange,
    industry,
    country,
    keyPriorities,
    processes,
    primaryProcess,
    volumeHint,
    primaryTimeHint,
    additionalContext,
    workContext,
  }
}
