'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

export default function Home() {
  const router = useRouter()
  
  useEffect(() => {
    async function check() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        router.push(user ? '/dashboard' : '/login')
      } catch {
        router.push('/login')
      }
    }
    check()
  }, [router])
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
      <p className="text-slate-500 text-sm">Redirecting...</p>
    </div>
  )
}
