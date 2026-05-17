'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AlertCircle, CheckCircle2 } from 'lucide-react'

const SEVERITY_TONE: Record<string, string> = {
  low: 'bg-slate-100 text-slate-700',
  medium: 'bg-amber-50 text-amber-700',
  high: 'bg-orange-50 text-orange-700',
  critical: 'bg-red-50 text-red-700',
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAlerts()
  }, [])

  async function loadAlerts() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    
    const { data: profile } = await supabase
      .from('profiles')
      .select('department')
      .eq('id', user.id)
      .single()

    if (!profile) return

    const { data } = await supabase
      .from('alerts')
      .select('*, patients!inner(name, bed, department)')
      .eq('patients.department', profile.department)
      .eq('acknowledged', false)
      .order('created_at', { ascending: false })

    setAlerts(data || [])
    setLoading(false)
  }

  async function acknowledge(id: string) {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase
      .from('alerts')
      .update({ acknowledged: true, acknowledged_by: user?.id })
      .eq('id', id)
    loadAlerts()
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-medium text-slate-900">Active alerts</h1>
        <p className="text-slate-500 text-sm mt-1">Unresolved concerns from recent handoffs</p>
      </div>

      {loading && (
        <p className="text-sm text-slate-500">Loading...</p>
      )}

      {!loading && alerts.length === 0 && (
        <Card className="p-8 bg-white/60 backdrop-blur-xl flex flex-col items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mb-3" />
          <p className="text-slate-700 font-medium">No active alerts</p>
          <p className="text-slate-500 text-sm">All concerns have been acknowledged</p>
        </Card>
      )}

      <div className="space-y-2">
        {alerts.map((a) => (
          <Card key={a.id} className="p-4 bg-white/60 backdrop-blur-xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1">
                <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium text-slate-900 text-sm">{a.title}</p>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_TONE[a.severity]}`}>
                      {a.severity}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600">{a.message}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {a.patients?.name} · Bed {a.patients?.bed} · {new Date(a.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => acknowledge(a.id)}>
                Acknowledge
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}