'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Users } from 'lucide-react'

export default function PatientsPage() {
  const [patients, setPatients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('department')
        .eq('id', user.id)
        .single()

      if (!profile) return

      const { data } = await supabase
        .from('patients')
        .select('*')
        .eq('department', profile.department)
        .order('admission_date', { ascending: false })

      setPatients(data || [])
      setLoading(false)
    }
    load()
  }, [])

  function stabilityPill(score: number) {
    const tone = score >= 80 ? 'bg-emerald-50 text-emerald-700' :
                 score >= 60 ? 'bg-amber-50 text-amber-700' :
                 'bg-red-50 text-red-700'
    return <span className={`px-2 py-1 rounded-md text-xs font-medium ${tone}`}>Stability {score}</span>
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-medium text-slate-900">Patients on shift</h1>
        <p className="text-slate-500 text-sm mt-1">Department roster — click for handoff and memory</p>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading...</p>}

      {!loading && patients.length === 0 && (
        <Card className="p-8 bg-white/60 backdrop-blur-xl flex flex-col items-center justify-center">
          <Users className="w-10 h-10 text-slate-400 mb-3" />
          <p className="text-slate-700 font-medium">No patients yet</p>
          <p className="text-slate-500 text-sm">Run the seed script to populate demo patients</p>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {patients.map((p) => (
          <Link key={p.id} href={`/patients/${p.id}`}>
            <Card className="p-5 bg-white/60 backdrop-blur-xl hover:bg-white/80 transition-colors cursor-pointer">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-slate-900">{p.name}</p>
                  <p className="text-sm text-slate-500 mt-0.5">
                    MRN {p.mrn} · Bed {p.bed} · Age {p.age}
                  </p>
                  <p className="text-sm text-slate-600 mt-2">{p.diagnosis}</p>
                </div>
                {stabilityPill(p.stability_score)}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}