import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

function serializeCookie(name, value, options = {}) {
  let str = `${name}=${encodeURIComponent(value)}`
  if (options.maxAge != null) str += `; Max-Age=${Math.floor(options.maxAge)}`
  if (options.domain) str += `; Domain=${options.domain}`
  str += options.path ? `; Path=${options.path}` : '; Path=/'
  if (options.expires instanceof Date)
    str += `; Expires=${options.expires.toUTCString()}`
  if (options.httpOnly) str += '; HttpOnly'
  if (options.secure) str += '; Secure'
  if (options.sameSite) {
    const s = options.sameSite === true ? 'Strict' : options.sameSite
    str += `; SameSite=${s.charAt(0).toUpperCase() + s.slice(1)}`
  }
  return str
}

export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
}

export function createClient(req, res) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return Object.entries(req.cookies).map(([name, value]) => ({
            name,
            value,
          }))
        },
        setAll(cookiesToSet) {
          const serialized = cookiesToSet.map(({ name, value, options }) =>
            serializeCookie(name, value, options),
          )
          const existing = res.getHeader('Set-Cookie')
          const merged = existing
            ? Array.isArray(existing)
              ? [...existing, ...serialized]
              : [existing, ...serialized]
            : serialized
          res.setHeader('Set-Cookie', merged)
        },
      },
    },
  )
}
