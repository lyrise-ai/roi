// Scores a contact by how senior their job title sounds. dedupRows uses it to
// pick the best person to keep per company. Higher means more senior.

const TITLE_PATTERNS: Array<{ score: number; re: RegExp }> = [
  {
    score: 100,
    re: /\b(owner|founder|co-?founder|chair(?:man|woman|person)?)\b/i,
  },
  { score: 90, re: /\b(ceo|cto|cfo|coo|cpo|cmo|ciso|cio|chro|chief)\b/i },
  { score: 85, re: /\b(managing\s+partner|partner)\b/i },
  { score: 75, re: /\b(s?vp|evp|vice\s+president)\b/i },
  { score: 65, re: /\b(director|head\s+of)\b/i },
  { score: 55, re: /\b(senior\s+manager|principal)\b/i },
  { score: 45, re: /\bmanager\b/i },
  { score: 35, re: /\b(senior|sr\.?|lead)\b/i },
  { score: 20, re: /\b(associate|analyst|assistant|junior|jr\.?|entry)\b/i },
]

const SENIORITY_SCORES: Record<string, number> = {
  owner: 100,
  founder: 100,
  'c-suite': 90,
  'c-level': 90,
  cxo: 90,
  partner: 85,
  vp: 75,
  'vice president': 75,
  director: 65,
  head: 65,
  senior: 55,
  manager: 45,
  entry: 20,
  intern: 10,
}

export function seniorityRank(seniority: string, title: string): number {
  const sNorm = (seniority ?? '').toLowerCase().trim()
  const seniorityScore = SENIORITY_SCORES[sNorm] ?? 10

  const matched = TITLE_PATTERNS.find(({ re }) => re.test(title ?? ''))
  const titleScore = matched?.score ?? 0

  return Math.max(seniorityScore, titleScore)
}
