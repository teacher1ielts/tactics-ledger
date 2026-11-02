import { useRef, useState } from 'react'

interface Recognizer {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}
const w = typeof window === 'undefined' ? undefined : (window as unknown as Record<string, new () => Recognizer>)
const SR = w?.SpeechRecognition ?? w?.webkitSpeechRecognition

/** A text box with a dictation button. Where speech recognition is missing, the keyboard's own dictation key still works. */
export default function MicInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [live, setLive] = useState(false)
  const [err, setErr] = useState('')
  const rec = useRef<Recognizer | null>(null)

  const listen = () => {
    if (live) return rec.current?.stop()
    if (!SR) return setErr('No speech recognition in this browser. Use the dictation key on your keyboard.')
    const r = new SR()
    r.lang = localStorage.getItem('tl-lang') === 'en-US' ? 'en-US' : 'vi-VN'
    r.interimResults = true
    r.continuous = false
    setErr('')
    r.onresult = (e) => onChange(Array.from(e.results).map((x) => x[0].transcript).join(' '))
    r.onerror = (e) => setErr(e.error === 'not-allowed' ? 'Microphone is blocked. Allow it in the browser.' : e.error === 'no-speech' ? "I didn't hear anything." : `Speech error: ${e.error}`)
    r.onend = () => setLive(false)
    rec.current = r
    setLive(true)
    r.start()
  }

  return (
    <div style={{ display: 'grid', gap: 4, flex: 1, minWidth: 0 }}>
      <div className="row">
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
        <button type="button" className={`mic ${live ? 'live' : ''}`} onClick={listen} aria-label={live ? 'Stop listening' : 'Dictate'}>
          🎤
        </button>
      </div>
      {err && <small className="warn">{err}</small>}
    </div>
  )
}
