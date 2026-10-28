import { useState } from 'react'
import { extractText } from './extract'
import { parseStatement, type StatementRow } from './statement'
import { INCOME_CATS, SPEND_CATS, uid, vnd, type State } from './store'

type Update = (fn: (s: State) => State) => void
type Row = StatementRow & { on: boolean; dup: boolean }
type Filter = 'all' | 'income' | 'spend'

export default function ImportPanel({ state, update }: { state: State; update: Update }) {
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [paste, setPaste] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const existing = new Set(state.txs.map((t) => `${t.date}|${t.type}|${t.amount}`))
  const markDup = (r: StatementRow): Row => {
    const dup = existing.has(`${r.date}|${r.type}|${r.amount}`)
    return { ...r, dup, on: !dup && r.sure }
  }

  const ingest = (text: string, source: string) => {
    const found = parseStatement(text).map(markDup)
    if (found.length === 0) setMsg(`No transactions found in ${source}. Try a clearer image, or paste the text.`)
    else setMsg('')
    setRows((prev) => [...prev, ...found])
  }

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setMsg('')
    try {
      for (const f of Array.from(files)) {
        const text = await extractText(f, setBusy)
        ingest(text, f.name)
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not read that file.')
    } finally {
      setBusy('')
    }
  }

  const patch = (id: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)))
  const picked = rows.filter((r) => r.on)
  const inc = picked.filter((r) => r.type === 'income').reduce((a, r) => a + r.amount, 0)
  const out = picked.filter((r) => r.type === 'spend').reduce((a, r) => a + r.amount, 0)

  const commit = () => {
    update((s) => ({
      ...s,
      txs: [...picked.map((r) => ({ id: uid(), date: r.date, type: r.type, amount: r.amount, category: r.category, note: r.desc })), ...s.txs],
    }))
    setMsg(`Imported ${picked.length} transactions: +${vnd(inc)} income, −${vnd(out)} spending.`)
    setRows([])
  }

  const shown = rows.filter((r) => filter === 'all' || r.type === filter)

  return (
    <section className="panel">
      <h2>Import from Bank</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Add statement PDFs or screenshots of your banking app. They are read on this device and never uploaded. You review every row before it is saved.
      </p>
      <label className="btn filebtn">
        Choose PDF / screenshots
        <input type="file" accept="application/pdf,image/*" multiple hidden onChange={(e) => { void onFiles(e.target.files); e.target.value = '' }} />
      </label>
      <details className="paste">
        <summary>Or paste statement text</summary>
        <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={4} placeholder={'25/10/2026 Luong thang 10 +15.000.000\n26/10/2026 Highlands Coffee -45.000'} />
        <button className="btn small" onClick={() => { ingest(paste, 'pasted text'); setPaste('') }} disabled={!paste.trim()}>
          Read text
        </button>
      </details>
      {busy && <p className="muted">⏳ {busy}</p>}
      {msg && <p className={msg.startsWith('Imported') ? 'pos' : 'neg'}>{msg}</p>}

      {rows.length > 0 && (
        <>
          <div className="seg" style={{ marginTop: 12 }}>
            {(['all', 'income', 'spend'] as Filter[]).map((f) => (
              <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
                {f}
              </button>
            ))}
          </div>
          <div className="imp">
            {shown.map((r) => (
              <div key={r.id} className={`improw ${r.on ? '' : 'off'}`}>
                <div className="imptop">
                  <input type="checkbox" checked={r.on} onChange={(e) => patch(r.id, { on: e.target.checked })} aria-label="Include" />
                  <input type="date" value={r.date} onChange={(e) => patch(r.id, { date: e.target.value })} />
                  <button
                    className={`tag ${r.type}`}
                    onClick={() => patch(r.id, { type: r.type === 'income' ? 'spend' : 'income', category: 'Other', sure: true })}
                    title="Switch between income and spending"
                  >
                    {r.type === 'income' ? '＋ in' : '− out'}
                  </button>
                  <input
                    className="amt"
                    inputMode="numeric"
                    value={r.amount.toLocaleString('vi-VN')}
                    onChange={(e) => patch(r.id, { amount: Number(e.target.value.replace(/\D/g, '')) })}
                    aria-label="Amount in VND"
                  />
                </div>
                <div className="imptop">
                  <input value={r.desc} onChange={(e) => patch(r.id, { desc: e.target.value })} aria-label="Description" />
                  <select value={r.category} onChange={(e) => patch(r.id, { category: e.target.value })}>
                    {(r.type === 'income' ? INCOME_CATS : SPEND_CATS).map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
                {(r.dup || !r.sure) && <small className="warn">{r.dup ? 'Looks like a duplicate of one you already have' : 'In or out unclear: check the badge'}</small>}
              </div>
            ))}
          </div>
          <p className="muted">
            {picked.length} of {rows.length} selected · +{vnd(inc)} · −{vnd(out)}
          </p>
          <div className="row">
            <button className="btn" onClick={commit} disabled={picked.length === 0}>
              Import {picked.length}
            </button>
            <button className="btn danger" style={{ marginTop: 0 }} onClick={() => setRows([])}>
              Discard
            </button>
          </div>
        </>
      )}
    </section>
  )
}
