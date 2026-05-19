'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'

export default function PatientTimelinePage() {
  const { id } = useParams<{ id: string }>()
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('timeline_events')
      .select('*')
      .eq('patient_id', id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setEvents(data || [])
        setLoading(false)
      })
  }, [id])

  return (
    <div className="max-w-4xl space-y-6">
      <Link href={`/patients/${id}`} className="text-sm text-blue-600 inline-flex items-center gap-1">
        <ArrowLeft className="w-3 h-3" /> Back to patient
      </Link>
      <div>
        <h1 className="text-2xl font-medium text-slate-900">Patient memory timeline</h1>
        <p className="text-sm text-slate-500 mt-1">Recent handoffs, extracted memories, and alerts.</p>
      </div>
      <Card className="p-5 bg-white/70 backdrop-blur-xl">
        {loading && <p className="text-sm text-slate-500">Loading timeline...</p>}
        {!loading && events.length === 0 && <p className="text-sm text-slate-500">No timeline events yet.</p>}
        <div className="space-y-4">
          {events.map((event) => (
            <div key={event.id} className="border-b border-slate-200 pb-4 last:border-0 last:pb-0">
              <p className="text-sm font-medium text-slate-900">{event.title}</p>
              <p className="text-xs text-slate-500">{new Date(event.created_at).toLocaleString()}</p>
              {event.description && <p className="text-sm text-slate-600 mt-2">{event.description}</p>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
