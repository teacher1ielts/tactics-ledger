import { useState, type ReactNode } from 'react'
import { INCOME_CATS, JOBS, SPEND_CATS, dayKey, parseVnd, vnd, type Goal, type Habit, type Job, type PlanItem, type Recurring, type Repeat, type Tx, type TxType } from './store'

function Sheet({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  return (
    <div className="modal" onClick={close} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <section className="panel" style={{ margin: 0 }}>
          <h2>
            {title}
            <button className="x" onClick={close} aria-label="Close">
              ✕
            </button>
          </h2>
          {children}
        </section>
      </div>
    </div>
  )
}

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="field">
    <span className="muted">{label}</span>
    {children}
  </label>
)

function Actions({ onDelete, deleteText = 'Delete', err }: { onDelete?: () => void; deleteText?: string; err?: string }) {
  return (
    <>
      {err && <p className="neg" style={{ margin: 0 }}>{err}</p>}
      <div className="row">
        <button className="btn" type="submit">
          Save
        </button>
        {onDelete && (
          <button className="btn danger" type="button" style={{ marginTop: 0 }} onClick={onDelete}>
            {deleteText}
          </button>
        )}
      </div>
    </>
  )
}

const minutes = (v: string, fallback: number) => {
  const n = parseInt(v, 10)
  return Number.isFinite(n) && n >= 5 && n <= 600 ? n : fallback
}

/* ---------- money ---------- */
export function TxEditor({ tx, onSave, onDelete, close }: { tx: Tx; onSave: (t: Tx) => void; onDelete: () => void; close: () => void }) {
  const [type, setType] = useState<TxType>(tx.type)
  const [amount, setAmount] = useState(String(tx.amount))
  const [category, setCategory] = useState(tx.category)
  const [date, setDate] = useState(tx.date)
  const [note, setNote] = useState(tx.note)
  const [err, setErr] = useState('')
  const cats = type === 'spend' ? SPEND_CATS : INCOME_CATS

  return (
    <Sheet title="Edit transaction" close={close}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          const v = parseVnd(amount)
          if (!Number.isFinite(v) || v <= 0) return setErr('Enter an amount like 50k, 1.5tr or 120000.')
          if (!date) return setErr('Pick a date.')
          onSave({ ...tx, type, amount: v, category: cats.includes(category) ? category : cats[0], date, note: note.trim() })
        }}
      >
        <div className="seg">
          {(['spend', 'income'] as TxType[]).map((t) => (
            <button key={t} type="button" className={type === t ? 'on' : ''} onClick={() => { setType(t); setCategory((t === 'spend' ? SPEND_CATS : INCOME_CATS)[0]) }}>
              {t === 'spend' ? 'Spend' : 'Income'}
            </button>
          ))}
        </div>
        <Field label="Amount (VND)">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="Category">
          <select value={cats.includes(category) ? category : cats[0]} onChange={(e) => setCategory(e.target.value)}>
            {cats.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Note">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        </Field>
        <Actions err={err} onDelete={onDelete} />
      </form>
    </Sheet>
  )
}

export function RecurringEditor({ rule, onSave, onDelete, close }: { rule: Recurring; onSave: (r: Recurring) => void; onDelete: () => void; close: () => void }) {
  const [type, setType] = useState<TxType>(rule.type)
  const [amount, setAmount] = useState(String(rule.amount))
  const [category, setCategory] = useState(rule.category)
  const [note, setNote] = useState(rule.note)
  const [every, setEvery] = useState<Recurring['every']>(rule.every)
  const [next, setNext] = useState(rule.next)
  const [err, setErr] = useState('')
  const cats = type === 'spend' ? SPEND_CATS : INCOME_CATS

  return (
    <Sheet title="Edit repeating entry" close={close}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          const v = parseVnd(amount)
          if (!Number.isFinite(v) || v <= 0) return setErr('Enter an amount like 15tr or 5000000.')
          if (!next) return setErr('Pick the next date.')
          onSave({ ...rule, type, amount: v, category: cats.includes(category) ? category : cats[0], note: note.trim(), every, dom: every === 'month' ? Number(next.slice(8)) : undefined, next })
        }}
      >
        <div className="seg">
          {(['income', 'spend'] as TxType[]).map((t) => (
            <button key={t} type="button" className={type === t ? 'on' : ''} onClick={() => { setType(t); setCategory((t === 'spend' ? SPEND_CATS : INCOME_CATS)[0]) }}>
              {t === 'spend' ? 'Spend' : 'Income'}
            </button>
          ))}
        </div>
        <Field label="Amount (VND)">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="Category">
          <select value={cats.includes(category) ? category : cats[0]} onChange={(e) => setCategory(e.target.value)}>
            {cats.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Note">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        </Field>
        <Field label="Repeats">
          <select value={every} onChange={(e) => setEvery(e.target.value as Recurring['every'])}>
            <option value="month">Every month</option>
            <option value="week">Every week</option>
            <option value="day">Every day</option>
          </select>
        </Field>
        <Field label="Next posting date">
          <input type="date" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <p className="muted" style={{ margin: 0 }}>
          Changes apply to future postings. Past entries stay as they are.
        </p>
        <Actions err={err} onDelete={onDelete} deleteText="Stop repeating" />
      </form>
    </Sheet>
  )
}

