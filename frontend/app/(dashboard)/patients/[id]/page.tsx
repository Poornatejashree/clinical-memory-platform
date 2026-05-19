'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { api } from '@/lib/api'
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
  const [patterns, setPatterns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [receiving, setReceiving] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const patientData = await api.get<any>(`/api/patients/${id}`)
        const h = await api.get<any[]>(`/api/handoffs/patient/${id}`)
        const [m, a, p] = await Promise.all([
          supabase
            .from('memories')
            .select('*')
            .eq('patient_id', id)
            .order('importance', { ascending: false })
            .limit(8),
          supabase.from('alerts').select('*').eq('patient_id', id).eq('acknowledged', false),
          api.get<any>(`/api/patients/${id}/patterns`),
        ])
        setPatient(patientData)
        setHandoffs(h || [])
        setMemories(m.data || [])
        setAlerts(a.data || patientData.open_alerts || [])
        setPatterns(p.patterns || [])
      } catch (err: any) {
        setError(err.message || 'Could not load patient.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  if (loading) return <p className="text-sm text-slate-500">Loading patient...</p>
  if (error) return <p className="text-sm text-amber-700 bg-amber-50 p-3 rounded">{error}</p>
  if (!patient) return <p className="text-sm text-slate-500">Patient not found</p>

  const stabilityTone =
    patient.stability_score >= 80 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
    patient.stability_score >= 60 ? 'bg-amber-50 text-amber-700 border-amber-200' :
    'bg-red-50 text-red-700 border-red-200'
  const latest = handoffs[0]
  const latestSummary = latest?.structured_summary || {}

  async function markReceived() {
    if (!latest) return
    setReceiving(true)
    try {
      const updated = await api.request<any>(`/api/handoffs/${latest.id}/receive`, { method: 'POST' })
      setHandoffs((prev) => prev.map((h) => h.id === latest.id ? { ...h, ...updated, incoming_doctor_id: updated.incoming_doctor_id || 'received' } : h))
    } catch {
      // Keep the patient page usable if the backend is unavailable.
    } finally {
      setReceiving(false)
    }
  }

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
        {latest && !latest.incoming_doctor_id && (
          <Button variant="secondary" onClick={markReceived} disabled={receiving}>
            {receiving ? 'Marking...' : 'Mark latest handoff received'}
          </Button>
        )}
      </div>

      {latest && (
        <Card className="p-5 bg-blue-50/60 backdrop-blur-xl border-blue-100">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-blue-700">Latest handoff summary</p>
              <h2 className="font-medium text-slate-900 mt-1">
                {latestSummary.doctor_name ? `${latestSummary.doctor_name} - ` : ''}
                {latest.shift_type || latestSummary.shift || 'shift'} handoff
              </h2>
              {latestSummary.formal_note && <p className="text-sm text-slate-700 mt-3"><span className="font-medium">Formal note:</span> {latestSummary.formal_note}</p>}
              {latestSummary.gut_concern && <p className="text-sm text-amber-800 mt-2"><span className="font-medium">Gut concern:</span> {latestSummary.gut_concern}</p>}
              {latestSummary.things_not_in_chart && <p className="text-sm text-slate-700 mt-2"><span className="font-medium">Not in chart:</span> {latestSummary.things_not_in_chart}</p>}
              {latestSummary.watch_outs && <p className="text-sm text-slate-700 mt-2"><span className="font-medium">Watch-outs:</span> {latestSummary.watch_outs}</p>}
            </div>
            <Badge variant={latest.incoming_doctor_id ? 'secondary' : 'outline'}>
              {latest.incoming_doctor_id ? 'Received' : 'Pending'}
            </Badge>
          </div>
        </Card>
      )}

      <Card className={`p-5 backdrop-blur-xl ${patterns.length > 0 ? 'bg-amber-50/60 border-amber-200/70' : 'bg-white/60 border-slate-200/70'}`}>
        <div className="flex items-center gap-2 mb-3">
          <AlertCircle className={`w-4 h-4 ${patterns.length > 0 ? 'text-amber-600' : 'text-slate-400'}`} />
          <h2 className="font-medium text-slate-900 text-sm">
            {patterns.length > 0 ? 'Cross-shift pattern detected' : 'Cross-shift patterns'}
          </h2>
        </div>
        {patterns.length === 0 ? (
          <p className="text-sm text-slate-500">No repeated cross-shift concerns detected yet.</p>
        ) : (
          <div className="space-y-3">
            {patterns.map((pattern, index) => (
              <div key={`${pattern.pattern}-${index}`} className="rounded-lg border border-amber-100 bg-white/70 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="capitalize">{pattern.risk_level || 'medium'}</Badge>
                  <p className="text-sm font-medium text-slate-900">{pattern.pattern}</p>
                  <span className="text-xs text-slate-500">{pattern.evidence_count} signals</span>
                </div>
                {pattern.evidence?.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-slate-600">
                    {pattern.evidence.slice(0, 2).map((item: string, itemIndex: number) => (
                      <li key={itemIndex}>- {item}</li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-xs text-amber-800">{pattern.suggested_action}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

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
                  <p className="text-sm text-slate-700 line-clamp-2">
                    {(h.structured_summary?.formal_note || h.raw_transcript)}
                  </p>
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
