import { useState } from 'react'
import MicInput from './MicInput'
import { T } from './labels'
import { TaskEditor } from './Edit'
import { parseCommand } from './parser'
import { hhmm } from './scheduler'
import { dayKey, repeatLabel, shiftDay, toggleTask, uid, type PlanItem, type State } from './store'

type Update = (fn: (s: State) => State) => void

function dayLabel(date: string) {
  const t = dayKey()
  if (date === t) return 'today'
  if (date === shiftDay(t, 1)) return 'tomorrow'
  if (date === shiftDay(t, -1)) return 'yesterday'
  return new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

const dueOf = (e: PlanItem) => e.deadline ?? e.date ?? '9999-12-31'

/** Open tasks, most urgent first (overdue sorts to the top naturally). */
export function openTasks(s: State) {
  return s.events.filter((e) => e.kind === 'task' && !e.done).sort((a, b) => dueOf(a).localeCompare(dueOf(b)))
}

export default function Todo({ state, update, compact = false, onOpen }: { state: State; update: Update; compact?: boolean; onOpen?: () => void }) {
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<PlanItem | null>(null)
  const today = dayKey()
  const open = openTasks(state)
  const done = state.events
    .filter((e) => e.kind === 'task' && e.done)
    .sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''))
  const shown = compact ? open.slice(0, 5) : open

  const toggle = (id: string) => update((s) => toggleTask(s, id))

  const add = () => {
    const t = text.trim()
    if (!t) return
    // "call mom by friday" or "pay rent tomorrow 9am" keep their deadline or time
    const p = parseCommand(t, new Date(), state.habits)[0]
    let item: PlanItem
    if (p?.kind === 'task') item = { id: uid(), title: p.title, kind: 'task', dur: p.dur, deadline: p.deadline, date: p.date, start: p.start, repeat: p.repeat }
    else if (p?.kind === 'event') item = { id: uid(), title: p.title, kind: 'task', dur: p.dur, date: p.date, start: p.start }
    else item = { id: uid(), title: t[0].toUpperCase() + t.slice(1), kind: 'task', dur: 30 }
    update((s) => ({ ...s, events: [...s.events, item] }))
    setText('')
  }

  return (
    <section className="panel">
      <h2>
        {T('To-Do')}
        <span className="chip">{open.length} open</span>
      </h2>

      {shown.length === 0 && <p className="muted" style={{ marginTop: 0 }}>Nothing to do. Add one below, or say it in the Command tab.</p>}
      <ul className="list">
        {shown.map((e) => {
          const late = dueOf(e) < today
          return (
            <li key={e.id}>
              <button className="check" onClick={() => toggle(e.id)} aria-label={`Done: ${e.title}`}>
                ◇
              </button>
              <span className="grow">
                {e.title}
                <small className={late ? 'neg' : 'muted'}>
                  {e.deadline ? ` · due ${dayLabel(e.deadline)}${late ? ' (overdue)' : ''}` : ''}
                  {e.date && e.start !== undefined ? ` · ${dayLabel(e.date)} ${hhmm(e.start)}` : ''}
                  {e.repeat ? ` · ↻ ${repeatLabel(e.repeat)}` : ''}
                </small>
              </span>
              {!compact && (
                <>
                <button className="x" aria-label={`Edit ${e.title}`} onClick={() => setEditing(e)}>
                  ✎
                </button>
                <button className="x" aria-label={`Delete ${e.title}`} onClick={() => update((s) => ({ ...s, events: s.events.filter((x) => x.id !== e.id) }))}>
                  ✕
                </button>
                </>
              )}
            </li>
          )
        })}
      </ul>
      {compact && open.length > shown.length && (
        <p className="muted" style={{ margin: '6px 0 0' }}>
          + {open.length - shown.length} more
        </p>
      )}

      <form
        className="row"
        style={{ marginTop: 10 }}
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <MicInput value={text} onChange={setText} placeholder="Add a task…" />
        <button className="btn small" type="submit" disabled={!text.trim()}>
          Add
        </button>
      </form>

      {compact && onOpen && (
        <button className="btn small" style={{ marginTop: 10 }} onClick={onOpen}>
          Open full list
        </button>
      )}

      {!compact && done.length > 0 && (
        <details className="paste">
          <summary>Done ({done.length})</summary>
          <ul className="list">
            {done.slice(0, 30).map((e) => (
              <li key={e.id} className="done">
                <button className="check" onClick={() => toggle(e.id)} aria-label={`Undo: ${e.title}`} title="Undo">
                  ◆
                </button>
                <span className="grow">
                  {e.title}
                  {e.doneAt && <small className="muted"> · {dayLabel(e.doneAt)}</small>}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {editing && (
        <TaskEditor
          task={editing}
          close={() => setEditing(null)}
          onSave={(t) => {
            update((s) => ({ ...s, events: s.events.map((x) => (x.id === t.id ? t : x)) }))
            setEditing(null)
          }}
          onDelete={() => {
            update((s) => ({ ...s, events: s.events.filter((x) => x.id !== editing.id) }))
            setEditing(null)
          }}
        />
      )}
    </section>
  )
}
