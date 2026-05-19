'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { motion } from 'framer-motion'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { VoiceHandoffInput } from '@/components/voice/voice-handoff-input'
import { SpeechControls } from '@/components/voice/speech-controls'

export default function HandoffPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [transcript, setTranscript] = useState('')
  const [patientName, setPatientName] = useState('')
  const [shift, setShift] = useState('night')
  const [formalNote, setFormalNote] = useState('')
  const [gutConcern, setGutConcern] = useState('')
  const [thingsNotInChart, setThingsNotInChart] = useState('')
  const [watchOuts, setWatchOuts] = useState('')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('patients').select('name').eq('id', id).single().then(({ data }) => {
      if (data?.name) setPatientName(data.name)
    })
  }, [id])

  async function submit() {
    setLoading(true)
    setError('')

    try {
      const data = await api.post<any>('/api/handoffs/', {
        patient_id: id,
        patient_name: patientName,
        transcript,
        formal_note: formalNote,
        gut_concern: gutConcern,
        things_not_in_chart: thingsNotInChart,
        watch_outs: watchOuts,
        department: 'icu',
        shift_type: shift,
      })
      setResult({ ...data.extraction, follow_up_questions: data.follow_up_questions || data.extraction?.follow_up_questions || [] })
    } catch (e: any) {
      if (e.message.includes('Sign in')) router.push('/login')
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
        <h1 className="text-2xl font-medium text-slate-900">Outgoing Doctor Handoff</h1>
        <p className="text-slate-500 text-sm mt-1">ShiftBrain captures the note, the gut-feel, and the context formal charts lose.</p>
      </div>

      <Card className="p-6 bg-slate-950 text-white border-slate-800">
        <p className="text-xs uppercase tracking-wide text-blue-200">ShiftBrain</p>
        <h2 className="mt-1 text-xl font-medium">The outgoing doctor talks. The incoming doctor never starts from zero.</h2>
        <p className="mt-2 text-sm text-slate-300">Demo only. Not for real clinical use. Does not provide medical advice.</p>
      </Card>

      <Card className="p-6 bg-white/70 backdrop-blur-xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">Patient name / selector</p>
            <Input value={patientName} onChange={(e) => setPatientName(e.target.value)} placeholder="Patient name" className="bg-white/80" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">Shift</p>
            <select value={shift} onChange={(e) => setShift(e.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white/80 px-3 text-sm">
              <option value="day">Day</option>
              <option value="night">Night</option>
              <option value="swing">Swing</option>
            </select>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">Formal handoff note</p>
            <Textarea value={formalNote} onChange={(e) => setFormalNote(e.target.value)} placeholder="Vitals stable, no major changes..." className="min-h-[90px] bg-white/80" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">Gut concern / clinical intuition</p>
            <Textarea value={gutConcern} onChange={(e) => setGutConcern(e.target.value)} placeholder="Something feels off despite stable notes..." className="min-h-[90px] bg-white/80" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">Things not in chart</p>
            <Textarea value={thingsNotInChart} onChange={(e) => setThingsNotInChart(e.target.value)} placeholder="Patient anxious about surgery, kept asking about daughter..." className="min-h-[90px] bg-white/80" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">Watch-outs tonight</p>
            <Textarea value={watchOuts} onChange={(e) => setWatchOuts(e.target.value)} placeholder="What should the incoming doctor check first?" className="min-h-[90px] bg-white/80" />
          </div>
        </div>

        <div className="mt-4">
          <VoiceHandoffInput
            label="Record or type full handoff transcript"
            value={transcript}
            onChange={setTranscript}
            placeholder="Speak or type the full handoff. You can edit the transcript before saving."
            minHeight="min-h-[120px]"
          />
        </div>
        {error && (
          <p className="text-sm text-red-600 bg-red-50 p-2 rounded mt-3">{error}</p>
        )}
        <Button onClick={submit} disabled={loading || !(formalNote || gutConcern || thingsNotInChart || watchOuts || transcript)} className="mt-4 gap-2">
          {loading ? (
            <><Sparkles className="w-4 h-4 animate-pulse" /> Extracting intelligence...</>
          ) : 'Submit handoff'}
        </Button>
      </Card>

      {result && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="p-6 bg-white/60 backdrop-blur-xl">
            <h2 className="font-medium mb-4">Extracted intelligence</h2>

            {result.follow_up_questions?.length > 0 && (
              <section className="mb-5 rounded-lg border border-blue-100 bg-blue-50/70 p-4">
                <h3 className="text-xs uppercase tracking-wide text-blue-700 mb-2">AI follow-up questions before you leave</h3>
                <ul className="text-sm text-slate-800 space-y-2">
                  {result.follow_up_questions.map((q: string, i: number) => (
                    <li key={i}>- {q}</li>
                  ))}
                </ul>
                <div className="mt-3">
                  <SpeechControls text={result.follow_up_questions.join(' ')} />
                </div>
              </section>
            )}

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
