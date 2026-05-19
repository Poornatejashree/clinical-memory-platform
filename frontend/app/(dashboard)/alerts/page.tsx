'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/card'
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
  const [error, setError] = useState('')

  useEffect(() => {
    loadAlerts()
  }, [])

  async function loadAlerts() {
    setLoading(true)
    setError('')
    try {
      const data = await api.get<any[]>('/api/alerts/')
      setAlerts(Array.isArray(data) ? data : [])
    } catch (err: any) {
      setAlerts([])
      setError(err.message || 'Could not load alerts right now.')
    } finally {
      setLoading(false)
    }
  }

  async function acknowledge(id: string) {
    try {
      const data = await api.request<any>(`/api/alerts/${id}/ack`, { method: 'POST' })
      if (data.ok === false) throw new Error(data.error || 'Could not acknowledge alert.')
      setAlerts((prev) => prev.filter((alert) => alert.id !== id))
    } catch (err: any) {
      setError(err.message || 'Could not acknowledge alert.')
    }
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-medium text-slate-900">Active alerts</h1>
        <p className="text-slate-500 text-sm mt-1">Unresolved concerns from recent handoffs</p>
      </div>

      {error && (
        <Card className="p-4 bg-amber-50/70 border-amber-100">
          <p className="text-sm text-amber-800">{error}</p>
        </Card>
      )}

      {loading && <p className="text-sm text-slate-500">Loading alerts...</p>}

      {!loading && alerts.length === 0 && (
        <Card className="p-8 bg-white/60 backdrop-blur-xl flex flex-col items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mb-3" />
          <p className="text-slate-700 font-medium">No alerts yet</p>
          <p className="text-slate-500 text-sm">Risk flags from saved handoffs will appear here.</p>
        </Card>
      )}

      <div className="space-y-2">
        {alerts.map((alert) => (
          <Card key={alert.id} className="p-4 bg-white/60 backdrop-blur-xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1">
                <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium text-slate-900 text-sm">{alert.title || 'Handoff concern'}</p>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_TONE[alert.severity] || SEVERITY_TONE.medium}`}>
                      {alert.severity || 'medium'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600">{alert.message || 'A saved handoff needs review.'}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {alert.patients?.name || 'Patient'} - Bed {alert.patients?.bed || 'n/a'} - {alert.created_at ? new Date(alert.created_at).toLocaleString() : 'recent'}
                  </p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => acknowledge(alert.id)}>
                Acknowledge
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
