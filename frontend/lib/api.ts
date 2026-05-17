import { supabase } from './supabase/client'

const BASE = process.env.NEXT_PUBLIC_API_URL!

async function authHeader() {
  const { data } = await supabase.auth.getSession()
  return { Authorization: `Bearer ${data.session?.access_token}` }
}

export const api = {
  async get<T>(path: string): Promise<T> {
    const headers = await authHeader()
    const r = await fetch(`${BASE}${path}`, { headers })
    if (!r.ok) throw new Error(await r.text())
    return r.json()
  },
  async post<T>(path: string, body: unknown): Promise<T> {
    const headers = await authHeader()
    const r = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) throw new Error(await r.text())
    return r.json()
  },
  async postFile<T>(path: string, file: File): Promise<T> {
    const headers = await authHeader()
    const fd = new FormData()
    fd.append('audio', file)
    const r = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: fd })
    return r.json()
  },
}