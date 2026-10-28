import Debrief from './Debrief'
import type { Alerts } from './alerts'
import { JOBS, dayKey, shiftDay, vnd, type Habit, type State } from './store'

const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const PL = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"]
const wdOf = (k: string) => (new Date(k + 'T12:00:00').getDay() + 6) % 7
const monthOf = (k: string) => k.slice(0, 7)
const daysBetween = (a: string, b: string) => Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000)

function longestStreak(h: Habit): number {
  const days = [...new Set(h.done)].sort()
  let best = 0
  let run = 0
  days.forEach((d, i) => {
    run = i > 0 && daysBetween(days[i - 1], d) === 1 ? run + 1 : 1
    best = Math.max(best, run)
  })
  return best
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

export default function Insights({ state, alerts, setAlerts }: { state: State; alerts: Alerts; setAlerts: (fn: (a: Alerts) => Alerts) => void }) {
  const today = dayKey()
  const spends = state.txs.filter((t) => t.type === 'spend')
  const reports: string[] = []

  /* ---------- spending patterns ---------- */
  const firstTx = spends.map((t) => t.date).sort()[0]
  const winStart = firstTx && firstTx > shiftDay(today, -89) ? firstTx : shiftDay(today, -89)
  const winDays = Math.max(1, daysBetween(winStart, today) + 1)
  const wdSum = Array(7).fill(0) as number[]
  const wdCount = Array(7).fill(0) as number[]
  for (let i = 0; i < winDays; i++) wdCount[wdOf(shiftDay(winStart, i))]++
  spends.filter((t) => t.date >= winStart).forEach((t) => (wdSum[wdOf(t.date)] += t.amount))
  const wdAvg = wdSum.map((s, i) => (wdCount[i] ? s / wdCount[i] : 0))
  const wdMax = Math.max(1, ...wdAvg)
  const peak = wdAvg.indexOf(Math.max(...wdAvg))
  const hasSpend = spends.length >= 5

  const curM = monthOf(today)
  const prevM = monthOf(shiftDay(curM + '-01', -1))
  const catBy = (m: string) => {
    const map = new Map<string, number>()
    spends.filter((t) => monthOf(t.date) === m).forEach((t) => map.set(t.category, (map.get(t.category) ?? 0) + t.amount))
    return map
  }
  const cur = catBy(curM)
  const prev = catBy(prevM)
  const curTotal = [...cur.values()].reduce((a, b) => a + b, 0)
  const prevTotal = [...prev.values()].reduce((a, b) => a + b, 0)
  const cats = [...new Set([...cur.keys(), ...prev.keys()])]
    .map((c) => ({ c, now: cur.get(c) ?? 0, before: prev.get(c) ?? 0 }))
    .sort((a, b) => b.now + b.before - (a.now + a.before))
  const dom = Number(today.slice(8))
  const dim = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate()
  const projected = curTotal > 0 ? (curTotal / dom) * dim : 0
  const income = state.txs.filter((t) => t.type === 'income' && monthOf(t.date) === curM).reduce((a, t) => a + t.amount, 0)

  if (hasSpend) {
    if (wdAvg[peak] > 0) reports.push(`You spend most on ${PL[peak]}, averaging ${vnd(Math.round(wdAvg[peak]))} on those days.`)
    if (prevTotal > 0 && curTotal > 0 && dom >= 7) {
      const pace = projected / prevTotal - 1
      if (Math.abs(pace) >= 0.1) reports.push(`At this pace you'll spend ${vnd(Math.round(projected))} this month, ${Math.abs(Math.round(pace * 100))}% ${pace > 0 ? 'more' : 'less'} than last month.`)
    }
    if (state.budget > 0 && projected > state.budget) reports.push(`Warning: projected spending ${vnd(Math.round(projected))} exceeds your ${vnd(state.budget)} budget.`)
    const grew = cats.filter((x) => x.before > 0 && x.now > x.before * 1.25 && x.now - x.before > 50_000).sort((a, b) => b.now - b.before - (a.now - a.before))[0]
    if (grew) reports.push(`${grew.c} is up ${Math.round((grew.now / grew.before - 1) * 100)}% on last month (${vnd(grew.now)} vs ${vnd(grew.before)}).`)
    if (income > 0 && curTotal > 0) reports.push(`Savings rate this month: ${Math.round(((income - curTotal) / income) * 100)}% of income.`)
  }

  /* ---------- habit patterns ---------- */
  const habitRows = state.habits.map((h) => {
    const first = [...h.done].sort()[0]
    const start = first && first > shiftDay(today, -29) ? first : shiftDay(today, -29)
    const span = daysBetween(start, today) + 1
    const rate = h.done.filter((d) => d >= start && d <= today).length / span
    const last14 = h.done.filter((d) => d > shiftDay(today, -14) && d <= today).length
    const prev14 = h.done.filter((d) => d > shiftDay(today, -28) && d <= shiftDay(today, -14)).length
    const byWd = Array(7).fill(0) as number[]
    h.done.forEach((d) => byWd[wdOf(d)]++)
    const best = h.done.length >= 4 ? byWd.indexOf(Math.max(...byWd)) : -1
    const weak = h.done.length >= 8 ? byWd.indexOf(Math.min(...byWd)) : -1
    return { h, rate, last14, prev14, best, weak, longest: longestStreak(h) }
  })
  habitRows.forEach((r) => {
    if (r.h.done.length < 4) return
    if (r.best >= 0) reports.push(`${r.h.name}: strongest on ${PL[r.best]}${r.weak >= 0 && r.weak !== r.best ? `, weakest on ${PL[r.weak]}` : ''}.`)
    if (r.prev14 >= 4 && r.last14 <= r.prev14 - 3) reports.push(`${r.h.name} is slipping: ${r.last14} clears in the last 14 days vs ${r.prev14} before.`)
    if (r.last14 >= r.prev14 + 3 && r.last14 >= 5) reports.push(`${r.h.name} is gaining momentum: ${r.last14} clears in 14 days, up from ${r.prev14}.`)
  })

  // 8-week heatmap, Monday-aligned
  const monday = shiftDay(today, -wdOf(today))
  const heatStart = shiftDay(monday, -49)
  const cells = Array.from({ length: 56 }, (_, i) => {
    const d = shiftDay(heatStart, i)
    const n = state.habits.filter((h) => h.done.includes(d)).length
    const frac = state.habits.length ? n / state.habits.length : 0
    return { d, n, lvl: d > today ? -1 : n === 0 ? 0 : frac < 0.34 ? 1 : frac < 0.67 ? 2 : frac < 1 ? 3 : 4 }
  })

  // spending on strong vs weak habit days
  const spendByDay = new Map<string, number>()
  spends.forEach((t) => spendByDay.set(t.date, (spendByDay.get(t.date) ?? 0) + t.amount))
  const strong: number[] = []
  const weakDays: number[] = []
  if (state.habits.length > 0 && firstTx) {
    for (let i = 0; i < winDays; i++) {
      const d = shiftDay(winStart, i)
      const frac = state.habits.filter((h) => h.done.includes(d)).length / state.habits.length
      ;(frac >= 0.5 ? strong : weakDays).push(spendByDay.get(d) ?? 0)
    }
  }
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
  const cross = strong.length >= 5 && weakDays.length >= 5 ? { good: avg(strong), bad: avg(weakDays) } : null
  if (cross && Math.abs(cross.good - cross.bad) > Math.max(20_000, 0.15 * Math.max(cross.good, cross.bad)))
    reports.push(`On days you clear most habits you spend ${vnd(Math.round(cross.good))} on average, vs ${vnd(Math.round(cross.bad))} on off days.`)

  return (
    <>
      <Debrief state={state} alerts={alerts} setAlerts={setAlerts} />

      <Panel title="Scouting Report">
        {reports.length === 0 ? (
          <p className="muted">Not enough history yet. Keep logging habits and spending for about a week and patterns will appear here.</p>
        ) : (
          <ul className="list">
            {reports.slice(0, 8).map((r, i) => (
              <li key={i}>
                <span className="grow">◆ {r}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Spending by Weekday">
        {!hasSpend ? (
          <p className="muted">Log at least 5 spends to see your weekday rhythm.</p>
        ) : (
          <div className="wdbars">
            {WD.map((d, i) => (
              <div key={d} className="wdcol">
                <small>{Math.round(wdAvg[i] / 1000)}k</small>
                <div className="wdtrack">
                  <div className={`wdfill ${i === peak ? 'peak' : ''}`} style={{ height: `${(wdAvg[i] / wdMax) * 100}%` }} />
                </div>
                <small>{d}</small>
              </div>
            ))}
          </div>
        )}
        <p className="muted">Average per day, last {winDays} days.</p>
      </Panel>

      <Panel title="This Month vs Last">
        {cats.length === 0 ? (
          <p className="muted">No spending recorded for this or last month.</p>
        ) : (
          <>
            {cats.map(({ c, now, before }) => {
              const delta = before > 0 ? Math.round((now / before - 1) * 100) : null
              return (
                <div key={c} className="cmp">
                  <span>{c}</span>
                  <b>{vnd(now)}</b>
                  <small className={delta === null ? 'muted' : delta > 0 ? 'neg' : 'pos'}>{delta === null ? 'new' : `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)}%`}</small>
                </div>
              )
            })}
            <p className="muted">
              Total {vnd(curTotal)} vs {vnd(prevTotal)} last month
              {curTotal > 0 && dom >= 3 ? ` · projected ${vnd(Math.round(projected))}` : ''}
            </p>
          </>
        )}
      </Panel>

      <Panel title="Battle Heatmap · 8 weeks">
        {state.habits.length === 0 ? (
          <p className="muted">Recruit habits to build your heatmap.</p>
        ) : (
          <>
            <div className="heat">
              {cells.map((c) => (
                <div key={c.d} className={`hc l${c.lvl}`} title={`${c.d}: ${c.n}/${state.habits.length}`} />
              ))}
            </div>
            <p className="muted">Rows are Mon to Sun. Brighter means more habits cleared that day.</p>
          </>
        )}
      </Panel>

      <Panel title="Habit Performance · 30 days">
        {habitRows.length === 0 && <p className="muted">No habits yet.</p>}
        {habitRows.map(({ h, rate, last14, prev14, longest }) => (
          <div key={h.id} className="cmp wide">
            <span>
              {JOBS[h.job]} {h.name}
            </span>
            <div className="bar thin">
              <div className="bar-fill" style={{ width: `${rate * 100}%` }} />
            </div>
            <b>{Math.round(rate * 100)}%</b>
            <small className="muted">
              best {longest}d · {last14 > prev14 ? '▲' : last14 < prev14 ? '▼' : '='}
            </small>
          </div>
        ))}
      </Panel>
    </>
  )
}
