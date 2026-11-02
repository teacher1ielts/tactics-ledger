import { useEffect, useState } from 'react'
import { AXIS, CODEX, FLAVOR, STEPS, WHAT, archetypeOf, earnedOf } from './archetypes'
import { JOBS, type Job, type State } from './store'

const read = (k: string): string[] => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? '[]')
  } catch {
    return []
  }
}
const write = (k: string, v: string[]) => {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {
    /* ignore */
  }
}

// axes of the compass: Mind up, Body right, Spirit down, Wealth left
const DIR: Record<Job, [number, number]> = { Scholar: [0, -1], Knight: [1, 0], Monk: [0, 1], Merchant: [-1, 0] }
const C = 110
const R = 78
const rad = (n: number) => Math.sqrt(Math.min(1, n / STEPS[2])) // 100 clears reaches the rim

/** Your orientation: the lifetime shape (solid) and the last 30 days (dashed) on four axes. */
function Compass({ paths }: { paths: ReturnType<typeof archetypeOf>['paths'] }) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setOn(true), 60)
    return () => clearTimeout(t)
  }, [])
  const pts = (get: (p: (typeof paths)[number]) => number) =>
    (Object.keys(DIR) as Job[])
      .map((j) => {
        const p = paths.find((x) => x.job === j)!
        const r = Math.max(0.06, rad(get(p))) * R
        return `${C + DIR[j][0] * r},${C + DIR[j][1] * r}`
      })
      .join(' ')
  const ring = (n: number) => {
    const r = rad(n) * R
    return `${C},${C - r} ${C + r},${C} ${C},${C + r} ${C - r},${C}`
  }
  const lab: Record<Job, { x: number; y: number; a: 'middle' | 'start' | 'end' }> = {
    Scholar: { x: C, y: 14, a: 'middle' },
    Knight: { x: C + R + 12, y: C + 4, a: 'start' },
    Monk: { x: C, y: 2 * C - 8, a: 'middle' },
    Merchant: { x: C - R - 12, y: C + 4, a: 'end' },
  }
  return (
    <svg viewBox="-34 0 288 240" className="compass" role="img" aria-label="Your orientation on four axes: Mind, Body, Spirit, Wealth">
      {[STEPS[0], STEPS[1], STEPS[2]].map((n) => (
        <polygon key={n} points={ring(n)} fill="none" stroke="var(--gold-dim)" strokeWidth="1" opacity="0.7" />
      ))}
      <line x1={C} y1={C - R} x2={C} y2={C + R} stroke="var(--gold-dim)" strokeWidth="1" opacity="0.7" />
      <line x1={C - R} y1={C} x2={C + R} y2={C} stroke="var(--gold-dim)" strokeWidth="1" opacity="0.7" />
      <g style={{ transformOrigin: `${C}px ${C}px`, transform: on ? 'scale(1)' : 'scale(0.05)', transition: 'transform 900ms cubic-bezier(.2,.9,.3,1.15)' }}>
        <polygon points={pts((p) => p.total)} fill="var(--gold)" fillOpacity="0.28" stroke="var(--gold)" strokeWidth="2.5" strokeLinejoin="round" />
        <polygon points={pts((p) => p.recent * 3)} fill="none" stroke="var(--text)" strokeWidth="2" strokeDasharray="5 4" strokeLinejoin="round" />
      </g>
      {(Object.keys(DIR) as Job[]).map((j) => {
        const p = paths.find((x) => x.job === j)!
        return (
          <text key={j} x={lab[j].x} y={lab[j].y} textAnchor={lab[j].a} fill="var(--text)" fontSize="13" fontFamily="inherit">
            <tspan fontWeight="700">{AXIS[j]}</tspan>
            <tspan x={lab[j].x} dy="13" fill="var(--muted)" fontSize="11">
              {p.form}
            </tspan>
          </text>
        )
      })}
    </svg>
  )
}

