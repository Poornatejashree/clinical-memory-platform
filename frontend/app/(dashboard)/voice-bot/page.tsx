'use client'

import { useEffect, useRef, useState } from 'react'
import { Bot, Loader2, Mic, MicOff, Send, Settings2, Volume2 } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type Patient = {
  id: string
  name?: string
  bed?: string
  diagnosis?: string
}

type ConversationTurn = {
  id: string
  question: string
  answer?: string
  timestamp: string
}

type ConversationPhase = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking'

type TranscribeResponse = {
  transcript?: string
  text?: string
  provider?: string
  model?: string
}

type MemoryAskResponse = {
  response?: {
    answer?: string
  }
}

const SILENCE_MS = 1800
const MAX_RECORDING_MS = 15000
const MIN_WORDS = 3
const SPEECH_RATE = 0.94
const SPEECH_PITCH = 1
const SPEECH_VOLUME = 1
const SPEECH_PAUSE_MS = 420

export default function VoiceBotPage() {
  const [patients, setPatients] = useState<Patient[]>([])
  const [patientId, setPatientId] = useState('')
  const [typedQuestion, setTypedQuestion] = useState('')
  const [latestTranscript, setLatestTranscript] = useState('')
  const [latestAnswer, setLatestAnswer] = useState('')
  const [history, setHistory] = useState<ConversationTurn[]>([])
  const [phase, setPhase] = useState<ConversationPhase>('idle')
  const [conversationActive, setConversationActive] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('Select a patient, then start a hands-free conversation.')
  const [selectedVoiceName, setSelectedVoiceName] = useState('Using browser default voice')
  const [voiceCount, setVoiceCount] = useState(0)
  const [speechSupported, setSpeechSupported] = useState(false)
  const [showDebug, setShowDebug] = useState(false)

  const activeRef = useRef(false)
  const patientIdRef = useRef('')
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserTimerRef = useRef<number | null>(null)
  const maxTimerRef = useRef<number | null>(null)
  const lastVoiceAtRef = useRef(0)
  const heardVoiceRef = useRef(false)
  const shouldProcessBlobRef = useRef(false)
  const selectedVoiceRef = useRef<SpeechSynthesisVoice | null>(null)
  const speechTimerRef = useRef<number | null>(null)
  const speechRunRef = useRef(0)

  useEffect(() => {
    patientIdRef.current = patientId
  }, [patientId])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setSpeechSupported(false)
      setSelectedVoiceName('Browser speech synthesis unavailable')
      return
    }

    setSpeechSupported(true)

    function loadVoices() {
      const voices = window.speechSynthesis.getVoices()
      const voice = pickBestVoice(voices)
      selectedVoiceRef.current = voice
      setVoiceCount(voices.length)
      setSelectedVoiceName(voice?.name || 'Using browser default voice')
    }

    loadVoices()
    window.speechSynthesis.onvoiceschanged = loadVoices

    return () => {
      window.speechSynthesis.onvoiceschanged = null
    }
  }, [])

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

  function clearRecordingTimers() {
    if (analyserTimerRef.current) window.clearInterval(analyserTimerRef.current)
    if (maxTimerRef.current) window.clearTimeout(maxTimerRef.current)
    analyserTimerRef.current = null
    maxTimerRef.current = null
  }

  function clearSpeechTimer() {
    if (speechTimerRef.current) window.clearTimeout(speechTimerRef.current)
    speechTimerRef.current = null
  }

  function stopMicTracks() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (audioContextRef.current?.state !== 'closed') {
      void audioContextRef.current?.close()
    }
    audioContextRef.current = null
  }

  function stopCurrentRecording(processBlob: boolean) {
    shouldProcessBlobRef.current = processBlob
    clearRecordingTimers()

    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop()
      return
    }

    stopMicTracks()
  }

  async function startConversation() {
    if (!patientId) {
      setError('Select a patient before starting the voice bot.')
      return
    }

    setError('')
    setConversationActive(true)
    activeRef.current = true
    await beginListening()
  }

  function endConversation() {
    activeRef.current = false
    setConversationActive(false)
    stopCurrentRecording(false)
    clearSpeechTimer()
    speechRunRef.current += 1
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    setPhase('idle')
    setStatus('Conversation ended.')
  }

  function interruptSpeechAndListen() {
    clearSpeechTimer()
    speechRunRef.current += 1
    if (window.speechSynthesis) window.speechSynthesis.cancel()
    setPhase('listening')
    setStatus('Ready for next question.')
    if (activeRef.current) void beginListening()
  }

  async function beginListening() {
    if (!activeRef.current) return

    if (!patientIdRef.current) {
      setError('Select a patient before starting the voice bot.')
      endConversation()
      return
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Microphone recording is unavailable in this browser. Use the typed fallback below.')
      endConversation()
      return
    }

    try {
      setPhase('listening')
      setStatus('Listening for incoming doctor question...')
      chunksRef.current = []
      heardVoiceRef.current = false
      shouldProcessBlobRef.current = false

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!activeRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      recorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const processBlob = shouldProcessBlobRef.current
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        chunksRef.current = []
        stopMicTracks()

        if (!activeRef.current) return
        if (!processBlob || blob.size < 1000) {
          window.setTimeout(() => {
            if (activeRef.current) void beginListening()
          }, 500)
          return
        }

        void processAudio(blob)
      }

      startSilenceDetection(stream)
      maxTimerRef.current = window.setTimeout(() => {
        stopCurrentRecording(heardVoiceRef.current)
      }, MAX_RECORDING_MS)

      recorder.start()
    } catch (err: any) {
      const denied = err?.name === 'NotAllowedError' || err?.name === 'SecurityError'
      setError(
        denied
          ? 'Microphone permission was denied. Use the typed fallback below.'
          : err.message || 'Could not start microphone recording. Use the typed fallback below.'
      )
      endConversation()
    }
  }

  function startSilenceDetection(stream: MediaStream) {
    const AudioContextClass =
      window.AudioContext ||
      (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return

    const audioContext = new AudioContextClass()
    const source = audioContext.createMediaStreamSource(stream)
    const analyser = audioContext.createAnalyser()
    const samples = new Uint8Array(analyser.fftSize)

    source.connect(analyser)
    audioContextRef.current = audioContext
    lastVoiceAtRef.current = Date.now()

    analyserTimerRef.current = window.setInterval(() => {
      analyser.getByteTimeDomainData(samples)
      let sum = 0
      for (const sample of samples) {
        const normalized = (sample - 128) / 128
        sum += normalized * normalized
      }

      const volume = Math.sqrt(sum / samples.length)
      const now = Date.now()
      if (volume > 0.035) {
        heardVoiceRef.current = true
        lastVoiceAtRef.current = now
      }

      if (heardVoiceRef.current && now - lastVoiceAtRef.current > SILENCE_MS) {
        stopCurrentRecording(true)
      }
    }, 200)
  }

  async function processAudio(blob: Blob) {
    setPhase('transcribing')
    setStatus('Transcribing with Groq Whisper...')
    setError('')

    try {
      const file = new File([blob], 'voice-bot-question.webm', { type: blob.type || 'audio/webm' })
      const data = await api.postFile<TranscribeResponse>('/api/voice/transcribe', file)
      if (!activeRef.current) return

      const transcript = (data.transcript || data.text || '').trim()
      if (!transcript) throw new Error('empty-transcript')
      if (transcript.split(/\s+/).filter(Boolean).length < MIN_WORDS) {
        setStatus('Ignored a very short transcript. Listening again...')
        window.setTimeout(() => {
          if (activeRef.current) void beginListening()
        }, 500)
        return
      }

      setLatestTranscript(transcript)
      await askMemory(transcript, true)
    } catch {
      setError('Could not transcribe audio. Please try again or type your question.')
      if (activeRef.current) {
        window.setTimeout(() => {
          if (activeRef.current) void beginListening()
        }, 1200)
      } else {
        setPhase('idle')
      }
    }
  }

  async function askMemory(question: string, fromVoice: boolean) {
    if (!patientIdRef.current) {
      setError('Select a patient before asking the voice bot.')
      return
    }

    setPhase('thinking')
    setStatus('Retrieving patient handoff memory...')
    setError('')

    const turnId = `${Date.now()}`
    const timestamp = new Date().toISOString()
    setHistory((prev) => [{ id: turnId, question, timestamp }, ...prev])

    try {
      const data = await api.post<MemoryAskResponse>('/api/memory/ask', {
        patient_id: patientIdRef.current,
        question,
      })
      const botAnswer = data.response?.answer?.trim()
      if (!botAnswer) throw new Error('The memory service returned no answer.')

      setLatestAnswer(botAnswer)
      setHistory((prev) =>
        prev.map((turn) => (turn.id === turnId ? { ...turn, answer: botAnswer } : turn))
      )

      speakBotAnswer(botAnswer, fromVoice)
    } catch (err: any) {
      setError(err.message || 'Could not ask the patient memory service.')
      setHistory((prev) => prev.filter((turn) => turn.id !== turnId))
      if (activeRef.current && fromVoice) {
        window.setTimeout(() => {
          if (activeRef.current) void beginListening()
        }, 1200)
      } else {
        setPhase('idle')
      }
    }
  }

  function speakBotAnswer(botAnswer: string, resumeAfterSpeech: boolean) {
    if (!window.speechSynthesis) {
      setError('Browser text-to-speech is unavailable. Showing the answer as text.')
      if (activeRef.current && resumeAfterSpeech) {
        window.setTimeout(() => {
          if (activeRef.current) void beginListening()
        }, 500)
      } else {
        setPhase('idle')
      }
      return
    }

    setPhase('speaking')
    setStatus('Preparing response...')
    window.speechSynthesis.cancel()
    clearSpeechTimer()

    const chunks = splitSpeechChunks(botAnswer)
    const runId = speechRunRef.current + 1
    speechRunRef.current = runId

    function finishSpeaking() {
      if (speechRunRef.current !== runId) return
      if (activeRef.current && resumeAfterSpeech) {
        setStatus('Ready for next question.')
        void beginListening()
      } else {
        setPhase('idle')
        setStatus('Answer ready.')
      }
    }

    function speakChunk(index: number) {
      if (speechRunRef.current !== runId) return
      const chunk = chunks[index]
      if (!chunk) {
        finishSpeaking()
        return
      }

      setStatus(index === 0 ? 'Speaking answer...' : 'Speaking...')
      const utterance = new SpeechSynthesisUtterance(chunk)
      utterance.rate = SPEECH_RATE
      utterance.pitch = SPEECH_PITCH
      utterance.volume = SPEECH_VOLUME
      if (selectedVoiceRef.current) utterance.voice = selectedVoiceRef.current
      utterance.onend = () => {
        speechTimerRef.current = window.setTimeout(() => speakChunk(index + 1), SPEECH_PAUSE_MS)
      }
      utterance.onerror = () => finishSpeaking()
      window.speechSynthesis.speak(utterance)
    }

    speakChunk(0)
  }

  async function sendTypedQuestion() {
    const question = typedQuestion.trim()
    if (!question) return

    setTypedQuestion('')
    setLatestTranscript(question)
    activeRef.current = false
    setConversationActive(false)
    stopCurrentRecording(false)
    await askMemory(question, false)
  }

  const selectedPatient = patients.find((patient) => patient.id === patientId)
  const mainLabel =
    phase === 'idle'
      ? 'Start Conversation'
      : phase === 'listening'
        ? 'Listening...'
        : phase === 'transcribing' || phase === 'thinking'
          ? 'Thinking...'
          : 'Speaking...'
  const busy = phase !== 'idle'

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
          <Bot className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-medium text-slate-900">Incoming Doctor Voice Bot</h1>
          <p className="text-sm text-slate-500">
            Demo only. Not for real clinical use.
          </p>
        </div>
      </div>

      <Card className="p-5 bg-white/75 backdrop-blur-xl">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Patient</label>
              <Select value={patientId} onValueChange={setPatientId} disabled={conversationActive}>
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Select a patient" />
                </SelectTrigger>
                <SelectContent>
                  {patients.map((patient) => (
                    <SelectItem key={patient.id} value={patient.id}>
                      {patient.name || 'Unnamed patient'}
                      {patient.bed ? ` - Bed ${patient.bed}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPatient?.diagnosis && (
                <p className="mt-2 text-xs text-slate-500">{selectedPatient.diagnosis}</p>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Current transcript</p>
              <p className="mt-2 min-h-10 text-sm text-slate-800">
                {latestTranscript || 'Start a conversation and ask a question aloud.'}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <button
              type="button"
              onClick={phase === 'speaking' ? interruptSpeechAndListen : startConversation}
              disabled={!patientId || (conversationActive && phase !== 'speaking')}
              className={`flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-full border text-sm font-medium transition-colors ${
                conversationActive
                  ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                  : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {phase === 'listening' ? (
                <Mic className="h-10 w-10 animate-pulse" />
              ) : conversationActive ? (
                <MicOff className="h-10 w-10" />
              ) : (
                <Mic className="h-10 w-10" />
              )}
              {mainLabel}
            </button>
            {phase === 'speaking' && (
              <p className="text-xs text-slate-500">
                Tap the speaking button to interrupt and ask a follow-up.
              </p>
            )}
            {conversationActive && (
              <Button variant="outline" onClick={endConversation}>
                <MicOff className="h-4 w-4" />
                End Conversation
              </Button>
            )}
            <div className="rounded-md bg-white p-3 text-sm text-slate-600">
              {phase === 'transcribing'
                ? 'Transcribing with Groq Whisper...'
                : phase === 'thinking'
                  ? 'Retrieving patient handoff memory...'
                  : phase === 'speaking'
                    ? 'Speaking answer...'
                    : phase === 'listening'
                      ? 'Listening for incoming doctor question...'
                      : status || 'Ready for next question'}
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </Card>

      <Card className="p-5 bg-white/75 backdrop-blur-xl">
        <div className="mb-3 flex items-center gap-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin text-blue-600" /> : <Volume2 className="h-4 w-4 text-slate-500" />}
          <h2 className="text-sm font-medium text-slate-900">Bot answer</h2>
        </div>
        {latestAnswer ? (
          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">{latestAnswer}</p>
        ) : (
          <p className="text-sm text-slate-500">The bot answer will appear here and play automatically.</p>
        )}
      </Card>

      <Card className="p-5 bg-white/75 backdrop-blur-xl">
        <h2 className="mb-4 text-sm font-medium text-slate-900">Conversation history</h2>
        {history.length === 0 ? (
          <p className="text-sm text-slate-500">No voice bot turns yet.</p>
        ) : (
          <div className="space-y-4">
            {history.map((turn) => (
              <div key={turn.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-xs text-slate-400">
                  {new Date(turn.timestamp).toLocaleString()}
                </p>
                <p className="mt-2 text-sm text-slate-900">
                  <span className="font-medium">Doctor:</span> {turn.question}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                  <span className="font-medium">Bot:</span>{' '}
                  {turn.answer || 'Retrieving patient handoff memory...'}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5 bg-white/75 backdrop-blur-xl">
        <h2 className="mb-3 text-sm font-medium text-slate-900">Typed fallback</h2>
        <div className="flex flex-col gap-3 md:flex-row">
          <Textarea
            value={typedQuestion}
            onChange={(event) => setTypedQuestion(event.target.value)}
            placeholder="Type a question if microphone or transcription is unavailable."
            className="min-h-[72px] bg-white"
          />
          <Button
            onClick={sendTypedQuestion}
            disabled={!patientId || !typedQuestion.trim() || phase === 'thinking' || phase === 'transcribing'}
            className="md:self-start"
          >
            <Send className="h-4 w-4" />
            Send
          </Button>
        </div>
      </Card>

      <Card className="p-4 bg-white/60 backdrop-blur-xl">
        <button
          type="button"
          onClick={() => setShowDebug((value) => !value)}
          className="flex items-center gap-2 text-xs font-medium text-slate-500"
        >
          <Settings2 className="h-3.5 w-3.5" />
          Voice debug
        </button>
        {showDebug && (
          <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
            <p>Selected voice: {selectedVoiceName}</p>
            <p>Speech synthesis: {speechSupported ? 'available' : 'unavailable'}</p>
            <p>Voice count: {voiceCount}</p>
            <p>Rate: {SPEECH_RATE}</p>
            <p>Pitch: {SPEECH_PITCH}</p>
            <p>Volume: {SPEECH_VOLUME}</p>
          </div>
        )}
      </Card>
    </div>
  )
}

function pickBestVoice(voices: SpeechSynthesisVoice[]) {
  const priorities = [
    'Microsoft Aria',
    'Microsoft Jenny',
    'Microsoft Guy',
    'Google UK English Female',
    'Google US English',
    'Natural',
    'Google',
    'Microsoft',
  ]

  for (const priority of priorities) {
    const match = voices.find((voice) =>
      voice.name.toLowerCase().includes(priority.toLowerCase())
    )
    if (match) return match
  }

  return voices.find((voice) => voice.lang?.toLowerCase().startsWith('en')) || voices[0] || null
}

function splitSpeechChunks(text: string) {
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)

  const chunks: string[] = []
  for (const sentence of sentences.length ? sentences : [text.trim()]) {
    if (sentence.length <= 180) {
      chunks.push(sentence)
      continue
    }

    let current = ''
    for (const part of sentence.split(/,\s+|;\s+|:\s+/)) {
      const next = current ? `${current}, ${part}` : part
      if (next.length > 180 && current) {
        chunks.push(current)
        current = part
      } else {
        current = next
      }
    }
    if (current) chunks.push(current)
  }

  return chunks
}
