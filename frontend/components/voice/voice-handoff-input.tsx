'use client'

import { useRef, useState } from 'react'
import { Loader2, Mic, Square, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'

export function VoiceHandoffInput({
  label,
  value,
  onChange,
  placeholder,
  minHeight = 'min-h-[120px]',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  minHeight?: string
}) {
  const [recording, setRecording] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState('')
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  async function startRecording() {
    setError('')
    setTranscript('')
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone recording is unavailable in this browser.')
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      mediaRef.current = recorder
      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = transcribe
      recorder.start()
      setRecording(true)
    } catch (err: any) {
      setError(err.message || 'Could not access microphone.')
    }
  }

  function stopRecording() {
    mediaRef.current?.stop()
    setRecording(false)
  }

  async function transcribe() {
    setProcessing(true)
    try {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      const file = new File([blob], 'shiftbrain-handoff.webm', { type: 'audio/webm' })
      const data = await api.postFile<any>('/api/voice/transcribe', file)
      setTranscript(data.transcript || data.text || '')
    } catch (err: any) {
      setError(err.message || 'Transcription failed.')
    } finally {
      setProcessing(false)
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }

  function useTranscript() {
    if (!transcript) return
    onChange(value ? `${value}\n${transcript}` : transcript)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-800">{label}</p>
          <p className="text-xs text-slate-500">Voice input powered by Groq Whisper. Typed fallback available.</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={startRecording} disabled={recording || processing} className="gap-2">
            <Mic className="h-4 w-4" /> Start Recording
          </Button>
          <Button type="button" variant={recording ? 'destructive' : 'outline'} size="sm" onClick={stopRecording} disabled={!recording} className="gap-2">
            <Square className="h-4 w-4" /> Stop Recording
          </Button>
        </div>
      </div>

      {(recording || processing) && (
        <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
          {recording ? 'Recording...' : <span className="inline-flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Sending audio to Groq Whisper...</span>}
        </div>
      )}

      {transcript && (
        <div className="rounded-md border border-emerald-100 bg-emerald-50 p-3">
          <p className="text-xs font-medium uppercase text-emerald-700">Transcript preview</p>
          <p className="mt-1 text-sm text-slate-700">{transcript}</p>
          <Button type="button" size="sm" variant="outline" onClick={useTranscript} className="mt-3 gap-2">
            <Wand2 className="h-4 w-4" /> Use Transcript
          </Button>
        </div>
      )}

      {error && <p className="rounded-md bg-red-50 p-2 text-xs text-red-700">{error}</p>}

      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`${minHeight} bg-white/85`}
      />
    </div>
  )
}
