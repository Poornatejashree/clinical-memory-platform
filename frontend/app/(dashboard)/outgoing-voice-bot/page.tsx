'use client'

import { useEffect, useRef, useState } from 'react'
import { Bot, Loader2, Mic, MicOff, Save, Send } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type Patient = { id: string; name?: string; bed?: string; department?: string; diagnosis?: string }
type Turn = { id: string; speaker: 'Bot' | 'Doctor'; text: string; timestamp: string }
type Phase = 'idle' | 'speaking' | 'listening' | 'transcribing' | 'extracting' | 'ready'
type Draft = {
  formal_note: string
  gut_concern: string
  things_not_in_chart: string
  watch_outs: string
  shift: string
  missing_fields?: string[]
  followup_questions?: string[]
}

const MAX_RECORDING_MS = 15000

export default function OutgoingVoiceBotPage() {
  const router = useRouter()
  const [patients, setPatients] = useState<Patient[]>([])
  const [patientId, setPatientId] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [active, setActive] = useState(false)
  const [history, setHistory] = useState<Turn[]>([])
  const [transcript, setTranscript] = useState('')
  const [draft, setDraft] = useState<Draft>({
    formal_note: '',
    gut_concern: '',
    things_not_in_chart: '',
    watch_outs: '',
    shift: 'night',
  })
  const [typedFallback, setTypedFallback] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('Select a patient to start a voice handoff.')
  const [saving, setSaving] = useState(false)

  const activeRef = useRef(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)
  const draftRef = useRef(draft)
  const transcriptRef = useRef('')

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    transcriptRef.current = transcript
  }, [transcript])

  useEffect(() => {
    let mounted = true
    async function loadPatients() {
      try {
        const data = await api.get<Patient[]>('/api/patients/')
        if (!mounted) return
        setPatients(data || [])
        if (data?.[0]?.id) setPatientId(data[0].id)
      } catch (err: any) {
        if (mounted) setError(err.message || 'Could not load patients.')
      }
    }
    loadPatients()
    return () => {
      mounted = false
      endConversation()
    }
  }, [])

  function addTurn(speaker: 'Bot' | 'Doctor', text: string) {
    setHistory((prev) => [{ id: `${Date.now()}-${speaker}`, speaker, text, timestamp: new Date().toISOString() }, ...prev])
  }

  function stopMic() {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  function endConversation() {
    activeRef.current = false
    setActive(false)
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    stopMic()
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel()
    setPhase('idle')
    setStatus('Handoff conversation ended.')
  }

  function speak(text: string, after?: () => void) {
    addTurn('Bot', text)
    if (!window.speechSynthesis) {
      after?.()
      return
    }
    setPhase('speaking')
    setStatus('Asking follow-up...')
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 0.94
    utterance.pitch = 1
    utterance.onend = () => after?.()
    utterance.onerror = () => after?.()
    window.speechSynthesis.speak(utterance)
  }

  function startConversation() {
    if (!patientId) {
      setError('Select a patient first.')
      return
    }
    setError('')
    setActive(true)
    activeRef.current = true
    const prompt = 'Please tell me the patient handoff. Include formal status, gut concerns, things not in the chart, and what the next doctor should watch for.'
    speak(prompt, () => void listen())
  }

  async function listen() {
    if (!activeRef.current) return
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Microphone unavailable. Use typed fallback and edit the handoff fields.')
      setPhase('ready')
      return
    }
    try {
      setPhase('listening')
      setStatus('Listening...')
      chunksRef.current = []
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      recorderRef.current = recorder
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        chunksRef.current = []
        stopMic()
        if (activeRef.current && blob.size > 1000) void transcribe(blob)
      }
      recorder.start()
      timerRef.current = window.setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop()
      }, MAX_RECORDING_MS)
    } catch (err: any) {
      setError(err.message || 'Could not start microphone. Use typed fallback.')
      setPhase('ready')
    }
  }

  async function transcribe(blob: Blob) {
    setPhase('transcribing')
    setStatus('Transcribing...')
    setError('')
    try {
      const file = new File([blob], 'outgoing-handoff.webm', { type: blob.type || 'audio/webm' })
      const data = await api.postFile<any>('/api/voice/transcribe', file)
      const text = (data.transcript || data.text || '').trim()
      if (!text) throw new Error('No transcript returned.')
      addTurn('Doctor', text)
      const combined = [transcriptRef.current, text].filter(Boolean).join('\n')
      setTranscript(combined)
      transcriptRef.current = combined
      await extractDraft(combined)
    } catch (err: any) {
      setError(`Could not transcribe audio via POST /api/voice/transcribe. ${err.message || 'Please try again or type your handoff.'}`)
      setPhase('ready')
    }
  }

  async function extractDraft(nextTranscript: string) {
    setPhase('extracting')
    setStatus('Extracting clinical signals...')
    try {
      const data = await api.post<Draft>('/api/handoffs/extract-draft', {
        patient_id: patientId,
        transcript: nextTranscript,
        previous_draft: draftRef.current,
      })
      setDraft({
        formal_note: data.formal_note || '',
        gut_concern: data.gut_concern || '',
        things_not_in_chart: data.things_not_in_chart || '',
        watch_outs: data.watch_outs || '',
        shift: data.shift || draftRef.current.shift || 'night',
        missing_fields: data.missing_fields || [],
        followup_questions: data.followup_questions || [],
      })
      const followup = data.followup_questions?.[0]
      if (followup && activeRef.current) {
        setStatus('Asking follow-up...')
        speak(followup, () => void listen())
      } else {
        setPhase('ready')
        setStatus('Ready to save.')
      }
    } catch (err: any) {
      setError(`Could not extract clinical signals via POST /api/handoffs/extract-draft. ${err.message || 'Please edit the fields manually.'}`)
      setPhase('ready')
    }
  }

  async function sendTypedFallback() {
    const text = typedFallback.trim()
    if (!text) return
    setTypedFallback('')
    addTurn('Doctor', text)
    const combined = [transcriptRef.current, text].filter(Boolean).join('\n')
    setTranscript(combined)
    transcriptRef.current = combined
    await extractDraft(combined)
  }

  async function saveHandoff() {
    const patient = patients.find((item) => item.id === patientId)
    setSaving(true)
    setError('')
    try {
      await api.post<any>('/api/handoffs/', {
        patient_id: patientId,
        patient_name: patient?.name,
        transcript,
        formal_note: draft.formal_note,
        gut_concern: draft.gut_concern,
        things_not_in_chart: draft.things_not_in_chart,
        watch_outs: draft.watch_outs,
        department: patient?.department || 'icu',
        shift_type: draft.shift || 'night',
      })
      router.push(`/patients/${patientId}`)
    } catch (err: any) {
      setError(`Could not save handoff via POST /api/handoffs. ${err.message || 'Please try again.'}`)
    } finally {
      setSaving(false)
    }
  }

  const selectedPatient = patients.find((patient) => patient.id === patientId)

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
          <Bot className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-medium text-slate-900">Outgoing Doctor Voice Bot</h1>
          <p className="text-sm text-slate-500">Create a structured handoff by talking naturally.</p>
        </div>
      </div>

      <Card className="p-5 bg-white/75 backdrop-blur-xl">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Patient</label>
            <Select value={patientId} onValueChange={setPatientId} disabled={active}>
              <SelectTrigger className="bg-white"><SelectValue placeholder="Select a patient" /></SelectTrigger>
              <SelectContent>
                {patients.map((patient) => (
                  <SelectItem key={patient.id} value={patient.id}>
                    {patient.name || 'Unnamed patient'}{patient.bed ? ` - Bed ${patient.bed}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedPatient?.diagnosis && <p className="mt-2 text-xs text-slate-500">{selectedPatient.diagnosis}</p>}
            <p className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-slate-600">{status}</p>
          </div>
          <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <button
              type="button"
              onClick={active ? endConversation : startConversation}
              disabled={!patientId}
              className={`flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-full border text-sm font-medium transition-colors ${active ? 'border-red-200 bg-red-50 text-red-700' : 'border-blue-200 bg-blue-50 text-blue-700'} disabled:opacity-60`}
            >
              {active ? <MicOff className="h-10 w-10" /> : <Mic className="h-10 w-10" />}
              {active ? 'End handoff conversation' : 'Start Handoff Conversation'}
            </button>
            <p className="text-xs text-slate-500">
              {phase === 'listening' ? 'Listening...' : phase === 'transcribing' ? 'Transcribing...' : phase === 'extracting' ? 'Extracting clinical signals...' : phase === 'speaking' ? 'Asking follow-up...' : 'Ready'}
            </p>
          </div>
        </div>
        {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5 bg-white/75 backdrop-blur-xl">
          <h2 className="mb-3 text-sm font-medium text-slate-900">Structured handoff preview</h2>
          <div className="space-y-3">
            <label className="block text-xs font-medium text-slate-500">Shift</label>
            <Input value={draft.shift} onChange={(event) => setDraft({ ...draft, shift: event.target.value })} className="bg-white" />
            <label className="block text-xs font-medium text-slate-500">Formal note</label>
            <Textarea value={draft.formal_note} onChange={(event) => setDraft({ ...draft, formal_note: event.target.value })} className="min-h-[80px] bg-white" />
            <label className="block text-xs font-medium text-slate-500">Gut concern</label>
            <Textarea value={draft.gut_concern} onChange={(event) => setDraft({ ...draft, gut_concern: event.target.value })} className="min-h-[80px] bg-white" />
            <label className="block text-xs font-medium text-slate-500">Things not in chart</label>
            <Textarea value={draft.things_not_in_chart} onChange={(event) => setDraft({ ...draft, things_not_in_chart: event.target.value })} className="min-h-[80px] bg-white" />
            <label className="block text-xs font-medium text-slate-500">Watch-outs</label>
            <Textarea value={draft.watch_outs} onChange={(event) => setDraft({ ...draft, watch_outs: event.target.value })} className="min-h-[80px] bg-white" />
          </div>
          <Button onClick={saveHandoff} disabled={saving || !patientId || !(transcript || draft.formal_note || draft.gut_concern || draft.watch_outs)} className="mt-4">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Handoff
          </Button>
        </Card>

        <Card className="p-5 bg-white/75 backdrop-blur-xl">
          <h2 className="mb-3 text-sm font-medium text-slate-900">Conversation history</h2>
          <div className="max-h-[360px] space-y-3 overflow-auto">
            {history.length === 0 ? <p className="text-sm text-slate-500">No handoff conversation yet.</p> : history.map((turn) => (
              <div key={turn.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs text-slate-400">{new Date(turn.timestamp).toLocaleString()}</p>
                <p className="mt-1 text-sm text-slate-800"><span className="font-medium">{turn.speaker}:</span> {turn.text}</p>
              </div>
            ))}
          </div>
          <h2 className="mb-2 mt-5 text-sm font-medium text-slate-900">Live transcript</h2>
          <Textarea value={transcript} onChange={(event) => setTranscript(event.target.value)} className="min-h-[120px] bg-white" />
          <div className="mt-4 flex flex-col gap-2 md:flex-row">
            <Textarea value={typedFallback} onChange={(event) => setTypedFallback(event.target.value)} placeholder="Typed fallback or correction." className="min-h-[72px] bg-white" />
            <Button onClick={sendTypedFallback} disabled={!typedFallback.trim()} className="md:self-start">
              <Send className="h-4 w-4" /> Send
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
