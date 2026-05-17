'use client'
import { useState, useRef } from 'react'
import { Mic, Square, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'

export function VoiceRecorder({ onTranscript }: { onTranscript: (t: string) => void }) {
  const [recording, setRecording] = useState(false)
  const [processing, setProcessing] = useState(false)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mr = new MediaRecorder(stream)
    mediaRef.current = mr
    chunksRef.current = []
    mr.ondataavailable = e => chunksRef.current.push(e.data)
    mr.onstop = async () => {
      setProcessing(true)
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      const file = new File([blob], 'handoff.webm', { type: 'audio/webm' })
      const { text } = await api.postFile<{text: string}>('/api/voice/transcribe', file)
      onTranscript(text)
      setProcessing(false)
      stream.getTracks().forEach(t => t.stop())
    }
    mr.start()
    setRecording(true)
  }

  function stop() {
    mediaRef.current?.stop()
    setRecording(false)
  }

  return (
    <Button
      type="button"
      onClick={recording ? stop : start}
      disabled={processing}
      variant={recording ? "destructive" : "outline"}
      className="gap-2"
    >
      {processing ? <Loader2 className="w-4 h-4 animate-spin" /> :
       recording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
      {processing ? 'Transcribing...' : recording ? 'Stop' : 'Voice handoff'}
    </Button>
  )
}