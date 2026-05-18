'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { motion } from 'framer-motion'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { VoiceRecorder } from '@/components/handoff/voice-recorder'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function HandoffPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [transcript, setTranscript] = useState('')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setLoading(true)
    setError('')

    const { data: { session } } = await supabase.auth.getSession()
    const { data: { user } } = await supabase.auth.getUser()

    if (!session || !user) {
      router.push('/login')
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('department')
      .eq('id', user.id)
      .single()

    try {
      const r = await fetch(`${API}/api/handoffs/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          patient_id: id,
          transcript,
          department: profile?.department || 'icu',
          shift_type: 'day',
        }),
      })

      if (!r.ok) {
        const text = await r.text()
        throw new Error(text)
      }

      const data = await r.json()
      setResult(data.extraction)
    } catch (e: any) {
      setError(e.message || 'Failed to submit handoff')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-5xl space-y-6">
      <Link href={`/patients/${id}`} className="text-sm text-blue-600 inline-flex items-center gap-1">
        <ArrowLeft className="w-3 h-3" /> Back to patient
      </Link>

      <div>
        <h1 className="text-2xl font-medium text-slate-900">Record shift handoff</h1>
        <p className="text-slate-500 text-sm mt-1">AI extracts hidden concerns, risks, and monitoring priorities</p>
      </div>

      <Card className="p-6 bg-white/60 backdrop-blur-xl">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-slate-700">Speak or type your handoff</p>
          <VoiceRecorder onTranscript={(text) => setTranscript(prev => prev ? prev + ' ' + text : text)} />
        </div>
        <Textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Patient stable on 2L O2 but I'm still concerned about overnight desaturations..."
          className="min-h-[200px] bg-white/80"
        />
        {error && (
          <p className="text-sm text-red-600 bg-red-50 p-2 rounded mt-3">{error}</p>
        )}
        <Button onClick={submit} disabled={loading || !transcript} className="mt-4 gap-2">
          {loading ? (
            <><Sparkles className="w-4 h-4 animate-pulse" /> Extracting intelligence...</>
          ) : 'Submit handoff'}
        </Button>
      </Card>

      {result && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="p-6 bg-white/60 backdrop-blur-xl">
            <h2 className="font-medium mb-4">Extracted intelligence</h2>

            {result.hidden_concerns?.length > 0 && (
              <section className="mb-5">
                <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-2">Hidden concerns</h3>
                {result.hidden_concerns.map((c: any, i: number) => (
                  <div key={i} className="p-3 bg-amber-50/60 rounded-lg mb-2 border border-amber-100">
                    <p className="text-sm text-slate-800">{c.concern}</p>
                    {c.evidence && (
                      <p className="text-xs text-slate-500 italic mt-1">"{c.evidence}"</p>
                    )}
                  </div>
                ))}
              </section>
            )}

            {result.risks?.length > 0 && (
              <section className="mb-5">
                <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-2">Risks</h3>
                <div className="flex flex-wrap gap-2">
                  {result.risks.map((r: any, i: number) => (
                    <Badge key={i} variant={r.severity === 'critical' ? 'destructive' : 'secondary'}>
                      {r.risk} · {r.severity}
                    </Badge>
                  ))}
                </div>
              </section>
            )}

            {result.monitoring_priorities?.length > 0 && (
              <section>
                <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-2">Monitoring priorities</h3>
                <ul className="text-sm text-slate-700 space-y-1">
                  {result.monitoring_priorities.map((m: string, i: number) => (
                    <li key={i}>• {m}</li>
                  ))}
                </ul>
              </section>
            )}

            {result._meta && (
              <div className="mt-5 pt-4 border-t flex items-center gap-4 text-xs text-slate-500">
                <span>Routed: <strong>{result._meta.tier}</strong></span>
                <span>Cost: ${result._meta.cost?.toFixed(5)}</span>
                <span>Latency: {result._meta.latency_ms}ms</span>
              </div>
            )}

            <div className="mt-5 flex gap-2">
              <Link href={`/patients/${id}/ask`}>
                <Button variant="outline" size="sm">Ask institutional memory →</Button>
              </Link>
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  )
}