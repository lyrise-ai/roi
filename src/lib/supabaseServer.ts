import { createClient } from '@supabase/supabase-js'

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

export const supabaseServer = createClient(url, anonKey, {
  auth: { persistSession: false },
})
