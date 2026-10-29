import { useEffect, useState } from 'react'
import {
  INCOME_CATS,
  JOBS,
  SPEND_CATS,
  XP_PER_CHECK,
  dayKey,
  goalProgress,
  levelOf,
  parseVnd,
  shiftDay,
  streak,
  uid,
  useStore,
  vnd,
  xpOf,
  type Job,
  type State,
  type TxType,
} from './store'

import WorldMap from './WorldMap'

import Insights from './Insights'
import Command from './Command'
import ImportPanel from './ImportPanel'
import { blocksFor, hhmm } from './scheduler'
import BurstOverlay from './BurstOverlay'
import { useFeedback } from './feedback'
import { dueKey, hasDebrief, useAlerts, useReminders } from './alerts'
import { reviewSummary, weeklyReview } from './review'
import { isMuted, play, setMuted, unlock } from './sfx'
import SyncPanel from './SyncPanel'
import { useSync } from './sync'

type Tab = 'camp' | 'habits' | 'treasury' | 'map' | 'intel' | 'command'
type Update = (fn: (s: State) => State) => void

export default function App() {
  const [state, setState] = useStore()
  const [tab, setTab] = useState<Tab>('camp')
  const [theme, setTheme] = useState<'cyber' | 'tactics'>(() => {
    try {
      return localStorage.getItem('tl-theme') === 'tactics' ? 'tactics' : 'cyber'
    } catch {
      return 'cyber'
    }
  })
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme === 'cyber' ? '#07060f' : '#14182b')
    try {
      localStorage.setItem('tl-theme', theme)
    } catch {
      /* ignore */
    }
  }, [theme])
  const update: Update = (fn) => setState(fn)
  const fb = useFeedback(state)
  const sync = useSync(state, setState)
  const [syncOpen, setSyncOpen] = useState(false)
  const [alerts, setAlerts] = useAlerts()
  useReminders(state, alerts, setAlerts)
  const [muted, setMute] = useState(isMuted)
  useEffect(() => {
    const go = () => unlock()
    window.addEventListener('pointerdown', go, { once: true })
    return () => window.removeEventListener('pointerdown', go)
  }, [])
  const due = alerts.on ? dueKey(alerts) : null
  const debriefDue = !!due && due !== alerts.seen && hasDebrief(state)
  useEffect(() => {
    if (tab === 'intel' && due && due !== alerts.seen) setAlerts((a) => ({ ...a, seen: due }))
  }, [tab, due, alerts.seen, setAlerts])
  const go = (t: Tab) => {
    play('nav')
    setTab(t)
  }
  const { level, into } = levelOf(xpOf(state))

  return (
    <div className="shell">
      <header className="top">
        <div>
          <div className="title">Tactics Ledger</div>
          <div className="sub">Commander · Lv {level}</div>
        </div>
        <div className="hdr-right">
          <button className="themebtn" onClick={() => setTheme(theme === 'cyber' ? 'tactics' : 'cyber')} aria-label="Switch theme" title="Switch theme">
            {theme === 'cyber' ? '◐ NEON' : '◐ TACTICS'}
          </button>
          <button className={`themebtn sync-${sync.status}`} onClick={() => setSyncOpen(true)} aria-label={`Cloud sync: ${sync.status}`} title="Cloud sync and backup">
            {sync.status === 'syncing' ? '↻' : sync.status === 'error' ? '⚠' : sync.status === 'idle' ? '☁✓' : '☁'}
          </button>
          <button className="themebtn" onClick={() => { const m = !muted; setMuted(m); setMute(m); if (!m) play('tick') }} aria-label={muted ? 'Unmute sound' : 'Mute sound'} title={muted ? 'Sound off' : 'Sound on'}>
            {muted ? '🔇' : '🔊'}
          </button>
          <div className="xp" title={`${into}/100 XP`}>
            <div className="xp-fill" style={{ width: `${into}%` }} />
          </div>
        </div>
      </header>

      <main>
        {tab === 'camp' && <Camp state={state} update={update} debrief={debriefDue ? () => go('intel') : null} />}
        {tab === 'habits' && <Habits state={state} update={update} />}
        {tab === 'treasury' && <Treasury state={state} update={update} />}
        {tab === 'map' && <WorldMap state={state} update={update} cyber={theme === 'cyber'} />}
        {tab === 'intel' && <Insights state={state} alerts={alerts} setAlerts={setAlerts} />}
        {tab === 'command' && <Command state={state} update={update} />}
      </main>

      <nav className="nav">
        <NavBtn id="camp" cur={tab} set={go} label="Camp" icon="🏕️" />
        <NavBtn id="habits" cur={tab} set={go} label="Battles" icon="⚔️" />
        <NavBtn id="treasury" cur={tab} set={go} label="Treasury" icon="💰" />
        <NavBtn id="map" cur={tab} set={go} label="Map" icon="🗺️" />
        <NavBtn id="intel" cur={tab} set={go} label="Intel" icon="🔭" />
        <NavBtn id="command" cur={tab} set={go} label="Command" icon="🎙️" />
      </nav>
      {syncOpen && <SyncPanel sync={sync} state={state} setState={setState} close={() => setSyncOpen(false)} />}
      {fb.bursts[0] && <BurstOverlay key={fb.bursts[0].id} b={fb.bursts[0]} onDone={fb.next} />}
    </div>
  )
}

