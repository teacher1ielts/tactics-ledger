import { useRef, useState } from 'react'
import { parseCommand, type Parsed } from './parser'
import { autoScheduleTasks, blocksFor, hhmm, slotHabits } from './scheduler'
import { play } from './sfx'
import { INCOME_CATS, JOBS, SPEND_CATS, dayKey, shiftDay, uid, vnd, type State } from './store'

type Update = (fn: (s: State) => State) => void
type Item = { key: string; p: Parsed }

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
const SR: (new () => Recognizer) | undefined =
  typeof window === 'undefined' ? undefined : (window as unknown as Record<string, new () => Recognizer>).SpeechRecognition ?? (window as unknown as Record<string, new () => Recognizer>).webkitSpeechRecognition

const ERR: Record<string, string> = {
  'not-allowed': 'Microphone permission was denied. Allow it in the browser, or type the command.',
  'service-not-allowed': 'Speech service is blocked in this browser. Type the command instead.',
  'no-speech': "I didn't hear anything. Tap the mic and try again.",
  network: 'Speech recognition needs an internet connection in this browser.',
  'audio-capture': 'No microphone found.',
}

const EXAMPLES = ['gym at 6pm tomorrow, spent 80k on lunch, finish essay 2 hours', 'mai họp lúc 14h, ăn trưa 50k, nhận lương 15tr', 'add habit meditate every day at 6:30am', 'goal 2 muay thai a week, save 50tr in 6 months, finish reading by friday']

