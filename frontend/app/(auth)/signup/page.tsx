'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { motion } from 'framer-motion'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    
    const { data, error: signupError } = await supabase.auth.signUp({
      email,
      password,
    })
    
    if (signupError) {
      setError(signupError.message)
      setLoading(false)
      return
    }
    
    if (data.user) {
      router.push('/onboarding')
    }
    
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-slate-50 p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="w-[420px] p-8 bg-white/70 backdrop-blur-xl border-white/40 shadow-xl">
          <h1 className="text-2xl font-medium text-slate-900 mb-1">Create ShiftBrain account</h1>
          <p className="text-sm text-slate-500 mb-2">Join the clinical handoff memory app.</p>
          <p className="text-xs text-slate-400 mb-6">Demo only. Not for real clinical use. Does not provide medical advice.</p>
          
          <form onSubmit={handleSignup} className="space-y-3">
            <Input
              type="email"
              placeholder="doctor@hospital.org"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="Password (min 6 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
            
            {error && (
              <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>
            )}
            
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating account...' : 'Sign up'}
            </Button>
          </form>
          
          <p className="text-sm text-slate-500 mt-4 text-center">
            Already have an account?{' '}
            <Link href="/login" className="text-blue-600 hover:underline">
              Sign in
            </Link>
          </p>
        </Card>
      </motion.div>
    </div>
  )
}
