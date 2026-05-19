'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { motion } from 'framer-motion'
import { Brain, Sparkles, ArrowLeft, Info } from 'lucide-react'
import Link from 'next/link'
import { VoiceHandoffInput } from '@/components/voice/voice-handoff-input'
import { SpeechControls } from '@/components/voice/speech-controls'

const SUGGESTED = [
  "Anything I should monitor overnight?",
  "What did the previous doctor seem worried about?",
  "Were there any unresolved concerns?",
  "Any hidden concerns?",
]

export default function AskPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [q, setQ] = useState('')
  const [answer, setAnswer] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [memoryCount, setMemoryCount] = useState<number | null>(null)
  const [patientName, setPatientName] = useState('')

  useEffect(() => {
    async function loadContext() {
      const [pRes, mRes] = await Promise.all([
        supabase.from('patients').select('name').eq('id', id).single(),
        supabase.from('memories').select('id', { count: 'exact', head: true }).eq('patient_id', id),
      ])
      if (pRes.data) setPatientName(pRes.data.name)
      setMemoryCount(mRes.count ?? 0)
    }
    loadContext()
  }, [id])

  async function ask(question: string) {
    setQ(question)
    setLoading(true)
    setAnswer(null)
    setError('')

    try {
      const data = await api.post<any>('/api/memory/ask', { patient_id: id, question })
      setAnswer(data)
    } catch (e: any) {
      if (e.message.includes('Sign in')) router.push('/login')
      setError(e.message || 'Failed to query memory')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <Link href={`/patients/${id}`} className="text-sm text-blue-600 inline-flex items-center gap-1">
        <ArrowLeft className="w-3 h-3" /> Back to patient
      </Link>

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
          <Brain className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-medium text-slate-900">Incoming Doctor Q&A</h1>
          <p className="text-sm text-slate-500">
            {patientName ? `Prioritizes gut concerns, missing context, and cross-shift patterns for ${patientName}` : 'Prioritizes gut concerns, missing context, and cross-shift patterns'}
          </p>
        </div>
      </div>

      {memoryCount === 0 && !answer && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Card className="p-4 bg-blue-50/60 backdrop-blur-xl border-blue-200/60">
            <div className="flex items-start gap-3">
              <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-slate-900">No memories yet for this patient</p>
                <p className="text-xs text-slate-600 mt-1">
                  Record a handoff first. The AI will extract tacit concerns and store them as memories,
                  which you can recall here on future shifts.
                </p>
                <Link href={`/patients/${id}/handoff`}>
                  <Button size="sm" variant="outline" className="mt-3">
                    Record a handoff →
                  </Button>
                </Link>
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      <Card className="p-5 bg-white/70 backdrop-blur-xl">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (q) ask(q)
          }}
          className="space-y-4"
        >
          <VoiceHandoffInput
            label="Ask by voice or type"
            value={q}
            onChange={setQ}
            placeholder="What should I watch for?"
            minHeight="min-h-[90px]"
          />
          <Button type="submit" disabled={loading || !q}>
            Ask
          </Button>
        </form>
        <div className="flex flex-wrap gap-2 mt-3">
          {SUGGESTED.map((s) => (
            <button
              key={s}
              onClick={() => ask(s)}
              disabled={loading}
              className="text-xs px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      </Card>

      {loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-3 text-sm text-slate-500"
        >
          <Sparkles className="w-4 h-4 animate-pulse" />
          Searching institutional memory...
        </motion.div>
      )}

      {error && (
        <Card className="p-4 bg-red-50/60 border-red-100">
          <p className="text-sm text-red-700">{error}</p>
        </Card>
      )}

      {answer && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="p-6 bg-gradient-to-br from-blue-50/50 via-white/60 to-purple-50/30 backdrop-blur-xl border-blue-100/50">
            <p className="text-slate-800 leading-relaxed whitespace-pre-wrap">
              {answer.response?.answer}
            </p>
            <div className="mt-4">
              <SpeechControls text={answer.response?.answer || ''} />
            </div>

            {answer.response?.contradictions?.length > 0 && (
              <div className="mt-5 p-3 bg-amber-50/60 rounded-lg border border-amber-100">
                <p className="text-xs uppercase tracking-wide text-amber-700 mb-2">
                  Contradictions detected
                </p>
                {answer.response.contradictions.map((c: any, i: number) => (
                  <p key={i} className="text-sm text-slate-700">⚠ {c.concern}</p>
                ))}
              </div>
            )}

            {answer.response?.detected_patterns?.length > 0 && (
              <div className="mt-5 p-3 bg-amber-50/70 rounded-lg border border-amber-100">
                <p className="text-xs uppercase tracking-wide text-amber-700 mb-2">
                  Cross-shift pattern detected
                </p>
                {answer.response.detected_patterns.map((pattern: any, i: number) => (
                  <div key={i} className="mb-3 last:mb-0">
                    <p className="text-sm font-medium text-slate-800">
                      {pattern.pattern} ({pattern.evidence_count} signals)
                    </p>
                    <p className="text-xs text-amber-800 mt-1">{pattern.suggested_action}</p>
                  </div>
                ))}
              </div>
            )}

            {answer.memories?.length > 0 && (
              <div className="mt-5 pt-4 border-t border-slate-200/60">
                <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">
                  Cited memories
                </p>
                {answer.memories.slice(0, 4).map((m: any) => (
                  <div key={m.id} className="text-xs text-slate-600 mb-2">
                    <span className="font-medium">{m.memory_type}</span>
                    {' · '}
                    {new Date(m.created_at).toLocaleDateString()}
                    {m.similarity && (
                      <span className="ml-1 text-slate-400">
                        ({(m.similarity * 100).toFixed(0)}% match)
                      </span>
                    )}
                    <p className="text-slate-500 mt-0.5">{m.content}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </motion.div>
      )}
    </div>
  )
}
