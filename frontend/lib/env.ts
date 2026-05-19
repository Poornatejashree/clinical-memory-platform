export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
}

export function validateFrontendEnv() {
  const missing = [
    ['NEXT_PUBLIC_SUPABASE_URL', env.supabaseUrl],
    ['NEXT_PUBLIC_SUPABASE_ANON_KEY', env.supabaseAnonKey],
    ['NEXT_PUBLIC_API_URL', env.apiUrl],
  ].filter(([, value]) => !value)

  if (missing.length > 0) {
    console.error(`Missing frontend env vars: ${missing.map(([key]) => key).join(', ')}`)
  }
}

export const BACKEND_OFFLINE_MESSAGE = 'Backend is not running. Start FastAPI on port 8000.'
