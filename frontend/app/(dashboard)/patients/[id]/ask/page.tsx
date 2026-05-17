'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { motion } from 'framer-motion'
import { Brain, Sparkles, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const SUGGESTED = [
  "Anything I should monitor overnight?",
  "What did the previous doctor seem worried about?",
  "Were there any unresolved concerns?",
  "Any contradictions between recent notes?",
]

export default function AskPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [q, setQ] = useState('')
  const [answer, setAnswer] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function ask(question: string) {
    setQ(question)
    setLoading(true)
    setAnswer(null)
    setError('')

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
      return
    }

    try {
      const r = await fetch(`${API}/api/memory/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ patient_id: id, question }),
      })
      if (!r.ok) throw new Error(await r.text())
      const data = await r.json()
      setAnswer(data)
    } catch (e: any) {
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
          <h1 className="text-2xl font-medium text-slate-900">Ask the institutional memory</h1>
          <p className="text-sm text-slate-500">Recalls tacit concerns from previous shifts</p>
        </div>
      </div>

      <Card className="p-5 bg-white/60 backdrop-blur-xl">
        <form onSubmit={(e) => { e.preventDefault(); if (q) ask(q) }} className="flex gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="What should I watch for on this patient?"
            className="bg-white/80"
          />
          <Button type="submit" disabled={loading}>Ask</Button>
        </form>
        <div className="flex flex-wrap gap-2 mt-3">
          {SUGGESTED.map((s) => (
            <button
              key={s}
              onClick={() => ask(s)}
              className="text-xs px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700"
            >
              {s}
            </button>
          ))}
        </div>
      </Card>

      {loading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 text-sm text-slate-500">
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

            {answer.response?.contradictions?.length > 0 && (
              <div className="mt-5 p-3 bg-amber-50/60 rounded-lg border border-amber-100">
                <p className="text-xs uppercase tracking-wide text-amber-700 mb-2">Contradictions detected</p>
                {answer.response.contradictions.map((c: any, i: number) => (
                  <p key={i} className="text-sm text-slate-700">⚠ {c.concern}</p>
                ))}
              </div>
            )}

            {answer.memories?.length > 0 && (
              <div className="mt-5 pt-4 border-t border-slate-200/60">
                <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Cited memories</p>
                {answer.memories.slice(0, 4).map((m: any) => (
                  <div key={m.id} className="text-xs text-slate-600 mb-2">
                    <span className="font-medium">{m.memory_type}</span>{' '}
                    · {new Date(m.created_at).toLocaleDateString()}
                    {m.similarity && <span className="ml-1 text-slate-400">({(m.similarity * 100).toFixed(0)}% match)</span>}
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