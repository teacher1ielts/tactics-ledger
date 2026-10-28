import { dayKey, goalProgress, shiftDay, vnd, type State } from './store'

export interface Review {
  from: string
  to: string
  clears: number
  prevClears: number
  possible: number
  rate: number
  grade: string
  best?: { name: string; count: number }
  worst?: { name: string; count: number }
  spend: number
  prevSpend: number
  income: number
  topCat?: { cat: string; amount: number }
  near: { name: string; pct: number }[]
  empty: boolean
}

/** The last 7 days (ending today) against the 7 before them. */
export function weeklyReview(s: State, today = dayKey()): Review {
  const from = shiftDay(today, -6)
  const pFrom = shiftDay(today, -13)
  const pTo = shiftDay(today, -7)
  const within = (d: string, a: string, b: string) => d >= a && d <= b

  const per = s.habits.map((h) => ({ name: h.name, count: h.done.filter((d) => within(d, from, today)).length, prev: h.done.filter((d) => within(d, pFrom, pTo)).length }))
  const clears = per.reduce((a, p) => a + p.count, 0)
  const prevClears = per.reduce((a, p) => a + p.prev, 0)
  const possible = s.habits.length * 7
  const rate = possible ? clears / possible : 0

  const spends = s.txs.filter((t) => t.type === 'spend')
  const spend = spends.filter((t) => within(t.date, from, today)).reduce((a, t) => a + t.amount, 0)
  const prevSpend = spends.filter((t) => within(t.date, pFrom, pTo)).reduce((a, t) => a + t.amount, 0)
  const income = s.txs.filter((t) => t.type === 'income' && within(t.date, from, today)).reduce((a, t) => a + t.amount, 0)
  const cats = new Map<string, number>()
  spends.filter((t) => within(t.date, from, today)).forEach((t) => cats.set(t.category, (cats.get(t.category) ?? 0) + t.amount))
  const top = [...cats.entries()].sort((a, b) => b[1] - a[1])[0]

  const sorted = [...per].sort((a, b) => b.count - a.count)
  const near = s.goals
    .map((g) => ({ name: g.name, pct: goalProgress(g, s).pct }))
    .filter((g) => g.pct < 1)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 2)

  const empty = s.habits.length === 0 && spend === 0 && income === 0
  let score = rate * 100
  if (prevSpend > 0 && spend <= prevSpend) score += 5
  if (prevSpend > 0 && spend > prevSpend * 1.3) score -= 8
  const grade = empty ? '–' : score >= 90 ? 'S' : score >= 75 ? 'A' : score >= 55 ? 'B' : score >= 35 ? 'C' : 'D'

  return {
    from,
    to: today,
    clears,
    prevClears,
    possible,
    rate,
    grade,
    best: sorted[0] && sorted[0].count > 0 ? { name: sorted[0].name, count: sorted[0].count } : undefined,
    worst: per.length > 1 ? { name: sorted[sorted.length - 1].name, count: sorted[sorted.length - 1].count } : undefined,
    spend,
    prevSpend,
    income,
    topCat: top ? { cat: top[0], amount: top[1] } : undefined,
    near,
    empty,
  }
}

const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`)

export function reviewLines(r: Review): string[] {
  if (r.empty) return ['Nothing to review yet. Add habits and log some spending, then check back next week.']
  const out: string[] = []
  if (r.possible) {
    out.push(`Habits: ${r.clears} of ${r.possible} possible clears (${Math.round(r.rate * 100)}%), ${sign(r.clears - r.prevClears)} vs the week before.`)
    if (r.best) out.push(`Strongest: ${r.best.name} (${r.best.count}/7).`)
    if (r.worst && r.worst.name !== r.best?.name) out.push(`Weakest: ${r.worst.name} (${r.worst.count}/7).`)
  }
  if (r.spend > 0 || r.income > 0) {
    const delta = r.prevSpend > 0 ? ` (${r.spend >= r.prevSpend ? '▲' : '▼'} ${Math.abs(Math.round((r.spend / r.prevSpend - 1) * 100))}% vs last week)` : ''
    out.push(`Money: spent ${vnd(r.spend)}${delta}, earned ${vnd(r.income)}.`)
    if (r.topCat) out.push(`Biggest spend category: ${r.topCat.cat} at ${vnd(r.topCat.amount)}.`)
  }
  r.near.forEach((g) => out.push(`Closest quest: ${g.name} at ${Math.round(g.pct * 100)}%.`))

  // one concrete suggestion
  if (r.possible && r.rate < 0.5 && r.worst) out.push(`Next week: give "${r.worst.name}" a fixed daily time (Command → Slot my habits).`)
  else if (r.prevSpend > 0 && r.spend > r.prevSpend * 1.2 && r.topCat) out.push(`Next week: spending is up, so cap ${r.topCat.cat}.`)
  else if (r.possible && r.rate >= 0.8) out.push('Next week: you are on a roll. Add one harder habit or raise a goal target.')
  return out
}

/** One line for a notification body. */
export function reviewSummary(r: Review): string {
  if (r.empty) return 'Your weekly debrief is ready.'
  const parts = [`Grade ${r.grade}`]
  if (r.possible) parts.push(`${r.clears}/${r.possible} habit clears`)
  if (r.spend > 0) parts.push(`spent ${vnd(r.spend)}`)
  return parts.join(' · ')
}
