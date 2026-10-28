import { useEffect, useState } from 'react'
import { reviewSummary, weeklyReview } from './review'
import { dayKey, type State } from './store'

export interface Alerts {
  on: boolean // weekly debrief on
  day: number // 0 = Sunday
  time: number // minutes from midnight
  habits: boolean // reminders ten minutes before a habit's daily time
  seen: string // debrief key the user has opened
  sent: string // debrief key already notified
}

const KEY = 'tl-alerts'
const ICON = `${import.meta.env.BASE_URL}icon.svg`
const pad = (n: number) => String(n).padStart(2, '0')
const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Date of the most recent scheduled debrief moment that has already passed. */
export function dueKey(a: Alerts, now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  d.setDate(d.getDate() - ((d.getDay() - a.day + 7) % 7))
  if (new Date(d.getTime() + a.time * 60000) > now) d.setDate(d.getDate() - 7)
  return fmt(d)
}

function load(): Alerts {
  const base: Alerts = { on: true, day: 0, time: 20 * 60, habits: false, seen: '', sent: '' }
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...base, ...JSON.parse(raw) }
  } catch {
    /* ignore */
  }
  return { ...base, seen: dueKey(base) } // first run: only the next debrief counts
}

export function useAlerts() {
  const [alerts, setAlerts] = useState<Alerts>(load)
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(alerts))
    } catch {
      /* ignore */
    }
  }, [alerts])
  return [alerts, setAlerts] as const
}

export const notifSupport = () => typeof Notification !== 'undefined'
export const canNotify = () => notifSupport() && Notification.permission === 'granted'

export async function notify(title: string, body: string, tag: string) {
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) return void (await reg.showNotification(title, { body, tag, icon: ICON, badge: ICON }))
    new Notification(title, { body, tag, icon: ICON })
  } catch {
    /* notifications are best-effort */
  }
}

export const hasDebrief = (s: State) => s.habits.length > 0 || s.txs.length > 0

/** While the app is open: fire the weekly debrief and habit reminders when their time comes. */
export function useReminders(state: State, alerts: Alerts, setAlerts: (fn: (a: Alerts) => Alerts) => void) {
  useEffect(() => {
    const run = () => {
      if (!canNotify()) return
      const now = new Date()
      const key = dueKey(alerts, now)
      if (alerts.on && key !== alerts.seen && key !== alerts.sent && hasDebrief(state)) {
        void notify('Weekly Debrief ready', reviewSummary(weeklyReview(state)), 'debrief-' + key)
        setAlerts((a) => ({ ...a, sent: key }))
      }
      if (alerts.habits) {
        const today = dayKey()
        const mins = now.getHours() * 60 + now.getMinutes()
        let fired: { d: string; ids: string[] } = { d: today, ids: [] }
        try {
          const raw = JSON.parse(localStorage.getItem('tl-hr') ?? 'null')
          if (raw?.d === today) fired = raw
        } catch {
          /* ignore */
        }
        for (const h of state.habits) {
          if (h.time === undefined || h.done.includes(today) || fired.ids.includes(h.id)) continue
          if (mins >= h.time - 10 && mins < h.time + 30) {
            void notify(`${h.name} at ${pad(Math.floor(h.time / 60))}:${pad(h.time % 60)}`, 'Clear it to keep your streak alive.', `habit-${h.id}-${today}`)
            fired.ids.push(h.id)
          }
        }
        try {
          localStorage.setItem('tl-hr', JSON.stringify(fired))
        } catch {
          /* ignore */
        }
      }
    }
    run()
    const id = setInterval(run, 30_000)
    return () => clearInterval(id)
  }, [state, alerts, setAlerts])
}
