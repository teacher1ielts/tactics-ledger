import { useState, type ReactNode } from 'react'
import { RecurringEditor, TxEditor } from './Edit'
import ImportPanel from './ImportPanel'
import { INCOME_CATS, SPEND_CATS, dayKey, parseVnd, postRecurring, repeatLabel, uid, vnd, type Recurring, type State, type Tx, type TxType } from './store'

type Update = (fn: (s: State) => State) => void

function Panel(p: { title?: string; children: ReactNode; right?: ReactNode }) {
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

const newestFirst = (a: Tx, b: Tx) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0)
const shiftMonth = (m: string, n: number) => {
  const d = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const monthLabel = (m: string) => new Date(m + '-01T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
const shortDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export default function Treasury({ state, update }: { state: State; update: Update }) {
  const today = dayKey()
  const thisMonth = today.slice(0, 7)

  // record form
  const [type, setType] = useState<TxType>('spend')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(SPEND_CATS[0])
  const [note, setNote] = useState('')
  const [date, setDate] = useState(today)
  const [every, setEvery] = useState<'' | Recurring['every']>('')
  const [err, setErr] = useState('')

  // history view
  const [month, setMonth] = useState(thisMonth)
  const [kind, setKind] = useState<'all' | TxType>('all')
  const [q, setQ] = useState('')

  // edit sheets
  const [editTx, setEditTx] = useState<Tx | null>(null)
  const [editRule, setEditRule] = useState<Recurring | null>(null)

  const cats = type === 'spend' ? SPEND_CATS : INCOME_CATS
  const earliest = state.txs.reduce((m, t) => (t.date.slice(0, 7) < m ? t.date.slice(0, 7) : m), thisMonth)

  const monthTxs = state.txs.filter((t) => t.date.startsWith(month))
  const income = monthTxs.filter((t) => t.type === 'income').reduce((a, t) => a + t.amount, 0)
  const spent = monthTxs.filter((t) => t.type === 'spend').reduce((a, t) => a + t.amount, 0)
  const byCat = new Map<string, number>()
  monthTxs.filter((t) => t.type === 'spend').forEach((t) => byCat.set(t.category, (byCat.get(t.category) ?? 0) + t.amount))
  const max = Math.max(1, ...byCat.values())
  const pct = state.budget ? Math.min(100, (spent / state.budget) * 100) : 0

  const needle = q.trim().toLowerCase()
  const shown = monthTxs
    .filter((t) => kind === 'all' || t.type === kind)
    .filter((t) => !needle || `${t.category} ${t.note}`.toLowerCase().includes(needle))
    .sort(newestFirst)

  const switchType = (t: TxType) => {
    setType(t)
    setCategory((t === 'spend' ? SPEND_CATS : INCOME_CATS)[0])
  }

  const add = () => {
    const v = parseVnd(amount)
    if (!Number.isFinite(v) || v <= 0) return setErr('Enter an amount like 50k, 1.5tr or 120000')
    if (!date) return setErr('Pick a date')
    setErr('')
    if (every) {
      const rule: Recurring = { id: uid(), type, amount: v, category, note: note.trim(), every, dom: every === 'month' ? Number(date.slice(8)) : undefined, next: date }
      update((s) => postRecurring({ ...s, recurring: [...s.recurring, rule] })) // posts the first one now if it is already due
    } else {
      update((s) => ({ ...s, txs: [{ id: uid(), date, type, amount: v, category, note: note.trim() }, ...s.txs].sort(newestFirst) }))
      setMonth(date.slice(0, 7)) // show where it landed
    }
    setAmount('')
    setNote('')
    setEvery('')
    setDate(today)
  }

  return (
    <>
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
          <div className="row">
            <input type="date" value={date} max={every ? undefined : today} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
            <select value={every} onChange={(e) => setEvery(e.target.value as '' | Recurring['every'])} aria-label="Repeats">
              <option value="">Just once</option>
              <option value="month">Every month</option>
              <option value="week">Every week</option>
              <option value="day">Every day</option>
            </select>
          </div>
          {every && <p className="muted" style={{ margin: 0 }}>Posts automatically from {shortDate(date)}: {repeatLabel({ every, dom: Number(date.slice(8)) })}.</p>}
          {err && <p className="neg">{err}</p>}
          <button className="btn" type="submit">
            {every ? 'Set up repeating' : 'Record'}
          </button>
        </form>
      </Panel>

      <Panel title="Repeating">
        {state.recurring.length === 0 && <p className="muted" style={{ margin: 0 }}>Nothing repeats yet. Choose "Every month" above for salary, rent or subscriptions, or say "salary 15tr every month on the 1st".</p>}
        <ul className="list">
          {[...state.recurring]
            .sort((a, b) => a.next.localeCompare(b.next))
            .map((r) => (
              <li key={r.id}>
                <span className="grow">
                  {r.category}
                  {r.note && <small className="muted"> · {r.note}</small>}
                  <small className="muted">
                    {' '}
                    · ↻ {repeatLabel({ every: r.every, dom: r.dom })} · next {shortDate(r.next)}
                  </small>
                </span>
                <b className={r.type === 'income' ? 'pos' : 'neg'}>
                  {r.type === 'income' ? '+' : '−'}
                  {vnd(r.amount)}
                </b>
                <button className="x" aria-label={`Edit ${r.category}`} onClick={() => setEditRule(r)}>
                  ✎
                </button>
              </li>
            ))}
        </ul>
      </Panel>

      <Panel
        title="Month"
        right={
          <span className="seg inline">
            <button onClick={() => setMonth(shiftMonth(month, -1))} disabled={month <= earliest} aria-label="Previous month">
              ◀
            </button>
            <button className={month === thisMonth ? 'on' : ''} onClick={() => setMonth(thisMonth)} title="Jump to this month">
              {monthLabel(month)}
            </button>
            <button onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= thisMonth} aria-label="Next month">
              ▶
            </button>
          </span>
        }
      >
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
            <small>Net</small>
            <b className={income - spent < 0 ? 'neg' : 'pos'}>{vnd(income - spent)}</b>
          </div>
        </div>
        {state.budget > 0 && (
          <>
            <div className="bar">
              <div className={`bar-fill ${pct > 90 ? 'hot' : ''}`} style={{ width: `${pct}%` }} />
            </div>
            <p className="muted">
              {vnd(spent)} of your {vnd(state.budget)} budget
            </p>
          </>
        )}
        {byCat.size > 0 &&
          [...byCat.entries()]
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
      </Panel>

      <ImportPanel state={state} update={update} />

      <Panel title={`Ledger · ${monthLabel(month)}`}>
        <div className="seg" style={{ marginBottom: 8 }}>
          {(['all', 'income', 'spend'] as const).map((k) => (
            <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
              {k}
            </button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search category or note…" aria-label="Search" />
        {monthTxs.length === 0 && <p className="muted">Nothing recorded in {monthLabel(month)}.</p>}
        {monthTxs.length > 0 && shown.length === 0 && <p className="muted">No entries match.</p>}
        <ul className="list">
          {shown.map((t) => (
            <li key={t.id}>
              <span className="grow">
                {t.category}
                <small className="muted">
                  {' '}
                  · {shortDate(t.date)}
                  {t.rid ? ' · ↻' : ''}
                  {t.note && ` · ${t.note}`}
                </small>
              </span>
              <b className={t.type === 'income' ? 'pos' : 'neg'}>
                {t.type === 'income' ? '+' : '−'}
                {vnd(t.amount)}
              </b>
              <button className="x" aria-label={`Edit ${t.category} ${vnd(t.amount)}`} onClick={() => setEditTx(t)}>
                ✎
              </button>
            </li>
          ))}
        </ul>
        {shown.length > 0 && (
          <p className="muted" style={{ marginBottom: 0 }}>
            {shown.length} entr{shown.length === 1 ? 'y' : 'ies'}
          </p>
        )}
      </Panel>

      {editTx && (
        <TxEditor
          tx={editTx}
          close={() => setEditTx(null)}
          onSave={(t) => {
            update((s) => ({ ...s, txs: s.txs.map((x) => (x.id === t.id ? t : x)).sort(newestFirst) }))
            setEditTx(null)
          }}
          onDelete={() => {
            update((s) => ({ ...s, txs: s.txs.filter((x) => x.id !== editTx.id) }))
            setEditTx(null)
          }}
        />
      )}
      {editRule && (
        <RecurringEditor
          rule={editRule}
          close={() => setEditRule(null)}
          onSave={(r) => {
            update((s) => postRecurring({ ...s, recurring: s.recurring.map((x) => (x.id === r.id ? r : x)) }))
            setEditRule(null)
          }}
          onDelete={() => {
            update((s) => ({ ...s, recurring: s.recurring.filter((x) => x.id !== editRule.id) }))
            setEditRule(null)
          }}
        />
      )}
    </>
  )
}
