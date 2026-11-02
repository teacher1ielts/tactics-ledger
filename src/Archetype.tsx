import { WHAT, archetypeOf, STEPS } from './archetypes'
import { JOBS } from './store'

/** The archetype your real activity is shaping: current form, how far each path has come, and what evolves you next. */
export default function ArchetypePanel({ state, compact, onOpen }: { state: import('./store').State; compact?: boolean; onOpen?: () => void }) {
  const a = archetypeOf(state)
  const top = a.paths[0]
  if (compact)
    return (
      <section className="panel arch-compact">
        <h2>Your archetype</h2>
        <button className="arch-open" onClick={onOpen}>
          <b className="arch-name">{a.name}</b>
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
          <div className="muted">{a.blurb}</div>
        </div>
      </div>
      <div className="arch-paths">
        {a.paths.map((p) => {
          const goal = p.tier < 3 ? STEPS[p.tier] : STEPS[2]
          const pct = Math.min(100, Math.round((p.total / goal) * 100))
          return (
            <div key={p.job} className="hero">
              <div className="hero-top">
                <span>
                  {JOBS[p.job]} <b>{p.form}</b> {p.form !== p.job && <small className="muted">({p.job})</small>}
                </span>
                <span className="chip">{p.total} clears</span>
              </div>
              <div className="bar thin">
                <div className="bar-fill" style={{ width: `${pct}%` }} />
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
    </section>
  )
}
