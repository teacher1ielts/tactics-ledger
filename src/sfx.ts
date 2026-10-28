// Tiny Web Audio synth: every sound is generated, so there are no audio files to load.
type Note = [freq: number, at: number, dur: number, type?: OscillatorType, vol?: number, to?: number]
export type Sfx = 'nav' | 'tick' | 'coin' | 'listen' | 'error' | 'levelup' | 'rankup' | 'quest'

let ctx: AudioContext | null = null
let muted = (() => {
  try {
    return localStorage.getItem('tl-muted') === '1'
  } catch {
    return false
  }
})()

export const isMuted = () => muted
export function setMuted(m: boolean) {
  muted = m
  try {
    localStorage.setItem('tl-muted', m ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function audio(): AudioContext | null {
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!C) return null
    ctx = new C()
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}
/** Browsers only allow audio after a gesture: call this from one. */
export const unlock = () => void audio()

function notes(list: Note[]) {
  const c = audio()
  if (!c || muted) return
  const t0 = c.currentTime + 0.01
  for (const [f, at, dur, type = 'square', vol = 0.06, to] of list) {
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = type
    o.frequency.setValueAtTime(f, t0 + at)
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + at + dur)
    g.gain.setValueAtTime(0.0001, t0 + at)
    g.gain.exponentialRampToValueAtTime(vol, t0 + at + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur)
    o.connect(g).connect(c.destination)
    o.start(t0 + at)
    o.stop(t0 + at + dur + 0.02)
  }
}

/** Filtered-noise sweep: the "whoosh" under big moments. */
function whoosh(at: number, dur: number, from: number, to: number, vol = 0.08) {
  const c = audio()
  if (!c || muted) return
  const len = Math.floor(c.sampleRate * dur)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  const src = c.createBufferSource()
  src.buffer = buf
  const f = c.createBiquadFilter()
  f.type = 'bandpass'
  f.Q.value = 2
  const t0 = c.currentTime + 0.01 + at
  f.frequency.setValueAtTime(from, t0)
  f.frequency.exponentialRampToValueAtTime(to, t0 + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(vol, t0 + dur * 0.4)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(f).connect(g).connect(c.destination)
  src.start(t0)
}

export function play(name: Sfx) {
  switch (name) {
    case 'nav':
      return notes([[520, 0, 0.05, 'square', 0.035]])
    case 'tick':
      return notes([[660, 0, 0.07, 'triangle', 0.09], [990, 0.07, 0.12, 'triangle', 0.09]])
    case 'coin':
      return notes([[1318, 0, 0.06, 'square', 0.05], [1760, 0.06, 0.18, 'square', 0.05]])
    case 'listen':
      return notes([[440, 0, 0.1, 'sine', 0.09, 880]])
    case 'error':
      return notes([[180, 0, 0.22, 'sawtooth', 0.06, 80]])
    case 'levelup':
      return notes([
        [523, 0, 0.09], [659, 0.08, 0.09], [784, 0.16, 0.09], [1047, 0.24, 0.12],
        [1568, 0.36, 0.35, 'triangle', 0.08],
      ])
    case 'rankup':
      whoosh(0, 0.7, 200, 3200)
      return notes([
        [110, 0, 0.6, 'sawtooth', 0.07, 440], [220, 0, 0.6, 'square', 0.035, 880],
        [523, 0.6, 0.12], [659, 0.7, 0.12], [784, 0.8, 0.12], [1047, 0.9, 0.55, 'triangle', 0.1],
        [1568, 0.9, 0.55, 'sine', 0.05],
      ])
    case 'quest':
      return notes([
        [523, 0, 0.12], [659, 0.12, 0.12], [784, 0.24, 0.12], [1047, 0.36, 0.2],
        [784, 0.56, 0.1], [1047, 0.66, 0.1], [1319, 0.76, 0.5, 'triangle', 0.1],
      ])
  }
}
