import { useEffect, type CSSProperties } from 'react'
import type { Burst } from './feedback'

const LABEL: Record<Burst['kind'], string> = { rank: 'NEW GEAR', hero: 'PARTY', level: 'COMMANDER', quest: 'MISSION' }

/** Full-screen celebration. Auto-dismisses; tap to skip. */
export default function BurstOverlay({ b, onDone }: { b: Burst; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, b.kind === 'rank' ? 3800 : 3000)
    return () => clearTimeout(t)
  }, [b.id, b.kind, onDone])

  const n = b.kind === 'rank' ? 36 : 22
  return (
    <div className={`burst ${b.kind}`} style={{ '--c': b.color } as CSSProperties} onClick={onDone} role="status" aria-live="polite">
      <div className="burst-flash" />
      <div className="burst-stage">
        <div className="burst-ring" />
        <div className="burst-ring r2" />
        {Array.from({ length: n }, (_, i) => (
          <i key={i} style={{ '--a': `${(i * 360) / n}deg`, '--d': `${110 + ((i * 53) % 120)}px`, '--t': `${(i % 6) * 0.05}s` } as CSSProperties} />
        ))}
        <div className="burst-card">
          <small>{LABEL[b.kind]}</small>
          <h3 data-text={b.title}>{b.title}</h3>
          <p>{b.sub}</p>
          <span>tap to continue</span>
        </div>
      </div>
    </div>
  )
}
