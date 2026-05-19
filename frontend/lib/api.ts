import { supabase } from './supabase/client'
import { BACKEND_OFFLINE_MESSAGE, env } from './env'

const BASE = env.apiUrl

async function authHeader() {
  try {
    const { data } = await supabase.auth.getSession()
    if (!data.session?.access_token) throw new Error('Sign in again to continue.')
    return { Authorization: `Bearer ${data.session.access_token}` }
  } catch (err: any) {
    if (err.message?.includes('Sign in')) throw err
    throw new Error('Could not reach Supabase Auth. Check NEXT_PUBLIC_SUPABASE_URL and your network.')
  }
}

async function readError(response: Response) {
  try {
    const data = await response.json()
    const detail = data.detail || data.error || data
    if (typeof detail === 'string') return detail
    if (detail?.message && detail?.supabase_error?.message) {
      return `${detail.message} ${detail.supabase_error.message}`
    }
    if (detail?.message) return detail.message
    return JSON.stringify(detail)
  } catch {
    return await response.text()
  }
}

async function logResponse(path: string, response: Response) {
  try {
    const body = await response.clone().text()
    console.debug('[api]', path, response.status, body)
  } catch {
    console.debug('[api]', path, response.status, '<unreadable body>')
  }
}

async function request(path: string, init: RequestInit = {}) {
  const directUrl = `${BASE}${path}`
  const proxyUrl = `/api/proxy${path}`
  const localFallbackUrl =
    BASE === 'http://localhost:8000' || BASE === 'http://127.0.0.1:8000'
      ? `http://localhost:8001${path}`
      : ''
  try {
    const response = await fetch(directUrl, init)
    if (response.status === 404 && localFallbackUrl) {
      console.debug('[api]', path, '404 from localhost:8000; retrying localhost:8001')
      return await fetch(localFallbackUrl, init)
    }
    return response
  } catch {
    try {
      return await fetch(proxyUrl, init)
    } catch {
      throw new Error(BACKEND_OFFLINE_MESSAGE)
    }
  }
}

export const api = {
  async get<T>(path: string): Promise<T> {
    const headers = await authHeader()
    const r = await request(path, { headers })
    await logResponse(path, r)
    if (!r.ok) throw new Error(await readError(r))
    return r.json()
  },
  async post<T>(path: string, body: unknown): Promise<T> {
    const headers = await authHeader()
    const r = await request(path, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    await logResponse(path, r)
    if (!r.ok) throw new Error(await readError(r))
    return r.json()
  },
  async postFile<T>(path: string, file: File): Promise<T> {
    const headers = await authHeader()
    const fd = new FormData()
    fd.append('audio', file)
    const r = await request(path, { method: 'POST', headers, body: fd })
    await logResponse(path, r)
    if (!r.ok) throw new Error(await readError(r))
    return r.json()
  },
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = await authHeader()
    const r = await request(path, { ...init, headers: { ...headers, ...(init.headers || {}) } })
    await logResponse(path, r)
    if (!r.ok) throw new Error(await readError(r))
    return r.json()
  },
}