function dayLabel(date: string) {
  const t = dayKey()
  if (date === t) return 'Today'
  if (date === shiftDay(t, 1)) return 'Tomorrow'
  if (date === shiftDay(t, -1)) return 'Yesterday'
  return new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function Command({ state, update }: { state: State; update: Update }) {
  const [text, setText] = useState('')
  const [lang, setLang] = useState<'vi-VN' | 'en-US'>('vi-VN')
  const [listening, setListening] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [note, setNote] = useState('')
  const [view, setView] = useState(dayKey())
  const rec = useRef<Recognizer | null>(null)
  const heard = useRef('')

  const parse = (t: string) => {
    if (!t.trim()) return
    setItems(parseCommand(t, new Date(), state.habits).map((p) => ({ key: uid(), p })))
    setNote('')
  }

  const listen = () => {
    if (!SR) return setNote('This browser has no speech recognition. Chrome or Edge work; otherwise type below.')
    if (listening) return rec.current?.stop()
    const r = new SR()
    r.lang = lang
    r.interimResults = true
    r.continuous = false
    heard.current = ''
    r.onresult = (e) => {
      const t = Array.from(e.results as ArrayLike<ArrayLike<{ transcript: string }>>).map((x) => x[0].transcript).join(' ')
      heard.current = t
      setText(t)
    }
    r.onerror = (e) => setNote(ERR[e.error] ?? `Speech error: ${e.error}`)
    r.onend = () => {
      setListening(false)
      if (heard.current.trim()) parse(heard.current)
    }
    rec.current = r
    setNote('')
    setListening(true)
    play('listen')
    r.start()
  }

  const setP = (key: string, fn: (p: Parsed) => Parsed) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, p: fn(x.p) } : x)))

  const confirm = () => {
    const ok = items.map((i) => i.p).filter((p) => p.kind !== 'unknown')
    update((s) => {
      let n = s
      for (const p of ok) {
        if (p.kind === 'tx') n = { ...n, txs: [{ id: uid(), date: dayKey(), type: p.type, amount: p.amount, category: p.category, note: p.note }, ...n.txs] }
        else if (p.kind === 'event') n = { ...n, events: [...n.events, { id: uid(), title: p.title, kind: 'event', dur: p.dur, date: p.date, start: p.start }] }
        else if (p.kind === 'task') n = { ...n, events: [...n.events, { id: uid(), title: p.title, kind: 'task', dur: p.dur, deadline: p.deadline }] }
        else if (p.kind === 'habit-new') n = { ...n, habits: [...n.habits, { id: uid(), name: p.name, job: p.job, done: [], time: p.time, dur: p.dur }] }
        else if (p.kind === 'goal-new') {
          let habitId = p.habitId
          if (p.gkind === 'habit' && !habitId) {
            habitId = n.habits.find((h) => h.name.toLowerCase() === (p.habitName ?? '').toLowerCase())?.id ?? uid()
            if (!n.habits.some((h) => h.id === habitId)) n = { ...n, habits: [...n.habits, { id: habitId, name: p.habitName ?? p.name, job: p.job ?? 'Scholar', done: [] }] }
          }
          n = {
            ...n,
            goals: [
              ...n.goals,
              {
                id: uid(),
                name: p.name,
                term: p.term,
                kind: p.gkind,
                start: dayKey(),
                deadline: p.deadline,
                target: p.target,
                habitId: p.gkind === 'habit' ? habitId : undefined,
                period: p.period,
                deposits: [],
                milestones: p.gkind === 'manual' ? [{ id: uid(), text: p.name, done: false }] : [],
              },
            ],
          }
        } else if (p.kind === 'habit-done')
          n = { ...n, habits: n.habits.map((h) => (h.id === p.habitId && !h.done.includes(p.date) ? { ...h, done: [...h.done, p.date] } : h)) }
      }
      return n
    })
    setNote(`Saved ${ok.length} item${ok.length === 1 ? '' : 's'}.`)
    setItems([])
    setText('')
  }

  const unscheduled = state.events.filter((e) => e.kind === 'task' && e.start === undefined && !e.done)
  const blocks = blocksFor(state, view)
  const noTimeHabits = state.habits.filter((h) => h.time === undefined)

  const runAuto = () => {
    const r = autoScheduleTasks(state, new Date())
    update((s) => ({ ...s, events: r.events }))
    setNote([...r.placed.map((p) => `${p.title}: ${dayLabel(p.date)} ${hhmm(p.start)}`), ...r.failed.map((f) => `No room found for "${f}"`)].join(' · '))
  }
  const runHabits = () => {
    const r = slotHabits(state, new Date())
    update((s) => ({ ...s, habits: r.habits }))
    setNote(r.placed.map((p) => `${p.name}: daily ${hhmm(p.time)}`).join(' · ') || 'No free slot found.')
  }

  const toggleHabitDay = (id: string) =>
    update((s) => ({ ...s, habits: s.habits.map((h) => (h.id !== id ? h : { ...h, done: h.done.includes(view) ? h.done.filter((d) => d !== view) : [...h.done, view] })) }))

  return (
    <>
      <section className="panel">
        <h2>
          Command
          <span className="seg inline">
            {(['vi-VN', 'en-US'] as const).map((l) => (
              <button key={l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)} disabled={listening}>
                {l === 'vi-VN' ? 'VI' : 'EN'}
              </button>
            ))}
          </span>
        </h2>
        <div className="row">
          <button className={`mic ${listening ? 'live' : ''}`} onClick={listen} aria-label={listening ? 'Stop listening' : 'Start voice command'}>
            🎙️
          </button>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && parse(text)}
            placeholder={listening ? 'Listening…' : 'Say or type: gym 6pm, lunch 80k…'}
          />
          <button className="btn" onClick={() => parse(text)} disabled={!text.trim()}>
            Go
          </button>
        </div>
        <div className="chips">
          {EXAMPLES.map((e) => (
            <button key={e} className="chip" onClick={() => { setText(e); parse(e) }}>
              {e.length > 34 ? e.slice(0, 33) + '…' : e}
            </button>
          ))}
        </div>
        {note && <p className="muted">{note}</p>}
      </section>

      {items.length > 0 && (
        <section className="panel">
          <h2>Confirm Orders</h2>
          <ul className="list">
            {items.map(({ key, p }) => (
              <li key={key} className="cmd">
                <div className="grow">
                  <Card p={p} state={state} onCat={(c) => setP(key, (x) => (x.kind === 'tx' ? { ...x, category: c } : x))} onName={(name) => setP(key, (x) => (x.kind === 'goal-new' ? { ...x, name } : x))} />
                </div>
                <button className="x" aria-label="Remove" onClick={() => setItems((xs) => xs.filter((x) => x.key !== key))}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <div className="row">
            <button className="btn" onClick={confirm} disabled={items.every((i) => i.p.kind === 'unknown')}>
              Confirm
            </button>
            <button className="btn danger" style={{ marginTop: 0 }} onClick={() => setItems([])}>
              Cancel
            </button>
          </div>
        </section>
      )}

      <section className="panel">
        <h2>
          Turn Order
          <span className="seg inline">
            <button onClick={() => setView(shiftDay(view, -1))} aria-label="Previous day">◀</button>
            <button className={view === dayKey() ? 'on' : ''} onClick={() => setView(dayKey())}>
              {dayLabel(view)}
            </button>
            <button onClick={() => setView(shiftDay(view, 1))} aria-label="Next day">▶</button>
          </span>
        </h2>
        {blocks.length === 0 && <p className="muted">Nothing planned for this day.</p>}
        <ul className="list">
          {blocks.map((b) => (
            <li key={b.id} className={b.done ? 'done' : ''}>
              <span className="time">
                {hhmm(b.start)}
                <small>{hhmm(b.end)}</small>
              </span>
              <span className="grow">
                {b.kind === 'habit' ? '⚔️' : b.kind === 'task' ? '📝' : '📅'} {b.title}
                {b.clash && <b className="neg"> ⚠ overlaps</b>}
              </span>
              {b.kind === 'habit' ? (
                <button className="check" onClick={() => toggleHabitDay(b.ref)} aria-label={`Toggle ${b.title}`}>
                  {b.done ? '◆' : '◇'}
                </button>
              ) : (
                <>
                  <button className="check" onClick={() => update((s) => ({ ...s, events: s.events.map((e) => (e.id === b.ref ? { ...e, done: !e.done } : e)) }))} aria-label={`Toggle ${b.title}`}>
                    {b.done ? '◆' : '◇'}
                  </button>
                  <button className="x" aria-label="Delete" onClick={() => update((s) => ({ ...s, events: s.events.filter((e) => e.id !== b.ref) }))}>
                    ✕
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      {(unscheduled.length > 0 || noTimeHabits.length > 0) && (
        <section className="panel">
          <h2>Auto-Organise</h2>
          {unscheduled.length > 0 && (
            <>
              <ul className="list">
                {unscheduled.map((t) => (
                  <li key={t.id}>
                    <span className="grow">
                      📝 {t.title}
                      <small className="muted"> · {t.dur} min{t.deadline ? ` · due ${dayLabel(t.deadline)}` : ''}</small>
                    </span>
                    <button className="x" aria-label="Delete" onClick={() => update((s) => ({ ...s, events: s.events.filter((e) => e.id !== t.id) }))}>
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
              <button className="btn" onClick={runAuto}>
                Auto-schedule {unscheduled.length} task{unscheduled.length === 1 ? '' : 's'}
              </button>
            </>
          )}
          {noTimeHabits.length > 0 && (
            <>
              <p className="muted">{noTimeHabits.length} habit(s) have no daily time: {noTimeHabits.map((h) => h.name).join(', ')}.</p>
              <button className="btn" onClick={runHabits}>
                Slot my habits
              </button>
            </>
          )}
        </section>
      )}
    </>
  )
}

function Card({ p, state, onCat, onName }: { p: Parsed; state: State; onCat: (c: string) => void; onName: (n: string) => void }) {
  if (p.kind === 'goal-new') {
    const what =
      p.gkind === 'savings'
        ? `save ${vnd(p.target)}`
        : p.gkind === 'habit'
          ? p.period
            ? `${p.target} clear${p.target === 1 ? '' : 's'} a week, resets Monday`
            : `${p.target} clears in total`
          : 'checklist'
    return (
      <>
        🎯 <input className="name-in" value={p.name} onChange={(e) => onName(e.target.value)} aria-label="Goal name" />
        <small className="muted">
          {' '}
          {p.term === 'long' ? 'Long-term 🏰' : 'Short-term ⚑'} · {what}
          {p.deadline ? ` · by ${dayLabel(p.deadline)}` : ''}
          {p.gkind === 'habit' && !p.habitId ? ` · adds habit "${p.habitName}"` : p.gkind === 'habit' ? ` · tracks "${p.habitName}"` : ''}
        </small>
      </>
    )
  }
  if (p.kind === 'tx')
    return (
      <>
        <b className={p.type === 'income' ? 'pos' : 'neg'}>
          {p.type === 'income' ? '＋' : '−'} {vnd(p.amount)}
        </b>{' '}
        <select className="mini" value={p.category} onChange={(e) => onCat(e.target.value)}>
          {(p.type === 'income' ? INCOME_CATS : SPEND_CATS).map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        {p.note && <small className="muted"> · {p.note}</small>}
      </>
    )
  if (p.kind === 'event') {
    const clash = blocksFor(state, p.date).some((b) => p.start < b.end && p.start + p.dur > b.start)
    return (
      <>
        📅 <b>{p.title}</b>
        <small className="muted">
          {' '}
          · {dayLabel(p.date)} {hhmm(p.start)}–{hhmm(p.start + p.dur)}
        </small>
        {clash && <b className="neg"> ⚠ overlaps</b>}
      </>
    )
  }
  if (p.kind === 'task')
    return (
      <>
        📝 <b>{p.title}</b>
        <small className="muted">
          {' '}
          · {p.dur} min · will be auto-placed{p.deadline ? ` before ${dayLabel(p.deadline)}` : ''}
        </small>
      </>
    )
  if (p.kind === 'habit-new')
    return (
      <>
        {JOBS[p.job]} New habit <b>{p.name}</b>
        <small className="muted"> · {p.job}{p.time !== undefined ? ` · daily ${hhmm(p.time)}` : ''}</small>
      </>
    )
  if (p.kind === 'habit-done')
    return (
      <>
        ◆ Clear <b>{p.name}</b>
        <small className="muted"> · {dayLabel(p.date)}</small>
      </>
    )
  return <span className="muted">❓ Couldn't read: “{p.text}”</span>
}
