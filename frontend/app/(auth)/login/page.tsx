'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { motion } from 'framer-motion'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (!error) router.push('/dashboard')
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-slate-50 p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="w-[420px] p-8 backdrop-blur-xl bg-white/70 border-white/40 shadow-xl">
          <h1 className="text-2xl font-medium text-slate-900 mb-1">Clinical Memory</h1>
          <p className="text-sm text-slate-500 mb-6">Institutional memory for hospital shifts</p>
          <form onSubmit={handleLogin} className="space-y-3">
            <Input placeholder="doctor@hospital.org" value={email} onChange={e=>setEmail(e.target.value)} />
            <Input type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>
        </Card>
      </motion.div>
    </div>
  )
}