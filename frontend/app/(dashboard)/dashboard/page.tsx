'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'

export default function DashboardPage() {
  const [profile, setProfile] = useState<any>(null)
  
  useEffect(() => {
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()
        setProfile(data)
      }
    }
    loadProfile()
  }, [])
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-medium text-slate-900">
          Welcome{profile?.full_name ? `, ${profile.full_name}` : ''}
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          {profile ? `${profile.role} · ${profile.department}` : 'Loading...'}
        </p>
        
        <div className="grid grid-cols-3 gap-4 mt-6">
          <Card className="p-5 bg-white/60 backdrop-blur-xl">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Patients</p>
            <p className="text-2xl font-medium text-slate-900 mt-2">—</p>
          </Card>
          <Card className="p-5 bg-white/60 backdrop-blur-xl">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Alerts</p>
            <p className="text-2xl font-medium text-slate-900 mt-2">—</p>
          </Card>
          <Card className="p-5 bg-white/60 backdrop-blur-xl">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Memories</p>
            <p className="text-2xl font-medium text-slate-900 mt-2">—</p>
          </Card>
        </div>
        
        <p className="text-sm text-slate-400 mt-8">Dashboard is wired. Full features coming next.</p>
      </div>
    </div>
  )
}