/** Every archetype there is. Earned ones are revealed; others stay a mystery, with a clue once you are close. */
function Codex({ state }: { state: State }) {
  const a = archetypeOf(state)
  const earned = new Set(earnedOf(a.paths))
  const [seen] = useState(() => read('tl-codex-seen'))
  const [open, setOpen] = useState<string | null>(null)
  const firstLoad = seen.length === 0
  useEffect(() => {
    // the first time the Codex is ever shown, what you already have is not "new"
    write('tl-codex-seen', [...new Set([...seen, ...(firstLoad ? earned : [])])])
  }, [firstLoad]) // eslint-disable-line react-hooks/exhaustive-deps
  const totalOf = (j: Job) => a.paths.find((p) => p.job === j)!.total
  const near = (e: (typeof CODEX)[number]) =>
    e.tier === -1 ? e.jobs.every((j) => totalOf(j) >= 8) : e.tier === -2 ? a.paths.every((p) => p.total >= 30) : e.tier >= 1 ? totalOf(e.jobs[0]) >= (STEPS[e.tier - 1] ?? 0) * 0.5 : true
  const count = CODEX.filter((e) => earned.has(e.name)).length

  return (
    <>
      <h3 className="codex-h">
        Codex{' '}
        <small className="muted">
          {count} of {CODEX.length} discovered
        </small>
      </h3>
      <div className="codex">
        {CODEX.map((e) => {
          const got = earned.has(e.name)
          const isNew = got && !firstLoad && !seen.includes(e.name)
          const hint = !got && near(e)
          return (
            <button key={e.name} className={`cx ${got ? 'got' : hint ? 'hint' : 'lock'} ${isNew ? 'new' : ''}`} onClick={() => setOpen(open === e.name ? null : e.name)} aria-label={got ? e.name : 'Undiscovered archetype'}>
              <span className="cx-i">{got ? (e.jobs.length === 1 ? JOBS[e.jobs[0]] : e.tier === -2 ? '👑' : e.tier === -3 ? '🧭' : e.jobs.map((j) => JOBS[j]).join('')) : hint ? '❓' : '▪'}</span>
              <span className="cx-n">{got ? e.name : hint ? '???' : ''}</span>
              {isNew && <span className="cx-new">NEW</span>}
            </button>
          )
        })}
      </div>
      {open &&
        (() => {
          const e = CODEX.find((x) => x.name === open)!
          const got = earned.has(e.name)
          return (
            <p className="muted codex-detail">
              {got ? (
                <>
                  <b>{e.name}.</b> {FLAVOR[e.name]} <i>({e.clue})</i>
                </>
              ) : near(e) ? (
                <>
                  <b>Not yet discovered.</b> Clue: {e.clue}
                </>
              ) : (
                <>
                  <b>Undiscovered.</b> Keep exploring. It will show a clue as you get closer.
                </>
              )}
            </p>
          )
        })()}
    </>
  )
}

/** The archetype your real activity is shaping: orientation compass, current form, Codex of everything to discover. */
export default function ArchetypePanel({ state, compact, onOpen }: { state: State; compact?: boolean; onOpen?: () => void }) {
  const a = archetypeOf(state)
  const top = a.paths[0]
  if (compact)
    return (
      <section className="panel arch-compact">
        <h2>Your archetype</h2>
        <button className="arch-open" onClick={onOpen}>
          <b className="arch-name">{a.name}</b>
          <small className="muted">{a.orientation}</small>
          <small className="muted">{a.next}</small>
        </button>
      </section>
    )
  return (
    <section className="panel">
      <h2>Your archetype</h2>
      <div className="arch-head">
        <span className="arch-icon">{a.kind === 'hybrid' ? JOBS[a.paths[0].job] + JOBS[a.paths[1].job] : a.kind === 'new' ? '🧭' : a.kind === 'paragon' ? '👑' : JOBS[top.job]}</span>
        <div>
          <b className="arch-name">{a.name}</b>
          <div className="muted">{FLAVOR[a.name]}</div>
        </div>
      </div>
      <p className="orient">
        <b>Your orientation:</b> {a.orientation}
      </p>
      <Compass paths={a.paths} />
      <p className="muted legend">Solid shape: everything you have done. Dashed line: the last 30 days, so you can see where you are heading. Rings mark 20, 50 and 100 clears.</p>
      <div className="arch-paths">
        {a.paths.map((p) => {
          const goal = p.tier < 3 ? STEPS[p.tier] : STEPS[2]
          return (
            <div key={p.job} className="hero">
              <div className="hero-top">
                <span>
                  {JOBS[p.job]} <b>{p.form}</b> {p.form !== p.job && <small className="muted">({p.job})</small>}
                </span>
                <span className="chip">{p.total} clears</span>
              </div>
              <div className="bar thin">
                <div className="bar-fill" style={{ width: `${Math.min(100, Math.round((p.total / goal) * 100))}%` }} />
              </div>
              <small className="muted">
                {WHAT[p.job]} · {p.recent} in the last 30 days{p.tier < 3 ? ` · next form at ${STEPS[p.tier]}` : ' · top form'}
              </small>
            </div>
          )
        })}
      </div>
      <p className="muted">
        <b>Next:</b> {a.next}
      </p>
      <p className="muted">{a.trend}</p>
      <Codex state={state} />
    </section>
  )
}
