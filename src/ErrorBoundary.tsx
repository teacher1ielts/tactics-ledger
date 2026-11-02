import { Component, type ReactNode } from 'react'
import { readStoredBackup } from './store'

const KEY = 'tactics-ledger-v1'

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** If the app crashes, show a way out instead of a blank screen, and never lose the user's data. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    const raw = readStoredBackup()
    return (
      <div className="shell" style={{ paddingTop: 40 }}>
        <section className="panel">
          <h2>Something broke</h2>
          <p>Sorry, the app hit an error. Your data is still saved on this device.</p>
          <p className="muted" style={{ overflowWrap: 'anywhere' }}>{this.state.error.message}</p>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button className="btn" onClick={() => location.reload()}>
              Reload
            </button>
            {raw && (
              <button className="btn" onClick={() => download(`tactics-ledger-backup-${new Date().toISOString().slice(0, 10)}.json`, raw)}>
                Save a backup
              </button>
            )}
          </div>
          <p className="muted">If it keeps happening after a reload, save a backup first, then tell me what you were doing.</p>
        </section>
      </div>
    )
  }
}
