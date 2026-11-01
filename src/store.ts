import { useEffect, useState } from 'react'

export type Job = 'Scholar' | 'Knight' | 'Monk' | 'Merchant'
export const JOBS: Record<Job, string> = {
  Scholar: '📜',
  Knight: '⚔️',
  Monk: '🧘',
  Merchant: '💰',
}

export interface Habit {
  id: string
  name: string
  job: Job
  done: string[] // YYYY-MM-DD
  time?: number // daily slot, minutes from midnight
  dur?: number // minutes
}

export interface PlanItem {
  id: string
  title: string
  kind: "event" | "task"
  dur: number // minutes
  date?: string // YYYY-MM-DD, unset while an unscheduled task
  start?: number // minutes from midnight
  deadline?: string
  done?: boolean
  doneAt?: string // YYYY-MM-DD it was ticked off
  repeat?: Repeat // finishing it creates the next one
  from?: string // the finished task this one was created from
}

export interface Repeat {
  every: 'day' | 'week' | 'month'
  dom?: number // monthly: day of the month, so 31st tasks do not drift
}

export type TxType = 'income' | 'spend'
export interface Tx {
  id: string
  rid?: string // set when a repeating rule posted it
  date: string
  type: TxType
  amount: number
  category: string
  note: string
}

export type GoalKind = 'habit' | 'savings' | 'manual'
export interface Milestone {
  id: string
  text: string
  done: boolean
}
export interface Goal {
  id: string
  name: string
  term: 'short' | 'long'
  kind: GoalKind
  start: string // YYYY-MM-DD
  deadline?: string
  target: number // habit: clears, savings: VND, manual: unused
  habitId?: string
  period?: 'week' // habit goals only: count clears this Mon-Sun week instead of in total
  deposits: { date: string; amount: number }[]
  milestones: Milestone[]
}

export interface State {
  habits: Habit[]
  txs: Tx[]
  budget: number // monthly spending cap, VND
  goals: Goal[]
  events: PlanItem[]
  recurring: Recurring[]
}

/** Money that repeats (salary, rent): each due date posts a transaction on its own. */
export interface Recurring {
  id: string
  type: TxType
  amount: number
  category: string
  note: string
  every: Repeat['every']
  dom?: number
  next: string // the next date to post
}

export const SPEND_CATS = ['Food', 'Transport', 'Bills', 'Shopping', 'Health', 'Fun', 'Study', 'Other']
export const INCOME_CATS = ['Salary', 'Teaching', 'Gift', 'Other']

const KEY = 'tactics-ledger-v1'
const empty: State = { habits: [], txs: [], budget: 0, goals: [], events: [], recurring: [] }

/** Whatever is in storage (old version, hand-edited, damaged), make it a valid State instead of crashing. */
export function sanitize(x: unknown): State {
  const o = (x && typeof x === 'object' ? x : {}) as Partial<Record<keyof State, unknown>>
  const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
  return {
    habits: list<Habit>(o.habits).filter((h) => h && typeof h === 'object').map((h) => ({ ...h, done: list<string>(h.done) })),
    txs: list<Tx>(o.txs).filter((t) => t && typeof t === 'object' && Number.isFinite(t.amount)),
    budget: typeof o.budget === 'number' && Number.isFinite(o.budget) ? o.budget : 0,
    goals: list<Goal>(o.goals).filter((g) => g && typeof g === 'object').map((g) => ({ ...g, deposits: list(g.deposits), milestones: list(g.milestones) })),
    events: list<PlanItem>(o.events).filter((e) => e && typeof e === 'object'),
    recurring: list<Recurring>(o.recurring).filter((r) => r && typeof r === 'object' && Number.isFinite(r.amount) && typeof r.next === 'string'),
  }
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? sanitize(JSON.parse(raw)) : empty
  } catch {
    return empty
  }
}

