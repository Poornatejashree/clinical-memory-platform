'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({ email, password })
      if (loginError) setError(loginError.message)
      else router.push('/dashboard')
    } catch {
      setError('Could not reach Supabase Auth. Check NEXT_PUBLIC_SUPABASE_URL and your network.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-slate-50 p-4">
      <div>
        <Card className="w-[420px] p-8 backdrop-blur-xl bg-white/70 border-white/40 shadow-xl">
          <h1 className="text-2xl font-medium text-slate-900 mb-1">ShiftBrain</h1>
          <p className="text-sm text-slate-500 mb-2">The outgoing doctor talks. The incoming doctor never starts from zero.</p>
          <p className="text-xs text-slate-400 mb-6">Demo only. Not for real clinical use. Does not provide medical advice.</p>
          <form onSubmit={handleLogin} className="space-y-3">
            <Input placeholder="doctor@hospital.org" value={email} onChange={e=>setEmail(e.target.value)} />
            <Input type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} />
            {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