function NavBtn(p: { id: Tab; cur: Tab; set: (t: Tab) => void; label: string; icon: string }) {
  return (
    <button className={`navbtn ${p.cur === p.id ? 'on' : ''}`} onClick={() => p.set(p.id)}>
      <span>{p.icon}</span>
      {p.label}
    </button>
  )
}

function Panel(p: { title?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="panel">
      {p.title && (
        <h2>
          {p.title}
          {p.right}
        </h2>
      )}
      {p.children}
    </section>
  )
}

const monthOf = (d: string) => d.slice(0, 7)

function useMonthStats(state: State) {
  const month = monthOf(dayKey())
  const tx = state.txs.filter((t) => monthOf(t.date) === month)
  const income = tx.filter((t) => t.type === 'income').reduce((a, t) => a + t.amount, 0)
  const spent = tx.filter((t) => t.type === 'spend').reduce((a, t) => a + t.amount, 0)
  const byCat = new Map<string, number>()
  tx.filter((t) => t.type === 'spend').forEach((t) => byCat.set(t.category, (byCat.get(t.category) ?? 0) + t.amount))
  return { income, spent, byCat }
}

function toggleHabit(update: Update, id: string, day: string) {
  update((s) => ({
    ...s,
    habits: s.habits.map((h) =>
      h.id !== id ? h : { ...h, done: h.done.includes(day) ? h.done.filter((d) => d !== day) : [...h.done, day] },
    ),
  }))
}

