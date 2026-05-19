'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { LogOut, User } from 'lucide-react'

const DEPARTMENT_LABELS: Record<string, string> = {
  icu: 'ICU',
  emergency: 'Emergency Room',
  cardiology: 'Cardiology',
  neurology: 'Neurology',
  pediatrics: 'Pediatrics',
  surgery: 'Surgery',
}

const ROLE_LABELS: Record<string, string> = {
  senior_doctor: 'Senior Doctor',
  incoming_doctor: 'Incoming Doctor',
  nurse: 'Nurse',
  icu_specialist: 'ICU Specialist',
}

export function Topbar() {
  const [profile, setProfile] = useState<any>(null)
  const router = useRouter()

  useEffect(() => {
    async function loadProfile() {
      try {
        const data = await api.get<any>('/api/auth/me')
        setProfile(data)
      } catch {
        setProfile(null)
      }
    }
    loadProfile()
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <header className="h-16 border-b border-slate-200/60 bg-white/60 backdrop-blur-xl flex items-center justify-between px-6">
      <div>
        <p className="text-sm font-medium text-slate-900">
          {profile?.full_name || 'Loading...'}
        </p>
        <p className="text-xs text-slate-500">
          {profile?.role && profile?.department
            ? `${ROLE_LABELS[profile.role]} · ${DEPARTMENT_LABELS[profile.department]}`
            : ''}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center">
          <User className="w-4 h-4 text-blue-700" />
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="text-slate-600"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign out
        </Button>
      </div>
    </header>
  )
}
