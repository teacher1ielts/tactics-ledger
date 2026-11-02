import { useEffect, useState } from 'react'
import MicInput from './MicInput'
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
import Treasury from './Treasury'
import { HabitEditor } from './Edit'
import { silence } from './feedback'
import { postRecurring, type Habit } from './store'
import { blocksFor, hhmm } from './scheduler'
import BurstOverlay from './BurstOverlay'
import { useFeedback } from './feedback'
import { dueKey, hasDebrief, useAlerts, useReminders } from './alerts'
import { reviewSummary, weeklyReview } from './review'
import { isMuted, play, setMuted, unlock } from './sfx'
import SyncPanel from './SyncPanel'
import { T, isPlain, setPlain } from './labels'
import Todo from './Todo'
import ArchetypePanel from './Archetype'
import { useSync } from './sync'

type Tab = 'camp' | 'habits' | 'treasury' | 'map' | 'intel' | 'command'
type Update = (fn: (s: State) => State) => void

export default function App() {
  const [state, setState] = useStore()
  const [tab, setTab] = useState<Tab>('camp')
  const [theme, setTheme] = useState<'clear' | 'cyber' | 'tactics'>(() => {
    try {
      const saved = localStorage.getItem('tl-theme3')
      return saved === 'cyber' || saved === 'clear' ? saved : 'tactics'
    } catch {
      return 'tactics'
    }
  })
  setPlain(theme !== 'cyber') // the Clear design uses plain names for everything
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const color = theme === 'cyber' ? '#07060f' : theme === 'tactics' ? '#14182b' : dark ? '#0d1015' : '#f3f5f9'
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', color)
    try {
      localStorage.setItem('tl-theme3', theme)
    } catch {
      /* ignore */
    }
  }, [theme])
  const update: Update = (fn) => setState(fn)
  // repeating money: post whatever has come due, on open, when you come back to the app, and hourly
  useEffect(() => {
    const run = () => setState((s) => postRecurring(s))
    run()
    const onVisible = () => document.visibilityState === 'visible' && run()
    document.addEventListener('visibilitychange', onVisible)
    const id = setInterval(run, 3_600_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(id)
    }
  }, [setState])
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
          <div className="sub">{isPlain() ? `Level ${level}` : `Commander · Lv ${level}`}</div>
        </div>
        <div className="hdr-right">
          <button className="themebtn" onClick={() => setTheme(theme === 'tactics' ? 'clear' : theme === 'clear' ? 'cyber' : 'tactics')} aria-label={`Design: ${theme}. Tap to change`} title="Change the look: Clear, Neon, Tactics">
            {theme === 'clear' ? '◐ Clear' : theme === 'cyber' ? '◐ Neon' : '◐ Tactics'}
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
        {tab === 'camp' && <Camp state={state} update={update} debrief={debriefDue ? () => go('intel') : null} openTodo={() => go('command')} goTo={go} />}
        {tab === 'habits' && <Habits state={state} update={update} />}
        {tab === 'treasury' && <Treasury state={state} update={update} />}
        {tab === 'map' && <WorldMap state={state} update={update} theme={theme} />}
        {tab === 'intel' && <Insights state={state} alerts={alerts} setAlerts={setAlerts} />}
        {tab === 'command' && <Command state={state} update={update} />}
      </main>

      <nav className="nav">
        <NavBtn id="camp" cur={tab} set={go} label={T('Camp')} icon="🏕️" />
        <NavBtn id="habits" cur={tab} set={go} label={T('Battles')} icon="⚔️" />
        <NavBtn id="treasury" cur={tab} set={go} label={T('Treasury')} icon="💰" />
        <NavBtn id="map" cur={tab} set={go} label={T('Map')} icon="🗺️" />
        <NavBtn id="intel" cur={tab} set={go} label={T('Intel')} icon="🔭" />
        <NavBtn id="command" cur={tab} set={go} label={T('Command')} icon="🎙️" />
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
          {T(p.title)}
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

function Camp({ state, update, debrief, openTodo, goTo }: { state: State; update: Update; debrief: (() => void) | null; openTodo: () => void; goTo: (t: Tab) => void }) {
  const fresh = state.habits.length === 0 && state.txs.length === 0 && state.goals.length === 0 && state.events.length === 0
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
          <p style={{ margin: 0 }}>Your weekly {isPlain() ? 'review' : 'debrief'} is ready. {reviewSummary(rv)}</p>
          <button className="btn" style={{ marginTop: 10 }} onClick={debrief}>
            {isPlain() ? 'Open review' : 'Open debrief'}
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

      {fresh && (
        <Panel title="Start Here">
          <p style={{ marginTop: 0 }}>Welcome, Commander. Three quick ways to begin:</p>
          <div className="stack">
            <button className="btn" onClick={() => goTo('habits')}>
              1 · Recruit a habit
            </button>
            <button className="btn" onClick={() => goTo('treasury')}>
              2 · Log your first spend
            </button>
            <button className="btn" onClick={() => goTo('command')}>
              3 · Say or type a command
            </button>
          </div>
          <p className="muted">Tip: in Command you can type things like "gym at 6pm, lunch 80k" or "goal 2 muay thai a week".</p>
        </Panel>
      )}

      <ArchetypePanel state={state} compact onOpen={() => goTo('map')} />

      <Todo state={state} update={update} compact onOpen={openTodo} />

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
  const [editing, setEditing] = useState<Habit | null>(null)
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
          <MicInput value={name} onChange={setName} placeholder="e.g. Study IELTS 1h" />
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
            <span className="row" style={{ flex: 'none', gap: 0 }}>
            <button className="x" aria-label={`Edit ${h.name}`} onClick={() => setEditing(h)}>
              ✎
            </button>
            <button
              className="x"
              aria-label={`Delete ${h.name}`}
              onClick={() => confirm(`Disband "${h.name}"?`) && update((s) => ({ ...s, habits: s.habits.filter((x) => x.id !== h.id) }))}
            >
              ✕
            </button>
            </span>
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
      {editing && (
        <HabitEditor
          habit={editing}
          close={() => setEditing(null)}
          onSave={(h) => {
            if (h.job !== editing.job) silence.on = true // moving a habit to another class is not a level-up
            update((s) => ({ ...s, habits: s.habits.map((x) => (x.id === h.id ? h : x)) }))
            setEditing(null)
          }}
          onDelete={() => {
            if (!confirm(`Disband "${editing.name}"?`)) return
            update((s) => ({ ...s, habits: s.habits.filter((x) => x.id !== editing.id) }))
            setEditing(null)
          }}
        />
      )}
    </>
  )
}
