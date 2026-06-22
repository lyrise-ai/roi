import { createClient } from '@supabase/supabase-js'

// Use fallback strings so createClient() doesn't throw at module-load time
// (which breaks `next build` when env vars aren't available during compilation).
// Any actual API call made without real credentials will fail with a network
// or auth error at runtime, which is the right place to surface the problem.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key'

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
