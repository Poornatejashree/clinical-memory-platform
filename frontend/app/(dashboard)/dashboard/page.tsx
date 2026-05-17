'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { motion } from 'framer-motion'
import { AlertCircle, Activity, Users, Brain } from 'lucide-react'

const DEPARTMENT_LABELS: Record<string, string> = {
  icu: 'ICU',
  emergency: 'Emergency Room',
  cardiology: 'Cardiology',
  neurology: 'Neurology',
  pediatrics: 'Pediatrics',
  surgery: 'Surgery',
}

export default function DashboardPage() {
  const [profile, setProfile] = useState<any>(null)
  const [patients, setPatients] = useState<any[]>([])
  const [alertCount, setAlertCount] = useState(0)
  const [memoryCount, setMemoryCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadAll() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Load profile
      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (!prof) {
        setLoading(false)
        return
      }
      setProfile(prof)

      // Load department-scoped data in parallel
      const [patientsRes, alertsRes, memoriesRes] = await Promise.all([
        supabase
          .from('patients')
          .select('*')
          .eq('department', prof.department)
          .order('admission_date', { ascending: false }),
        supabase
          .from('alerts')
          .select('id, patients!inner(department)')
          .eq('patients.department', prof.department)
          .eq('acknowledged', false),
        supabase
          .from('memories')
          .select('id')
          .eq('department', prof.department),
      ])

      setPatients(patientsRes.data || [])
      setAlertCount(alertsRes.data?.length || 0)
      setMemoryCount(memoriesRes.data?.length || 0)
      setLoading(false)
    }
    loadAll()
  }, [])

  const avgStability = patients.length > 0
    ? Math.round(patients.reduce((s, p) => s + (p.stability_score || 0), 0) / patients.length)
    : 0

  function greeting() {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 18) return 'Good afternoon'
    return 'Good evening'
  }

  function stabilityPill(score: number) {
    const tone = score >= 80 ? 'bg-emerald-50 text-emerald-700' :
                 score >= 60 ? 'bg-amber-50 text-amber-700' :
                 'bg-red-50 text-red-700'
    return (
      <span className={`px-2 py-1 rounded-md text-xs font-medium ${tone}`}>
        Stability {score}
      </span>
    )
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-medium text-slate-900">
          {greeting()}{profile?.full_name ? `, ${profile.full_name.split(' ').pop()}` : ''}
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          {profile?.department
            ? `${DEPARTMENT_LABELS[profile.department]} · institutional memory active`
            : 'Your shift overview — institutional memory active'}
        </p>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="Patients on shift"
          value={loading ? '—' : patients.length.toString()}
        />
        <StatCard
          icon={AlertCircle}
          label="Open alerts"
          value={loading ? '—' : alertCount.toString()}
          tone={alertCount > 0 ? 'warn' : 'default'}
        />
        <StatCard
          icon={Activity}
          label="Avg stability"
          value={loading ? '—' : avgStability.toString()}
        />
        <StatCard
          icon={Brain}
          label="Memories stored"
          value={loading ? '—' : memoryCount.toString()}
        />
      </div>

      <Card className="p-6 bg-white/60 backdrop-blur-xl border-slate-200/60">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-medium text-slate-900">Your patients</h2>
          <Link href="/patients" className="text-sm text-blue-600 hover:underline">
            View all →
          </Link>
        </div>

        {loading && (
          <p className="text-sm text-slate-500">Loading patients...</p>
        )}

        {!loading && patients.length === 0 && (
          <div className="text-center py-8">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No patients in your department yet</p>
            <p className="text-xs text-slate-400 mt-1">Run the seed script to populate demo patients</p>
          </div>
        )}

        <div className="space-y-1">
          {patients.slice(0, 5).map((p) => (
            <Link
              key={p.id}
              href={`/patients/${p.id}`}
              className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <div>
                <p className="font-medium text-sm text-slate-900">{p.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Bed {p.bed} · {p.diagnosis}
                </p>
              </div>
              {stabilityPill(p.stability_score || 0)}
            </Link>
          ))}
        </div>
      </Card>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: any
  label: string
  value: string
  tone?: 'default' | 'warn'
}) {
  return (
    <Card className="p-5 bg-white/60 backdrop-blur-xl border-slate-200/60">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
        <Icon
          className={`w-4 h-4 ${tone === 'warn' ? 'text-amber-500' : 'text-slate-400'}`}
        />
      </div>
      <p className="text-2xl font-medium text-slate-900 mt-2">{value}</p>
    </Card>
  )
}