import type { Habit, PlanItem, State } from './store'

export interface Block {
  id: string
  title: string
  start: number
  end: number
  kind: 'event' | 'task' | 'habit'
  ref: string
  done: boolean
  clash: boolean
}

const DAY_START = 7 * 60
const DAY_END = 22 * 60
const GAP = 10

const pad = (n: number) => String(n).padStart(2, '0')
export const hhmm = (m: number) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`
const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const shift = (key: string, n: number) => {
  const d = new Date(key + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return fmt(d)
}
const between = (a: string, b: string) => Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000)

/** Everything on the calendar for one day: timed events/tasks plus daily habit slots. */
export function blocksFor(s: State, date: string): Block[] {
  const ev: Block[] = s.events
    .filter((e) => e.date === date && e.start !== undefined)
    .map((e) => ({ id: e.id, title: e.title, start: e.start!, end: e.start! + e.dur, kind: e.kind, ref: e.id, done: !!e.done, clash: false }))
  const hb: Block[] = s.habits
    .filter((h) => h.time !== undefined)
    .map((h) => ({ id: 'h' + h.id, title: h.name, start: h.time!, end: h.time! + (h.dur ?? 30), kind: 'habit' as const, ref: h.id, done: h.done.includes(date), clash: false }))
  const all = [...ev, ...hb].sort((a, b) => a.start - b.start || a.end - b.end)
  let maxEnd = -1
  all.forEach((b, i) => {
    if (i > 0 && b.start < maxEnd) {
      b.clash = true
      const prev = all.slice(0, i).find((p) => p.end > b.start)
      if (prev) prev.clash = true
    }
    maxEnd = Math.max(maxEnd, b.end)
  })
  return all
}

/** First free window of `dur` minutes at or after `from`, keeping a small gap around other blocks. */
export function findSlot(busy: { start: number; end: number }[], dur: number, from: number, to = DAY_END): number | null {
  let t = Math.max(from, DAY_START)
  for (const b of [...busy].sort((x, y) => x.start - y.start)) {
    if (b.end + GAP <= t) continue
    if (t + dur + GAP <= b.start) return t
    t = Math.max(t, b.end + GAP)
  }
  return t + dur <= to ? t : null
}

const roundUp = (m: number, step = 15) => Math.ceil(m / step) * step

export interface AutoResult {
  events: PlanItem[]
  placed: { title: string; date: string; start: number }[]
  failed: string[]
}

/** Give every unscheduled task a slot: earliest deadline first, earliest free time first. */
export function autoScheduleTasks(s: State, now: Date): AutoResult {
  const today = fmt(now)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  let events = [...s.events]
  const queue = events.filter((e) => e.kind === 'task' && e.start === undefined && !e.done).sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'))
  const placed: AutoResult['placed'] = []
  const failed: string[] = []

  for (const t of queue) {
    const horizon = t.deadline ? Math.max(0, Math.min(30, between(today, t.deadline))) : 6
    let done = false
    for (let off = 0; off <= horizon && !done; off++) {
      const date = shift(today, off)
      const busy = blocksFor({ ...s, events }, date)
      const from = off === 0 ? roundUp(nowMin) : DAY_START
      const slot = findSlot(busy, t.dur, from)
      if (slot !== null) {
        events = events.map((e) => (e.id === t.id ? { ...e, date, start: slot } : e))
        placed.push({ title: t.title, date, start: slot })
        done = true
      }
    }
    if (!done) failed.push(t.title)
  }
  return { events, placed, failed }
}

/** Give habits that have no daily time a slot that is free all week, preferring the evening. */
export function slotHabits(s: State, now: Date): { habits: Habit[]; placed: { name: string; time: number }[] } {
  const today = fmt(now)
  const habits = s.habits.map((h) => ({ ...h }))
  const placed: { name: string; time: number }[] = []
  for (const h of habits) {
    if (h.time !== undefined) continue
    const dur = h.dur ?? 30
    const busy: { start: number; end: number }[] = []
    for (let i = 0; i < 7; i++) busy.push(...blocksFor({ ...s, habits }, shift(today, i)))
    const slot = findSlot(busy, dur, 18 * 60) ?? findSlot(busy, dur, DAY_START, 18 * 60)
    if (slot !== null) {
      h.time = slot
      h.dur = dur
      placed.push({ name: h.name, time: slot })
    }
  }
  return { habits, placed }
}
