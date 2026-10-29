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
}

export type TxType = 'income' | 'spend'
export interface Tx {
  id: string
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
}

export const SPEND_CATS = ['Food', 'Transport', 'Bills', 'Shopping', 'Health', 'Fun', 'Study', 'Other']
export const INCOME_CATS = ['Salary', 'Teaching', 'Gift', 'Other']

const KEY = 'tactics-ledger-v1'
const empty: State = { habits: [], txs: [], budget: 0, goals: [], events: [] }

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...empty, ...JSON.parse(raw) } : empty
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
export function xpOf(s: State) {
  return (
    s.habits.reduce((a, h) => a + h.done.length * XP_PER_CHECK, 0) +
    s.txs.length * XP_PER_TX +
    s.goals.filter((g) => goalDone(g, s)).length * XP_PER_GOAL
  )
}
export const levelOf = (xp: number) => ({ level: Math.floor(xp / 100) + 1, into: xp % 100 })

export const RANKS = ['Rookie', 'Runner', 'Netrunner', 'Legend']
export const GEAR = ['', 'Belt light', 'Halo', 'Wings']

/** A hero levels up (every 10 clears) from the habits of its job; the Merchant also counts logged transactions. */
export function partyOf(s: State) {
  return (Object.keys(JOBS) as Job[]).map((job) => {
    const clears = s.habits.filter((h) => h.job === job).reduce((a, h) => a + h.done.length, 0) + (job === 'Merchant' ? s.txs.length : 0)
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