export function useStore() {
  const [state, setState] = useState<State>(load)
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      /* storage unavailable: keep working in memory */
    }
  }, [state])
  return [state, setState] as const
}

export const uid = () => Math.random().toString(36).slice(2, 10)

export const dayKey = (d = new Date()) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return z.toISOString().slice(0, 10)
}
export const shiftDay = (key: string, n: number) => {
  const d = new Date(key + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return dayKey(d)
}

export const vnd = (n: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n)

/** Parse "50k", "1.5tr", "1,200,000" into a VND amount. */
export function parseVnd(s: string): number {
  const t = s.trim().toLowerCase().replace(/\s/g, '')
  const m = t.match(/^([\d.,]+)(k|tr|m|nghin|ngan)?$/)
  if (!m) return NaN
  let num = m[1]
  const suffix = m[2]
  if (suffix) num = num.replace(',', '.')
  else num = num.replace(/[.,]/g, '')
  const v = parseFloat(num)
  if (suffix === 'k' || suffix === 'nghin' || suffix === 'ngan') return Math.round(v * 1_000)
  if (suffix === 'tr' || suffix === 'm') return Math.round(v * 1_000_000)
  return Math.round(v)
}

export function streak(h: Habit, today = dayKey()): number {
  const set = new Set(h.done)
  let cur = set.has(today) ? today : shiftDay(today, -1)
  let n = 0
  while (set.has(cur)) {
    n++
    cur = shiftDay(cur, -1)
  }
  return n
}

export function goalProgress(g: Goal, s: State): { cur: number; target: number; pct: number } {
  let cur = 0
  let target = g.target
  if (g.kind === 'habit') {
    const h = s.habits.find((x) => x.id === g.habitId)
    const from = g.period === 'week' ? weekStart() : g.start
    cur = h ? h.done.filter((d) => d >= from && d <= dayKey()).length : 0
  } else if (g.kind === 'savings') {
    cur = g.deposits.reduce((a, d) => a + d.amount, 0)
  } else {
    cur = g.milestones.filter((m) => m.done).length
    target = g.milestones.length
  }
  const pct = target > 0 ? Math.min(1, cur / target) : 0
  return { cur, target, pct }
}

/** Monday of the current week, as YYYY-MM-DD. */
export function weekStart(today = dayKey()) {
  return shiftDay(today, -((new Date(today + 'T12:00:00').getDay() + 6) % 7))
}

/** Finished for good. Weekly goals reset every Monday, so they never count as finished. */
export const goalDone = (g: Goal, s: State) => !g.period && goalProgress(g, s).pct >= 1

export const XP_PER_CHECK = 10
export const XP_PER_TX = 3
export const XP_PER_GOAL = 50
export const XP_PER_TASK = 5
export function xpOf(s: State) {
  return (
    s.habits.reduce((a, h) => a + h.done.length * XP_PER_CHECK, 0) +
    s.txs.filter((t) => !t.rid).length * XP_PER_TX +
    s.events.filter((e) => e.kind === 'task' && e.done).length * XP_PER_TASK +
    s.goals.filter((g) => goalDone(g, s)).length * XP_PER_GOAL
  )
}
const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/** One step on from a date: a day, a week, or the same day next month (31st clamps to month end, never drifts). */
export function stepRepeat(r: Repeat, d: string): string {
  if (r.every === 'day') return shiftDay(d, 1)
  if (r.every === 'week') return shiftDay(d, 7)
  const dt = new Date(d + 'T12:00:00')
  const nx = new Date(dt.getFullYear(), dt.getMonth() + 1, 1)
  const last = new Date(nx.getFullYear(), nx.getMonth() + 1, 0).getDate()
  return ymd(nx.getFullYear(), nx.getMonth() + 1, Math.min(r.dom ?? dt.getDate(), last))
}

/** The next due date after finishing a repeating task: one step on from its due date, and never in the past. */
export function nextDue(r: Repeat, base: string, today = dayKey()): string {
  let n = stepRepeat(r, base)
  for (let i = 0; i < 5000 && n <= today; i++) n = stepRepeat(r, n)
  return n
}

/**
 * Turn every repeating money rule that has come due into real transactions.
 * Ids are fixed per rule and date, so two devices posting the same occurrence merge into one.
 * Returns the same object when nothing is due, so it is safe to call as often as you like.
 */
export function postRecurring(s: State, today = dayKey()): State {
  if (!s.recurring.length) return s
  const have = new Set(s.txs.map((t) => t.id))
  const added: Tx[] = []
  const rules = s.recurring.map((r) => {
    let next = r.next
    for (let i = 0; i < 60 && next <= today; i++) {
      const id = `rec-${r.id}-${next}`
      if (!have.has(id)) {
        have.add(id)
        added.push({ id, rid: r.id, date: next, type: r.type, amount: r.amount, category: r.category, note: r.note })
      }
      next = stepRepeat({ every: r.every, dom: r.dom }, next)
    }
    return next === r.next ? r : { ...r, next }
  })
  if (!added.length && rules.every((r, i) => r === s.recurring[i])) return s
  return { ...s, recurring: rules, txs: added.length ? [...added, ...s.txs].sort((x, y) => (y.date > x.date ? 1 : y.date < x.date ? -1 : 0)) : s.txs }
}

export function repeatLabel(r: Repeat) {
  if (r.every === 'day') return 'every day'
  if (r.every === 'week') return 'every week'
  const d = r.dom
  const suffix = !d ? '' : d % 100 >= 11 && d % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][d % 10 > 3 ? 0 : d % 10]
  return d ? `monthly on the ${d}${suffix}` : 'every month'
}

