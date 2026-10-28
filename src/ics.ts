// Builds a calendar file so the phone's own calendar app fires reminders, even when this app is closed.
import type { Alerts } from './alerts'
import type { State } from './store'

const pad = (n: number) => String(n).padStart(2, '0')
const stamp = (date: string, minutes: number) => `${date.replace(/-/g, '')}T${pad(Math.floor(minutes / 60))}${pad(minutes % 60)}00`
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

function fold(line: string): string {
  const out: string[] = []
  let rest = line
  while (rest.length > 72) {
    out.push(rest.slice(0, 72))
    rest = ' ' + rest.slice(72)
  }
  out.push(rest)
  return out.join('\r\n')
}

function event(lines: string[], alarmMin: number, alarmText: string): string[] {
  return ['BEGIN:VEVENT', ...lines, 'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(alarmText)}`, `TRIGGER:-PT${alarmMin}M`, 'END:VALARM', 'END:VEVENT']
}

export function buildIcs(s: State, a: Alerts, now = new Date()): string {
  const key = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const dtstamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tactics Ledger//EN', 'CALSCALE:GREGORIAN']

  if (a.on) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    d.setDate(d.getDate() + ((a.day - d.getDay() + 7) % 7))
    const first = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    lines.push(
      ...event(
        [`UID:debrief@tactics-ledger`, `DTSTAMP:${dtstamp}`, `DTSTART:${stamp(first, a.time)}`, 'DURATION:PT15M', `RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[a.day]}`, 'SUMMARY:Weekly Debrief', 'DESCRIPTION:Open Tactics Ledger > Intel > Weekly Debrief.'],
        0,
        'Weekly Debrief',
      ),
    )
  }

  for (const h of s.habits) {
    if (h.time === undefined) continue
    lines.push(
      ...event(
        [`UID:habit-${h.id}@tactics-ledger`, `DTSTAMP:${dtstamp}`, `DTSTART:${stamp(key, h.time)}`, `DURATION:PT${h.dur ?? 30}M`, 'RRULE:FREQ=DAILY', `SUMMARY:${esc(h.name)}`],
        10,
        h.name,
      ),
    )
  }

  for (const e of s.events) {
    if (e.start === undefined || !e.date || e.date < key || e.done) continue
    lines.push(...event([`UID:event-${e.id}@tactics-ledger`, `DTSTAMP:${dtstamp}`, `DTSTART:${stamp(e.date, e.start)}`, `DURATION:PT${e.dur}M`, `SUMMARY:${esc(e.title)}`], 15, e.title))
  }

  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

export function downloadIcs(text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'tactics-ledger-reminders.ics'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
