'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { motion } from 'framer-motion'
import { AlertCircle, Brain, CheckCircle2, Clock, Plus, Users } from 'lucide-react'

export default function DashboardPage() {
  const [profile, setProfile] = useState<any>(null)
  const [patients, setPatients] = useState<any[]>([])
  const [handoffs, setHandoffs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadAll() {
      try {
        const prof = await api.get<any>('/api/auth/me')
        setProfile(prof)
        const patientRows = await api.get<any[]>('/api/patients/')
        setPatients(patientRows || [])

        if (patientRows.length > 0) {
          const { data: handoffRows } = await supabase
            .from('handoffs')
            .select('*')
            .in('patient_id', patientRows.map((p) => p.id))
            .order('created_at', { ascending: false })
          setHandoffs(handoffRows || [])
        }
      } catch (err: any) {
        setError(err.message || 'Could not load dashboard.')
        setPatients([])
      } finally {
        setLoading(false)
      }
    }
    loadAll()
  }, [])

  const latestByPatient = useMemo(() => {
    const map = new Map<string, any>()
    handoffs.forEach((handoff) => {
      if (!map.has(handoff.patient_id)) map.set(handoff.patient_id, handoff)
    })
    return map
  }, [handoffs])

  const pending = handoffs.filter((h) => !h.incoming_doctor_id).length
  const riskFlags = handoffs.filter((h) => {
    const summary = h.structured_summary || {}
    return h.escalation_risk || summary.gut_concern || summary.things_not_in_chart
  }).length
  const repeatedSignals = handoffs.length - new Set(handoffs.map((h) => h.patient_id)).size

  function greeting() {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 18) return 'Good afternoon'
    return 'Good evening'
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-blue-600">ShiftBrain</p>
            <h1 className="text-2xl font-medium text-slate-900">
              {greeting()}{profile?.full_name ? `, ${profile.full_name.split(' ').pop()}` : ''}
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              The outgoing doctor talks. The incoming doctor never starts from zero.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Demo only. Not for real clinical use. Does not provide medical advice.
            </p>
          </div>
          <Link href="/patients">
            <Button className="gap-2"><Plus className="h-4 w-4" /> Add or Select Patient</Button>
          </Link>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard icon={Users} label="Active patients" value={loading ? '-' : patients.length.toString()} />
        <StatCard icon={Clock} label="Pending handoffs" value={loading ? '-' : pending.toString()} tone={pending > 0 ? 'warn' : 'default'} />
        <StatCard icon={CheckCircle2} label="Received handoffs" value={loading ? '-' : (handoffs.length - pending).toString()} />
        <StatCard icon={AlertCircle} label="Risk flags from saved handoffs" value={loading ? '-' : riskFlags.toString()} tone={riskFlags > 0 ? 'warn' : 'default'} />
        <StatCard icon={Brain} label="Cross-shift signals" value={loading ? '-' : repeatedSignals.toString()} tone={repeatedSignals > 0 ? 'warn' : 'default'} />
      </div>

      {error && (
        <Card className="p-4 bg-amber-50/70 border-amber-100">
          <p className="text-sm text-amber-800">{error}</p>
        </Card>
      )}

      <Card className="p-5 bg-slate-950 text-white border-slate-800">
        <h2 className="font-medium text-sm">CascadeFlow routing display</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm mt-4">
          <RouteStep title="Transcription / summarization" model="Fast model" />
          <RouteStep title="Incoming doctor Q&A" model="Reasoning model" />
          <RouteStep title="Cross-shift pattern analysis" model="Deeper analysis model" />
        </div>
      </Card>

      <Card className="p-6 bg-white/60 backdrop-blur-xl border-slate-200/60">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-medium text-slate-900">Real patients</h2>
          <Link href="/patients" className="text-sm text-blue-600 hover:underline">View all</Link>
        </div>

        {loading && <p className="text-sm text-slate-500">Loading patients...</p>}

        {!loading && patients.length === 0 && (
          <div className="text-center py-8">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No patients yet</p>
            <Link href="/patients"><Button size="sm" className="mt-3">Add Patient</Button></Link>
          </div>
        )}

        <div className="space-y-2">
          {patients.slice(0, 6).map((patient) => {
            const latest = latestByPatient.get(patient.id)
            const summary = latest?.structured_summary || {}
            return (
              <Link key={patient.id} href={`/patients/${patient.id}`} className="block rounded-lg p-3 hover:bg-slate-50 transition-colors">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-sm text-slate-900">{patient.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Bed {patient.bed} - {patient.diagnosis}</p>
                    {latest && <p className="text-xs text-slate-600 mt-1">Latest handoff: {summary.watch_outs || summary.formal_note || latest.raw_transcript?.slice(0, 120)}</p>}
                  </div>
                  <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${latest?.incoming_doctor_id ? 'bg-emerald-50 text-emerald-700' : latest ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                    {latest?.incoming_doctor_id ? 'Received' : latest ? 'Pending handoff' : 'No handoff'}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      </Card>
    </div>
  )
}

function RouteStep({ title, model }: { title: string; model: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900 p-3">
      <p className="text-blue-200">{title}</p>
      <p className="text-slate-400 text-xs mt-1">{model}</p>
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
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
        <Icon className={`w-4 h-4 ${tone === 'warn' ? 'text-amber-500' : 'text-slate-400'}`} />
      </div>
      <p className="text-2xl font-medium text-slate-900 mt-2">{value}</p>
    </Card>
  )
}