/** Tick or untick a task. Finishing a repeating one creates the next; unticking removes that follow-up. */
export function toggleTask(s: State, id: string): State {
  const e = s.events.find((x) => x.id === id)
  if (!e) return s
  if (!e.done) {
    const events = s.events.map((x) => (x.id === id ? toggleDone(x) : x))
    if (!e.repeat) return { ...s, events }
    const next = nextDue(e.repeat, e.deadline ?? e.date ?? dayKey())
    const copy: PlanItem = { id: uid(), title: e.title, kind: e.kind, dur: e.dur, repeat: e.repeat, from: id, deadline: next, ...(e.start !== undefined ? { date: next, start: e.start } : {}) }
    return { ...s, events: [...events, copy] }
  }
  return { ...s, events: s.events.filter((x) => !(x.from === id && !x.done)).map((x) => (x.id === id ? toggleDone(x) : x)) }
}

/** Tick or untick a task/event, remembering the day it was finished. */
export const toggleDone = (e: PlanItem): PlanItem => (e.done ? { ...e, done: false, doneAt: undefined } : { ...e, done: true, doneAt: dayKey() })

export const levelOf = (xp: number) => ({ level: Math.floor(xp / 100) + 1, into: xp % 100 })

export const RANKS = ['Rookie', 'Runner', 'Netrunner', 'Legend']
export const GEAR = ['', 'Belt light', 'Halo', 'Wings']

/** A hero levels up (every 10 clears) from the habits of its job; the Merchant also counts logged transactions. */
export function partyOf(s: State) {
  return (Object.keys(JOBS) as Job[]).map((job) => {
    const clears = s.habits.filter((h) => h.job === job).reduce((a, h) => a + h.done.length, 0) + (job === 'Merchant' ? s.txs.filter((t) => !t.rid).length : 0)
    const tier = clears >= 100 ? 3 : clears >= 50 ? 2 : clears >= 20 ? 1 : 0
    return { job, clears, level: Math.floor(clears / 10) + 1, into: clears % 10, tier, rank: RANKS[tier] }
  })
}

/** Write state straight to storage (sync does this before recording a new baseline). */
export function persistState(s: State): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
    return true
  } catch {
    return false
  }
}
