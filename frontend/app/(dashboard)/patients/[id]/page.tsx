'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Mic, MessageSquare, AlertCircle, Activity, Brain } from 'lucide-react'
import { motion } from 'framer-motion'

export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [patient, setPatient] = useState<any>(null)
  const [handoffs, setHandoffs] = useState<any[]>([])
  const [memories, setMemories] = useState<any[]>([])
  const [alerts, setAlerts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [p, h, m, a] = await Promise.all([
        supabase.from('patients').select('*').eq('id', id).single(),
        supabase
          .from('handoffs')
          .select('*')
          .eq('patient_id', id)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('memories')
          .select('*')
          .eq('patient_id', id)
          .order('importance', { ascending: false })
          .limit(8),
        supabase.from('alerts').select('*').eq('patient_id', id).eq('acknowledged', false),
      ])
      setPatient(p.data)
      setHandoffs(h.data || [])
      setMemories(m.data || [])
      setAlerts(a.data || [])
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) return <p className="text-sm text-slate-500">Loading patient...</p>
  if (!patient) return <p className="text-sm text-slate-500">Patient not found</p>

  const stabilityTone =
    patient.stability_score >= 80 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
    patient.stability_score >= 60 ? 'bg-amber-50 text-amber-700 border-amber-200' :
    'bg-red-50 text-red-700 border-red-200'

  return (
    <div className="max-w-6xl space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">{patient.department}</p>
            <h1 className="text-2xl font-medium text-slate-900 mt-1">{patient.name}</h1>
            <p className="text-sm text-slate-500 mt-1">
              MRN {patient.mrn} · Bed {patient.bed} · Age {patient.age} · {patient.sex}
            </p>
            <p className="text-sm text-slate-700 mt-3 leading-relaxed">{patient.diagnosis}</p>
          </div>
          <span className={`px-3 py-1.5 rounded-md text-sm font-medium border ${stabilityTone}`}>
            Stability {patient.stability_score}
          </span>
        </div>
      </motion.div>

      <div className="flex gap-3">
        <Link href={`/patients/${id}/handoff`}>
          <Button className="gap-2">
            <Mic className="w-4 h-4" /> Record handoff
          </Button>
        </Link>
        <Link href={`/patients/${id}/ask`}>
          <Button variant="outline" className="gap-2">
            <MessageSquare className="w-4 h-4" /> Ask institutional memory
          </Button>
        </Link>
      </div>

      {alerts.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Card className="p-5 bg-amber-50/40 backdrop-blur-xl border-amber-200/60">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              <h2 className="font-medium text-slate-900 text-sm">Open alerts ({alerts.length})</h2>
            </div>
            <div className="space-y-2">
              {alerts.map((a) => (
                <div key={a.id} className="text-sm text-slate-700">
                  <span className="font-medium">{a.title}</span>
                  <span className="text-slate-500 ml-2">· {a.severity}</span>
                  <p className="text-slate-600 text-xs mt-0.5">{a.message}</p>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5 bg-white/60 backdrop-blur-xl">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-slate-600" />
            <h2 className="font-medium text-slate-900 text-sm">
              Recent handoffs ({handoffs.length})
            </h2>
          </div>
          {handoffs.length === 0 ? (
            <p className="text-sm text-slate-500">No handoffs yet. Record one to populate institutional memory.</p>
          ) : (
            <div className="space-y-3">
              {handoffs.map((h) => (
                <div
                  key={h.id}
                  className="border-b border-slate-200/60 pb-3 last:border-0 last:pb-0"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-xs text-slate-500">
                      {new Date(h.created_at).toLocaleString()}
                    </p>
                    {h.escalation_risk && (
                      <Badge
                        variant={
                          h.escalation_risk === 'critical' || h.escalation_risk === 'high'
                            ? 'destructive'
                            : 'secondary'
                        }
                        className="text-xs"
                      >
                        {h.escalation_risk}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-slate-700 line-clamp-2">{h.raw_transcript}</p>
                  {h.hidden_concerns && Array.isArray(h.hidden_concerns) && h.hidden_concerns.length > 0 && (
                    <p className="text-xs text-amber-700 mt-1.5">
                      ⚠ {h.hidden_concerns.length} hidden concern
                      {h.hidden_concerns.length > 1 ? 's' : ''} detected
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5 bg-white/60 backdrop-blur-xl">
          <div className="flex items-center gap-2 mb-4">
            <Brain className="w-4 h-4 text-slate-600" />
            <h2 className="font-medium text-slate-900 text-sm">
              Top memories ({memories.length})
            </h2>
          </div>
          {memories.length === 0 ? (
            <p className="text-sm text-slate-500">No memories yet for this patient.</p>
          ) : (
            <div className="space-y-3">
              {memories.map((m) => (
                <div
                  key={m.id}
                  className="border-b border-slate-200/60 pb-3 last:border-0 last:pb-0"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-xs capitalize">{m.memory_type}</Badge>
                    <span className="text-xs text-slate-400">
                      importance {(m.importance * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-sm text-slate-700">{m.content}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}