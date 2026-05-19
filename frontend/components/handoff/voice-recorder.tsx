'use client'

import { useState, useRef } from 'react'
import { Mic, Square, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'

export function VoiceRecorder({ onTranscript }: { onTranscript: (text: string) => void }) {
  const [recording, setRecording] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  async function start() {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mr = new MediaRecorder(stream)
      mediaRef.current = mr
      chunksRef.current = []
      mr.ondataavailable = (e) => chunksRef.current.push(e.data)
      mr.onstop = async () => {
        setProcessing(true)
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const file = new File([blob], 'handoff.webm', { type: 'audio/webm' })

        try {
          const data = await api.postFile<any>('/api/voice/transcribe', file)
          onTranscript(data.transcript || data.text)
        } catch (e: any) {
          setError(e.message || 'Transcription failed')
        } finally {
          setProcessing(false)
          streamRef.current?.getTracks().forEach((t) => t.stop())
          streamRef.current = null
        }
      }
      mr.start()
      setRecording(true)
    } catch (e: any) {
      setError(e.message || 'Could not access microphone')
    }
  }

  function stop() {
    mediaRef.current?.stop()
    setRecording(false)
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        onClick={recording ? stop : start}
        disabled={processing}
        variant={recording ? 'destructive' : 'outline'}
        className="gap-2"
        size="sm"
      >
        {processing ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Transcribing...</>
        ) : recording ? (
          <><Square className="w-4 h-4" /> Stop</>
        ) : (
          <><Mic className="w-4 h-4" /> Voice handoff</>
        )}
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
