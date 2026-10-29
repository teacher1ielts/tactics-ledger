import { lazy, Suspense, useState } from 'react'
import { JOBS, dayKey, partyOf, goalProgress, parseVnd, uid, vnd, type Goal, type GoalKind, type Job, type State } from './store'

type Update = (fn: (s: State) => State) => void

const Map3D = lazy(() => import('./WorldMap3D'))

const CLASS_BLURB: Record<Job, string> = {
  Scholar: 'Study and learning habits',
  Knight: 'Training habits and milestone quests',
  Monk: 'Calm and recovery habits',
  Merchant: 'Money habits and every transaction you log',
}

function jobOfGoal(g: Goal, s: State): Job {
  if (g.kind === 'habit') return s.habits.find((h) => h.id === g.habitId)?.job ?? 'Scholar'
  return g.kind === 'savings' ? 'Merchant' : 'Knight'
}

const KIND_LABEL: Record<GoalKind, string> = {
  habit: 'Habit streak (auto)',
  savings: 'Savings (deposits)',
  manual: 'Milestones (checklist)',
}

const daysLeft = (g: Goal) =>
  g.deadline ? Math.ceil((new Date(g.deadline + 'T12:00:00').getTime() - new Date(dayKey() + 'T12:00:00').getTime()) / 86400000) : null

const amountText = (g: Goal, cur: number, target: number) =>
  g.kind === 'savings' ? `${vnd(cur)} / ${vnd(target)}` : g.kind === 'habit' ? `${cur} / ${target} clears${g.period ? ' this week' : ''}` : `${cur} / ${target} milestones`

