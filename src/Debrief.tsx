import { useState } from 'react'
import { canNotify, dueKey, notify, notifSupport, type Alerts } from './alerts'
import { buildIcs, downloadIcs } from './ics'
import { reviewLines, reviewSummary, weeklyReview } from './review'
import type { State } from './store'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const pad = (n: number) => String(n).padStart(2, '0')

export default function Debrief({ state, alerts, setAlerts }: { state: State; alerts: Alerts; setAlerts: (fn: (a: Alerts) => Alerts) => void }) {
  const [perm, setPerm] = useState(notifSupport() ? Notification.permission : 'unsupported')
  const [msg, setMsg] = useState('')
  const r = weeklyReview(state)
  const lines = reviewLines(r)
  const t = `${pad(Math.floor(alerts.time / 60))}:${pad(alerts.time % 60)}`

  const ask = async () => {
    if (!notifSupport()) return setMsg('This browser does not support notifications.')
    const p = await Notification.requestPermission()
    setPerm(p)
    setMsg(p === 'granted' ? 'Notifications enabled.' : 'Permission was not granted. You can allow it in the browser site settings.')
  }

  return (
    <section className="panel">
      <h2>
        Weekly Debrief
        <span className={`grade g${r.grade}`} aria-label={`Grade ${r.grade}`}>
          {r.grade}
        </span>
      </h2>
      <p className="muted" style={{ marginTop: 0 }}>
        {r.from} to {r.to}
      </p>
      <ul className="list">
        {lines.map((l, i) => (
          <li key={i}>
            <span className="grow">◆ {l}</span>
          </li>
        ))}
      </ul>

      <details className="paste" open={perm !== 'granted'}>
        <summary>Alerts &amp; reminders</summary>
        <div className="stack">
          <label className="row alert-row">
            <input type="checkbox" checked={alerts.on} onChange={(e) => setAlerts((a) => ({ ...a, on: e.target.checked }))} />
            <span>Weekly debrief alert</span>
          </label>
          <div className="row">
            <select value={alerts.day} onChange={(e) => setAlerts((a) => ({ ...a, day: Number(e.target.value) }))} aria-label="Day of week">
              {DAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
            <input
              type="time"
              value={t}
              onChange={(e) => {
                const [h, m] = e.target.value.split(':').map(Number)
                if (Number.isFinite(h) && Number.isFinite(m)) setAlerts((a) => ({ ...a, time: h * 60 + m }))
              }}
              aria-label="Time"
            />
          </div>
          <label className="row alert-row">
            <input type="checkbox" checked={alerts.habits} onChange={(e) => setAlerts((a) => ({ ...a, habits: e.target.checked }))} />
            <span>Remind me 10 min before a habit's daily time</span>
          </label>

          <div className="row">
            {perm !== 'granted' && (
              <button className="btn small" onClick={ask} disabled={perm === 'unsupported'}>
                Enable notifications
              </button>
            )}
            <button
              className="btn small"
              disabled={!canNotify()}
              onClick={() => {
                void notify('Weekly Debrief ready', reviewSummary(r), 'test')
                setMsg('Test sent.')
              }}
            >
              Send test
            </button>
            <button className="btn small" onClick={() => downloadIcs(buildIcs(state, alerts))}>
              Calendar file (.ics)
            </button>
          </div>
          <p className="muted" style={{ margin: 0 }}>
            Status: {perm === 'granted' ? 'notifications allowed' : perm === 'denied' ? 'blocked in browser settings' : perm === 'unsupported' ? 'not supported here' : 'not enabled yet'}. Next debrief: {DAYS[alerts.day]} {t}
            {dueKey(alerts) !== alerts.seen && alerts.on ? ' (one is ready now)' : ''}.
          </p>
          <p className="muted" style={{ margin: 0 }}>
            Browser notifications only fire while this app is open or running in the background. For alerts when it is fully closed, import the calendar file into your phone's calendar: it adds the weekly debrief, your habit times and upcoming events with built-in alarms.
          </p>
          {msg && <p className="pos">{msg}</p>}
        </div>
      </details>
    </section>
  )
}