function Camp({ state, update, debrief }: { state: State; update: Update; debrief: (() => void) | null }) {
  const rv = debrief ? weeklyReview(state) : null
  const today = dayKey()
  const { income, spent } = useMonthStats(state)
  const doneToday = state.habits.filter((h) => h.done.includes(today)).length
  const left = state.budget ? state.budget - spent : null
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
  const upcoming = blocksFor(state, today)
    .filter((b) => !b.done && b.end > nowMin)
    .slice(0, 3)

  return (
    <>
      <Panel title="Today's Turn Order">
        {state.habits.length === 0 && <p className="muted">No battles yet. Add a habit in Battles.</p>}
        <ul className="list">
          {[...state.habits]
            .sort((a, b) => Number(a.done.includes(today)) - Number(b.done.includes(today)))
            .map((h) => {
              const on = h.done.includes(today)
              return (
                <li key={h.id} className={on ? 'done' : ''}>
                  <button className="check" onClick={() => toggleHabit(update, h.id, today)} aria-label={`Toggle ${h.name}`}>
                    {on ? '◆' : '◇'}
                  </button>
                  <span className="grow">
                    {JOBS[h.job]} {h.name}
                  </span>
                  <span className="chip">🔥 {streak(h)}</span>
                </li>
              )
            })}
        </ul>
        {state.habits.length > 0 && (
          <p className="muted">
            {doneToday}/{state.habits.length} cleared · +{XP_PER_CHECK} XP each
          </p>
        )}
      </Panel>

      {debrief && rv && (
        <Panel title="Weekly Debrief">
          <p style={{ margin: 0 }}>Your weekly debrief is ready. {reviewSummary(rv)}</p>
          <button className="btn" style={{ marginTop: 10 }} onClick={debrief}>
            Open debrief
          </button>
        </Panel>
      )}

      {upcoming.length > 0 && (
        <Panel title="Next Up">
          <ul className="list">
            {upcoming.map((b) => (
              <li key={b.id}>
                <span className="time">{hhmm(b.start)}</span>
                <span className="grow">
                  {b.kind === 'habit' ? '⚔️' : b.kind === 'task' ? '📝' : '📅'} {b.title}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {state.goals.length > 0 && (
        <Panel title="Active Quests">
          {state.goals
            .map((g) => ({ g, p: goalProgress(g, state) }))
            .filter((x) => x.p.pct < 1 || x.g.period)
            .slice(0, 4)
            .map(({ g, p }) => (
              <div key={g.id} className="catrow">
                <span style={{ width: 120 }}>
                  {g.term === 'long' ? '🏰' : '⚑'} {g.name}
                </span>
                <div className="bar thin">
                  <div className="bar-fill" style={{ width: `${p.pct * 100}%` }} />
                </div>
                <b style={{ width: 44 }}>{Math.round(p.pct * 100)}%</b>
              </div>
            ))}
        </Panel>
      )}

      <Panel title="War Chest · this month">
        <div className="stats">
          <div>
            <small>Income</small>
            <b className="pos">{vnd(income)}</b>
          </div>
          <div>
            <small>Spent</small>
            <b className="neg">{vnd(spent)}</b>
          </div>
          <div>
            <small>{left === null ? 'Net' : 'Budget left'}</small>
            <b className={(left ?? income - spent) < 0 ? 'neg' : 'pos'}>{vnd(left ?? income - spent)}</b>
          </div>
        </div>
      </Panel>
    </>
  )
}

function Habits({ state, update }: { state: State; update: Update }) {
  const [name, setName] = useState('')
  const [job, setJob] = useState<Job>('Scholar')
  const today = dayKey()
  const week = Array.from({ length: 7 }, (_, i) => shiftDay(today, i - 6))

  const add = () => {
    if (!name.trim()) return
    update((s) => ({ ...s, habits: [...s.habits, { id: uid(), name: name.trim(), job, done: [] }] }))
    setName('')
  }

  return (
    <>
      <Panel title="Recruit a Habit">
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Study IELTS 1h" />
          <select value={job} onChange={(e) => setJob(e.target.value as Job)}>
            {(Object.keys(JOBS) as Job[]).map((j) => (
              <option key={j} value={j}>
                {JOBS[j]} {j}
              </option>
            ))}
          </select>
          <button className="btn" type="submit">
            Add
          </button>
        </form>
      </Panel>

      {state.habits.map((h) => (
        <Panel
          key={h.id}
          title={`${JOBS[h.job]} ${h.name}`}
          right={
            <button
              className="x"
              aria-label={`Delete ${h.name}`}
              onClick={() => confirm(`Disband "${h.name}"?`) && update((s) => ({ ...s, habits: s.habits.filter((x) => x.id !== h.id) }))}
            >
              ✕
            </button>
          }
        >
          <div className="week">
            {week.map((d) => {
              const on = h.done.includes(d)
              return (
                <button key={d} className={`day ${on ? 'on' : ''} ${d === today ? 'today' : ''}`} onClick={() => toggleHabit(update, h.id, d)}>
                  <small>{new Date(d + 'T12:00:00').toLocaleDateString('en', { weekday: 'narrow' })}</small>
                  {on ? '◆' : '◇'}
                </button>
              )
            })}
          </div>
          <p className="muted">
            🔥 {streak(h)}-day combo · {h.done.length} total clears
          </p>
        </Panel>
      ))}
    </>
  )
}

function Treasury({ state, update }: { state: State; update: Update }) {
  const [type, setType] = useState<TxType>('spend')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(SPEND_CATS[0])
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const { income, spent, byCat } = useMonthStats(state)
  const cats = type === 'spend' ? SPEND_CATS : INCOME_CATS

  const switchType = (t: TxType) => {
    setType(t)
    setCategory((t === 'spend' ? SPEND_CATS : INCOME_CATS)[0])
  }

  const add = () => {
    const v = parseVnd(amount)
    if (!Number.isFinite(v) || v <= 0) return setErr('Enter an amount like 50k, 1.5tr or 120000')
    setErr('')
    update((s) => ({ ...s, txs: [{ id: uid(), date: dayKey(), type, amount: v, category, note: note.trim() }, ...s.txs] }))
    setAmount('')
    setNote('')
  }

  const max = Math.max(1, ...byCat.values())
  const pct = state.budget ? Math.min(100, (spent / state.budget) * 100) : 0

  return (
    <>
      <ImportPanel state={state} update={update} />
      <Panel title="Record Transaction">
        <div className="seg">
          <button className={type === 'spend' ? 'on' : ''} onClick={() => switchType('spend')}>
            Spend
          </button>
          <button className={type === 'income' ? 'on' : ''} onClick={() => switchType('income')}>
            Income
          </button>
        </div>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount (50k, 1.5tr, 120000)" inputMode="decimal" />
          <div className="row">
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {cats.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" />
          </div>
          {err && <p className="neg">{err}</p>}
          <button className="btn" type="submit">
            Record
          </button>
        </form>
      </Panel>

      <Panel title="Monthly Budget">
        <div className="row">
          <input
            defaultValue={state.budget || ''}
            placeholder="Spending cap, e.g. 8tr"
            inputMode="decimal"
            onBlur={(e) => {
              const v = e.target.value.trim() ? parseVnd(e.target.value) : 0
              if (Number.isFinite(v)) update((s) => ({ ...s, budget: v }))
            }}
          />
        </div>
        {state.budget > 0 && (
          <>
            <div className="bar">
              <div className={`bar-fill ${pct > 90 ? 'hot' : ''}`} style={{ width: `${pct}%` }} />
            </div>
            <p className="muted">
              {vnd(spent)} of {vnd(state.budget)} · income {vnd(income)}
            </p>
          </>
        )}
      </Panel>

      {byCat.size > 0 && (
        <Panel title="Spending by Category">
          {[...byCat.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([c, v]) => (
              <div key={c} className="catrow">
                <span>{c}</span>
                <div className="bar thin">
                  <div className="bar-fill" style={{ width: `${(v / max) * 100}%` }} />
                </div>
                <b>{vnd(v)}</b>
              </div>
            ))}
        </Panel>
      )}

      <Panel title="Ledger">
        {state.txs.length === 0 && <p className="muted">Nothing recorded yet.</p>}
        <ul className="list">
          {state.txs.slice(0, 40).map((t) => (
            <li key={t.id}>
              <span className="grow">
                {t.category}
                <small className="muted"> · {t.date.slice(5)} {t.note && `· ${t.note}`}</small>
              </span>
              <b className={t.type === 'income' ? 'pos' : 'neg'}>
                {t.type === 'income' ? '+' : '−'}
                {vnd(t.amount)}
              </b>
              <button className="x" aria-label="Delete" onClick={() => update((s) => ({ ...s, txs: s.txs.filter((x) => x.id !== t.id) }))}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  )
}
