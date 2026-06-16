import { notifyDevTeam } from '@/src/lib/notifyError'
import { createClient } from '../../src/lib/supabase-server'

// This endpoint is intentionally unauthenticated (share-link visitors hit it),
// so it trusts arbitrary input. Two guards keep it from being abused as an
// email-spam amplifier:
//   1. per-IP throttle (in-memory; best-effort across a single instance)
//   2. hard size caps on every field before it reaches the email
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 5 // alerts per IP per window
const MAX_FIELD_LEN = 4_000
const MAX_STACK_LEN = 20_000
const MAX_CONTEXT_KEYS = 20

// ip -> array of request timestamps within the current window
const hits = new Map()

function isRateLimited(ip) {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  )
  if (recent.length >= RATE_LIMIT_MAX) {
    hits.set(ip, recent)
    return true
  }
  recent.push(now)
  hits.set(ip, recent)
  return false
}

function clampStr(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : undefined
}

function sanitizeContext(context) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    return undefined
  }
  const out = Object.fromEntries(
    Object.entries(context)
      .slice(0, MAX_CONTEXT_KEYS)
      .map(([k, v]) => [
        String(k).slice(0, 200),
        String(v ?? '').slice(0, MAX_FIELD_LEN),
      ]),
  )
  return Object.keys(out).length ? out : undefined
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const ip =
    (req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests' })
  }

  const { error, stack, context, url } = req.body ?? {}
  if (!error || typeof error !== 'string') {
    return res.status(400).json({ error: 'Missing error' })
  }

  let userEmail
  try {
    const supabase = createClient(req, res)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    userEmail = user?.email
  } catch {
    // non-authenticated users (e.g. share-link visitors) — that's fine
  }

  await notifyDevTeam({
    error: clampStr(error, MAX_FIELD_LEN),
    stack: clampStr(stack, MAX_STACK_LEN),
    context: sanitizeContext(context),
    userEmail,
    url: clampStr(url, MAX_FIELD_LEN),
  })

  return res.status(200).json({ ok: true })
}
