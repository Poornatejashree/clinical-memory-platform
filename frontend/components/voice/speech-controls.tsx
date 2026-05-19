'use client'

import { useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function SpeechControls({ text }: { text: string }) {
  const [speaking, setSpeaking] = useState(false)
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window

  function speak() {
    if (!supported || !text) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)
    setSpeaking(true)
    window.speechSynthesis.speak(utterance)
  }

  function stop() {
    if (!supported) return
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }

  if (!supported) {
    return <p className="text-xs text-slate-500">Voice output unavailable in this browser.</p>
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={speak} disabled={!text} className="gap-2">
        <Volume2 className="h-4 w-4" /> Speak Response
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={stop} disabled={!speaking} className="gap-2">
        <VolumeX className="h-4 w-4" /> Stop Speaking
      </Button>
      <span className="text-xs text-slate-500">Voice output powered by browser speech synthesis</span>
    </div>
  )
}
