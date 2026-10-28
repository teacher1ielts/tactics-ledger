import { useState } from 'react'
import { silence } from './feedback'
import { persistState, type State } from './store'
import type { Sync } from './sync'

const ago = (t: number | null) => {
  if (!t) return 'not yet'
  const s = Math.round((Date.now() - t) / 1000)
  return s < 10 ? 'just now' : s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`
}

const isState = (x: unknown): x is State => {
  const s = x as Partial<State> | null
  return !!s && Array.isArray(s.habits) && Array.isArray(s.txs) && Array.isArray(s.goals ?? []) && Array.isArray(s.events ?? [])
}

export default function SyncPanel({ sync, state, setState, close }: { sync: Sync; state: State; setState: (s: State) => void; close: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [bad, setBad] = useState(false)
  const [busy, setBusy] = useState(false)

  const say = (m: string, isBad = false) => {
    setMsg(m)
    setBad(isBad)
  }
  const attempt = async (fn: () => Promise<void>) => {
    setBusy(true)
    say('')
    try {
      await fn()
    } catch (e) {
      say(e instanceof Error ? e.message : 'Something went wrong.', true)
    } finally {
      setBusy(false)
    }
  }

  const exportJson = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `tactics-ledger-backup-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  const importJson = async (f: File | undefined) => {
    if (!f) return
    try {
      const data = JSON.parse(await f.text())
      if (!isState(data)) return say('That file is not a Tactics Ledger backup.', true)
      const next: State = { habits: data.habits, txs: data.txs, budget: data.budget ?? 0, goals: data.goals ?? [], events: data.events ?? [] }
      const extra = sync.email ? ' It will also replace your cloud copy on the next sync.' : ''
      if (!window.confirm(`Replace everything on this device with the backup (${next.habits.length} habits, ${next.txs.length} transactions)?${extra}`)) return
      persistState(next)
      silence.on = true
      setState(next)
      say('Backup restored.')
    } catch {
      say('Could not read that file.', true)
    }
  }

  return (
    <div className="modal" onClick={close} role="dialog" aria-modal="true" aria-label="Cloud sync and backup">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <section className="panel" style={{ margin: 0 }}>
          <h2>
            Cloud Sync
            <button className="x" onClick={close} aria-label="Close">
              ✕
            </button>
          </h2>

          {!sync.configured && <p className="muted">Cloud sync is not set up in this build, so your data stays on this device. Use the backup below to move it by hand.</p>}

          {sync.configured && !sync.email && (
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault()
                void attempt(() => sync.signIn(email.trim(), password))
              }}
            >
              <p className="muted" style={{ margin: 0 }}>
                Sign in to keep your phone and computer in step. Your data is stored in your own Supabase project, and only you can read it.
              </p>
              <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required />
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (6+ characters)" minLength={6} required />
              <div className="row">
                <button className="btn" type="submit" disabled={busy}>
                  Sign in
                </button>
                <button
                  className="btn"
                  type="button"
                  disabled={busy || !email || password.length < 6}
                  onClick={() =>
                    void attempt(async () => {
                      const r = await sync.signUp(email.trim(), password)
                      say(r === 'confirm' ? 'Account created. Check your email for a confirmation link, then sign in here.' : 'Account created and signed in.')
                    })
                  }
                >
                  Create account
                </button>
              </div>
            </form>
          )}

          {sync.configured && sync.email && (
            <div className="stack">
              <p style={{ margin: 0 }}>
                Signed in as <b>{sync.email}</b>
              </p>
              <p className={sync.status === 'error' ? 'neg' : 'muted'} style={{ margin: 0 }}>
                {sync.status === 'syncing' ? 'Syncing…' : sync.status === 'error' ? `Problem: ${sync.error}` : `Up to date · last sync ${ago(sync.last)}`}
              </p>
              <div className="row">
                <button className="btn" onClick={sync.syncNow} disabled={sync.status === 'syncing'}>
                  Sync now
                </button>
                <button className="btn danger" style={{ marginTop: 0 }} onClick={() => void attempt(sync.signOut)}>
                  Sign out
                </button>
              </div>
            </div>
          )}

          {msg && <p className={bad ? 'neg' : 'pos'}>{msg}</p>}

          <h2 style={{ marginTop: 18 }}>Backup</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            A file copy of everything, as a safety net.
          </p>
          <div className="row">
            <button className="btn small" onClick={exportJson}>
              Export backup
            </button>
            <label className="btn small filebtn">
              Import backup
              <input type="file" accept="application/json,.json" hidden onChange={(e) => { void importJson(e.target.files?.[0]); e.target.value = '' }} />
            </label>
          </div>
        </section>
      </div>
    </div>
  )
}