/* ---------- habits ---------- */
export function HabitEditor({ habit, onSave, onDelete, close }: { habit: Habit; onSave: (h: Habit) => void; onDelete: () => void; close: () => void }) {
  const hhmm = (m?: number) => (m === undefined ? '' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
  const [name, setName] = useState(habit.name)
  const [job, setJob] = useState<Job>(habit.job)
  const [time, setTime] = useState(hhmm(habit.time))
  const [dur, setDur] = useState(String(habit.dur ?? 30))
  const [err, setErr] = useState('')

  return (
    <Sheet title="Edit habit" close={close}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return setErr('Give the habit a name.')
          const [h, m] = time.split(':').map(Number)
          onSave({ ...habit, name: name.trim(), job, time: time && Number.isFinite(h) ? h * 60 + m : undefined, dur: time ? minutes(dur, 30) : habit.dur })
        }}
      >
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Class">
          <select value={job} onChange={(e) => setJob(e.target.value as Job)}>
            {(Object.keys(JOBS) as Job[]).map((j) => (
              <option key={j} value={j}>
                {JOBS[j]} {j}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Daily time (leave empty for none)">
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        {time && (
          <Field label="Length (minutes)">
            <input value={dur} onChange={(e) => setDur(e.target.value)} inputMode="numeric" />
          </Field>
        )}
        <p className="muted" style={{ margin: 0 }}>
          Your streak and past clears are kept. Changing the class moves its levels to the new hero.
        </p>
        <Actions err={err} onDelete={onDelete} deleteText="Disband" />
      </form>
    </Sheet>
  )
}

/* ---------- tasks ---------- */
export function TaskEditor({ task, onSave, onDelete, close }: { task: PlanItem; onSave: (t: PlanItem) => void; onDelete: () => void; close: () => void }) {
  const [title, setTitle] = useState(task.title)
  const [due, setDue] = useState(task.deadline ?? '')
  const [every, setEvery] = useState<'' | Repeat['every']>(task.repeat?.every ?? '')
  const [dur, setDur] = useState(String(task.dur))
  const [err, setErr] = useState('')

  return (
    <Sheet title="Edit task" close={close}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          if (!title.trim()) return setErr('Give the task a name.')
          const repeat: Repeat | undefined = every ? { every, ...(every === 'month' ? { dom: Number((due || dayKey()).slice(8)) } : {}) } : undefined
          onSave({ ...task, title: title.trim(), deadline: due || undefined, repeat, dur: minutes(dur, task.dur) })
        }}
      >
        <Field label="Task">
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Due date (optional)">
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="Repeats">
          <select value={every} onChange={(e) => setEvery(e.target.value as '' | Repeat['every'])}>
            <option value="">Does not repeat</option>
            <option value="day">Every day</option>
            <option value="week">Every week</option>
            <option value="month">Every month</option>
          </select>
        </Field>
        <Field label="How long (minutes)">
          <input value={dur} onChange={(e) => setDur(e.target.value)} inputMode="numeric" />
        </Field>
        <Actions err={err} onDelete={onDelete} />
      </form>
    </Sheet>
  )
}

/* ---------- goals ---------- */
export function GoalEditor({ goal, onSave, onDelete, close }: { goal: Goal; onSave: (g: Goal) => void; onDelete: () => void; close: () => void }) {
  const [name, setName] = useState(goal.name)
  const [term, setTerm] = useState(goal.term)
  const [deadline, setDeadline] = useState(goal.deadline ?? '')
  const [target, setTarget] = useState(goal.kind === 'savings' ? String(goal.target) : String(goal.target || ''))
  const [weekly, setWeekly] = useState(goal.period === 'week')
  const [err, setErr] = useState('')

  return (
    <Sheet title="Edit quest" close={close}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return setErr('Name your quest.')
          let t = goal.target
          if (goal.kind === 'savings') {
            t = parseVnd(target)
            if (!(t > 0)) return setErr('Enter a savings target like 50tr.')
          } else if (goal.kind === 'habit') {
            t = parseInt(target, 10)
            if (!(t > 0)) return setErr('Enter how many clears you need.')
          }
          onSave({ ...goal, name: name.trim(), term, deadline: deadline || undefined, target: t, period: goal.kind === 'habit' && weekly ? 'week' : undefined })
        }}
      >
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="seg">
          {(['short', 'long'] as const).map((t) => (
            <button key={t} type="button" className={term === t ? 'on' : ''} onClick={() => setTerm(t)}>
              {t === 'short' ? 'Short-term ⚑' : 'Long-term 🏰'}
            </button>
          ))}
        </div>
        {goal.kind !== 'manual' && (
          <Field label={goal.kind === 'savings' ? `Target (now ${vnd(goal.target)})` : weekly ? 'Clears per week' : 'Clears in total'}>
            <input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" />
          </Field>
        )}
        {goal.kind === 'habit' && (
          <label className="row alert-row">
            <input type="checkbox" checked={weekly} onChange={(e) => setWeekly(e.target.checked)} />
            <span>Repeats every week (resets Monday)</span>
          </label>
        )}
        <Field label="Deadline (optional)">
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </Field>
        <Actions err={err} onDelete={onDelete} deleteText="Abandon" />
      </form>
    </Sheet>
  )
}