export default function WorldMap({ state, update, cyber }: { state: State; update: Update; cyber: boolean }) {
  const [sel, setSel] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [flat, setFlat] = useState(false)

  const goals = [...state.goals].sort((a, b) => (a.term === b.term ? 0 : a.term === 'short' ? -1 : 1))
  const selected = goals.find((g) => g.id === sel) ?? null
  const use3d = cyber && !flat && goals.length > 0
  const party = partyOf(state)

  const W = 360
  const STEP = 120
  const H = Math.max(200, 80 + goals.length * STEP)
  const pts = goals.map((_, i) => ({ x: i % 2 === 0 ? 100 : 260, y: 70 + i * STEP }))
  const road = pts.reduce((d, p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`
    const q = pts[i - 1]
    return `${d} C ${q.x} ${q.y + 60}, ${p.x} ${p.y - 60}, ${p.x} ${p.y}`
  }, '')

  return (
    <>
      <section className="panel">
        <h2>
          World Map
          <span className="row" style={{ flex: 'none' }}>
            {cyber && goals.length > 0 && (
              <button className="btn small" onClick={() => setFlat((f) => !f)}>
                {flat ? '3D' : '2D'}
              </button>
            )}
            <button className="btn small" onClick={() => setAdding((a) => !a)}>
              {adding ? 'Close' : '+ Quest'}
            </button>
          </span>
        </h2>
        {use3d && (
          <Suspense fallback={<p className="muted">Booting the grid…</p>}>
            <Map3D
              towers={goals.map((g) => ({ id: g.id, name: g.name, pct: goalProgress(g, state).pct, term: g.term, job: jobOfGoal(g, state) }))}
              heroes={party}
              selected={sel}
              onSelect={setSel}
              onFail={() => setFlat(true)}
            />
          </Suspense>
        )}
        {goals.length === 0 && <p className="muted">The map is blank. Chart your first quest: a short-term skirmish or a long-term castle.</p>}
        {goals.length > 0 && !use3d && (
          <svg viewBox={`0 0 ${W} ${H}`} className="map" role="img" aria-label="World map of goals">
            <path d={road} className="road" />
            {goals.map((g, i) => {
              const { pct } = goalProgress(g, state)
              const r = g.term === 'long' ? 34 : 26
              const C = 2 * Math.PI * (r + 6)
              const won = pct >= 1
              const { x, y } = pts[i]
              return (
                <g key={g.id} className={`node ${sel === g.id ? 'sel' : ''}`} onClick={() => setSel(g.id)} tabIndex={0} role="button" aria-label={g.name} onKeyDown={(e) => e.key === 'Enter' && setSel(g.id)}>
                  <circle cx={x} cy={y} r={r + 6} className="ring-bg" />
                  <circle cx={x} cy={y} r={r + 6} className={`ring ${won ? 'won' : ''}`} strokeDasharray={`${C * pct} ${C}`} transform={`rotate(-90 ${x} ${y})`} />
                  <circle cx={x} cy={y} r={r} className={`disc ${g.term}`} />
                  <text x={x} y={y + (g.term === 'long' ? 11 : 8)} textAnchor="middle" className="glyph" fontSize={g.term === 'long' ? 30 : 22}>
                    {won ? '★' : g.term === 'long' ? '🏰' : '⚑'}
                  </text>
                  <text x={x} y={y + r + 24} textAnchor="middle" className="label">
                    {g.name.length > 22 ? g.name.slice(0, 21) + '…' : g.name}
                  </text>
                </g>
              )
            })}
          </svg>
        )}
      </section>

      <section className="panel">
        <h2>Your Party</h2>
        <div className="party">
          {party.map((p) => (
            <div key={p.job} className="hero">
              <div className="hero-top">
                <span>
                  {JOBS[p.job]} <b>{p.job}</b>
                </span>
                <span className="chip">
                  Lv {p.level} · {p.rank}
                </span>
              </div>
              <div className="bar thin">
                <div className="bar-fill" style={{ width: `${p.into * 10}%` }} />
              </div>
              <small className="muted">
                {CLASS_BLURB[p.job]} · {p.clears} total · {10 - p.into} to next level
                {p.tier < 3 ? ` · next gear at ${[20, 50, 100][p.tier]}` : ' · max gear'}
              </small>
            </div>
          ))}
        </div>
      </section>

      {adding && <GoalForm state={state} update={update} done={() => setAdding(false)} />}
      {selected && <GoalDetail key={selected.id} g={selected} state={state} update={update} close={() => setSel(null)} />}
    </>
  )
}

function GoalForm({ state, update, done }: { state: State; update: Update; done: () => void }) {
  const [name, setName] = useState('')
  const [term, setTerm] = useState<'short' | 'long'>('short')
  const [kind, setKind] = useState<GoalKind>('habit')
  const [target, setTarget] = useState('')
  const [habitId, setHabitId] = useState(state.habits[0]?.id ?? '')
  const [weekly, setWeekly] = useState(false)
  const [deadline, setDeadline] = useState('')
  const [steps, setSteps] = useState('')
  const [err, setErr] = useState('')

  const save = () => {
    if (!name.trim()) return setErr('Name your quest.')
    let t = 0
    if (kind === 'habit') {
      t = parseInt(target, 10)
      if (!habitId) return setErr('Recruit a habit in Battles first.')
      if (!(t > 0)) return setErr('Enter how many clears you need, e.g. 30.')
    } else if (kind === 'savings') {
      t = parseVnd(target)
      if (!(t > 0)) return setErr('Enter a savings target like 20tr.')
    }
    const milestones = steps
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean)
      .map((text) => ({ id: uid(), text, done: false }))
    if (kind === 'manual' && milestones.length === 0) return setErr('Add at least one milestone, one per line.')
    const g: Goal = { id: uid(), name: name.trim(), term, kind, start: dayKey(), deadline: deadline || undefined, target: t, habitId: kind === 'habit' ? habitId : undefined, period: kind === 'habit' && weekly ? 'week' : undefined, deposits: [], milestones: kind === 'manual' ? milestones : [] }
    update((s) => ({ ...s, goals: [...s.goals, g] }))
    done()
  }

  return (
    <section className="panel">
      <h2>Chart a Quest</h2>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Quest name, e.g. IELTS 7.0" />
        <div className="seg">
          <button type="button" className={term === 'short' ? 'on' : ''} onClick={() => setTerm('short')}>
            Short-term ⚑
          </button>
          <button type="button" className={term === 'long' ? 'on' : ''} onClick={() => setTerm('long')}>
            Long-term 🏰
          </button>
        </div>
        <select value={kind} onChange={(e) => setKind(e.target.value as GoalKind)}>
          {(Object.keys(KIND_LABEL) as GoalKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
        {kind === 'habit' && (
          <div className="row">
            <select value={habitId} onChange={(e) => setHabitId(e.target.value)}>
              {state.habits.length === 0 && <option value="">No habits yet</option>}
              {state.habits.map((h) => (
                <option key={h.id} value={h.id}>
                  {JOBS[h.job]} {h.name}
                </option>
              ))}
            </select>
            <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder={weekly ? 'Clears per week (e.g. 2)' : 'Clears in total (e.g. 30)'} inputMode="numeric" />
          </div>
        )}
        {kind === 'habit' && (
          <label className="row alert-row">
            <input type="checkbox" checked={weekly} onChange={(e) => setWeekly(e.target.checked)} />
            <span>Repeats every week (resets Monday)</span>
          </label>
        )}
        {kind === 'savings' && <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Target (20tr, 150tr)" inputMode="decimal" />}
        {kind === 'manual' && <textarea value={steps} onChange={(e) => setSteps(e.target.value)} placeholder={'One milestone per line\nBook the exam\nFinish Writing course'} rows={4} />}
        <label className="muted">
          Deadline (optional)
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </label>
        {err && <p className="neg">{err}</p>}
        <button className="btn" type="submit">
          Add to Map
        </button>
      </form>
    </section>
  )
}

function GoalDetail({ g, state, update, close }: { g: Goal; state: State; update: Update; close: () => void }) {
  const [dep, setDep] = useState('')
  const [err, setErr] = useState('')
  const { cur, target, pct } = goalProgress(g, state)
  const left = daysLeft(g)
  const patch = (fn: (g: Goal) => Goal) => update((s) => ({ ...s, goals: s.goals.map((x) => (x.id === g.id ? fn(x) : x)) }))
  const habit = state.habits.find((h) => h.id === g.habitId)

  const deposit = () => {
    const v = parseVnd(dep)
    if (!Number.isFinite(v) || v === 0) return setErr('Enter an amount like 500k. Negative values withdraw.')
    setErr('')
    patch((x) => ({ ...x, deposits: [...x.deposits, { date: dayKey(), amount: v }] }))
    setDep('')
  }

  return (
    <section className="panel">
      <h2>
        {g.term === 'long' ? '🏰' : '⚑'} {g.name}
        <button className="x" onClick={close} aria-label="Close details">
          ✕
        </button>
      </h2>
      <div className="bar">
        <div className="bar-fill" style={{ width: `${pct * 100}%` }} />
      </div>
      <p className="muted">
        {amountText(g, cur, target)} · {Math.round(pct * 100)}%
        {pct >= 1 ? (g.period ? ' · done for this week' : ' · QUEST COMPLETE (+50 XP)') : left !== null ? (left >= 0 ? ` · ${left} days left` : ` · ${-left} days overdue`) : ''}
      </p>
      {g.kind === 'habit' && <p className="muted">Fed by {habit ? `${JOBS[habit.job]} ${habit.name}` : 'a deleted habit'} since {g.start}.</p>}

      {g.kind === 'savings' && (
        <>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault()
              deposit()
            }}
          >
            <input value={dep} onChange={(e) => setDep(e.target.value)} placeholder="Deposit (500k, 2tr)" inputMode="decimal" />
            <button className="btn" type="submit">
              Deposit
            </button>
          </form>
          {err && <p className="neg">{err}</p>}
          <ul className="list">
            {[...g.deposits].reverse().slice(0, 5).map((d, i) => (
              <li key={i}>
                <span className="grow muted">{d.date.slice(5)}</span>
                <b className={d.amount >= 0 ? 'pos' : 'neg'}>{vnd(d.amount)}</b>
              </li>
            ))}
          </ul>
        </>
      )}

      {g.kind === 'manual' && (
        <ul className="list">
          {g.milestones.map((m) => (
            <li key={m.id} className={m.done ? 'done' : ''}>
              <button className="check" aria-label={`Toggle ${m.text}`} onClick={() => patch((x) => ({ ...x, milestones: x.milestones.map((y) => (y.id === m.id ? { ...y, done: !y.done } : y)) }))}>
                {m.done ? '◆' : '◇'}
              </button>
              <span className="grow">{m.text}</span>
            </li>
          ))}
        </ul>
      )}

      <button
        className="btn danger"
        onClick={() => {
          if (!confirm(`Abandon "${g.name}"?`)) return
          update((s) => ({ ...s, goals: s.goals.filter((x) => x.id !== g.id) }))
          close()
        }}
      >
        Abandon quest
      </button>
    </section>
  )
}
