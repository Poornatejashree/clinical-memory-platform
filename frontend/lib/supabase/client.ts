import { createBrowserClient } from '@supabase/ssr'
import { env, validateFrontendEnv } from '@/lib/env'

validateFrontendEnv()

export const supabase = createBrowserClient(
  env.supabaseUrl,
  env.supabaseAnonKey
)
