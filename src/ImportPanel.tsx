import { useState } from 'react'
import { T } from './labels'
import { extractText } from './extract'
import { looksLikeCard, parseStatement, type StatementRow } from './statement'
import { silence } from './feedback'
import { INCOME_CATS, IMPORTED, SPEND_CATS, byNewest, isImported, persistState, uid, vnd, type State, type Tx } from './store'

type Update = (fn: (s: State) => State) => void
type Row = StatementRow & { on: boolean; dup: boolean }
type Filter = 'all' | 'income' | 'spend'

export default function ImportPanel({ state, update }: { state: State; update: Update }) {
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [paste, setPaste] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [card, setCard] = useState(false)
  const [pw, setPw] = useState<{ file: string; wrong: boolean; resolve: (p: string | null) => void } | null>(null)
  const [pwText, setPwText] = useState('')
  const askPassword = (file: string, wrong: boolean) => new Promise<string | null>((resolve) => setPw({ file, wrong, resolve }))

  const existing = new Set(state.txs.map((t) => `${t.date}|${t.type}|${t.amount}`))
  const markDup = (r: StatementRow): Row => {
    const dup = existing.has(`${r.date}|${r.type}|${r.amount}`)
    return { ...r, dup, on: !dup && r.sure && !r.skip }
  }

  const ingest = (text: string, source: string) => {
    const asCard = card || looksLikeCard(text)
    const found = parseStatement(text, new Date(), { card: asCard }).map(markDup)
    if (found.length === 0) setMsg(`No transactions found in ${source}. Try a clearer image or the PDF, or paste the text.`)
    else setMsg(asCard ? 'Read as a credit card statement: purchases count as spending, and payments to the card are left unticked.' : '')
    setRows((prev) => [...prev, ...found])
  }

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setMsg('')
    try {
      for (const f of Array.from(files)) {
        const text = await extractText(f, setBusy, askPassword)
        ingest(text, f.name)
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not read that file.')
    } finally {
      setBusy('')
    }
  }

  const importedCount = state.txs.filter(isImported).length

  /** Merge a history file (a list of transactions with fixed ids): nothing is replaced, repeats are skipped. */
  const addHistory = async (file?: File) => {
    if (!file) return
    setMsg('')
    setBusy('Reading the history file…')
    try {
      const data = JSON.parse(await file.text())
      const list: unknown[] = Array.isArray(data?.txs) ? data.txs : []
      const have = new Set(state.txs.map((t) => t.id))
      const fresh: Tx[] = []
      let dup = 0
      let bad = 0
      for (const x of list) {
        const t = x as Partial<Tx>
        const ok = t && typeof t.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.date ?? '') && (t.type === 'income' || t.type === 'spend') && Number.isFinite(t.amount) && (t.amount as number) > 0
        if (!ok) { bad++; continue }
        if (have.has(t.id as string)) { dup++; continue }
        have.add(t.id as string)
        const cats = t.type === 'income' ? INCOME_CATS : SPEND_CATS
        fresh.push({ id: t.id as string, rid: IMPORTED, date: t.date as string, type: t.type as Tx['type'], amount: Math.round(t.amount as number), category: cats.includes(t.category as string) ? (t.category as string) : 'Other', note: String(t.note ?? '').slice(0, 80) })
      }
      if (!fresh.length) {
        setMsg(list.length ? `Nothing new: all ${dup.toLocaleString()} transactions in that file are already here.` : 'That file has no transactions. Is it a Tactics Ledger history file?')
        return
      }
      const dates = fresh.map((t) => t.date).sort()
      const sum = (k: Tx['type']) => fresh.filter((t) => t.type === k).reduce((a, t) => a + t.amount, 0)
      const ask = [`Add ${fresh.length.toLocaleString()} transactions from ${dates[0]} to ${dates[dates.length - 1]}?`, `Income ${vnd(sum('income'))} · spending ${vnd(sum('spend'))}`, dup ? `${dup.toLocaleString()} already here will be skipped.` : '', 'Nothing you have now is replaced or changed.'].filter(Boolean).join('\n')
      if (!window.confirm(ask)) { setMsg('Cancelled. Nothing was added.'); return }
      setBusy(`Saving ${fresh.length.toLocaleString()} transactions…`)
      await new Promise((r) => setTimeout(r, 60)) // let the message paint before the one-off compression
      const next: State = { ...state, txs: [...state.txs, ...fresh].sort(byNewest) }
      if (!persistState(next)) {
        setMsg('This browser has no room to store the history, so nothing was added. Try the same file on another browser or device.')
        return
      }
      silence.on = true // old history is not a string of level-ups
      update(() => next)
      setMsg(`Added ${fresh.length.toLocaleString()} transactions${dup ? `, skipped ${dup.toLocaleString()} repeats` : ''}${bad ? `, ignored ${bad} invalid rows` : ''}. Use the month picker below to browse them.`)
    } catch {
      setMsg('Could not read that file. It should be the "Tactics Ledger - history import.json" file.')
    } finally {
      setBusy('')
    }
  }

  const removeHistory = () => {
    if (!window.confirm(`Remove all ${importedCount.toLocaleString()} imported history transactions? Anything you recorded yourself stays.`)) return
    silence.on = true
    update((s2) => ({ ...s2, txs: s2.txs.filter((t) => !isImported(t)) }))
    setMsg('Imported history removed.')
  }

  const patch = (id: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)))
  const picked = rows.filter((r) => r.on)
  const inc = picked.filter((r) => r.type === 'income').reduce((a, r) => a + r.amount, 0)
  const out = picked.filter((r) => r.type === 'spend').reduce((a, r) => a + r.amount, 0)

  const commit = () => {
    silence.on = true // a statement full of transactions is not a string of level-ups
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
      <h2>{T('Import from Bank')}</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Upload a bank or credit card statement (PDF) or a screenshot, straight from your phone's Files or Photos. It is read on this device and never uploaded, and you review every row before it is saved.
      </p>
      <label className="btn filebtn">
        Upload statement (PDF or photo)
        <input type="file" accept="application/pdf,image/*" multiple hidden onChange={(e) => { void onFiles(e.target.files); e.target.value = '' }} />
      </label>
      <label className="row alert-row" style={{ marginTop: 8 }}>
        <input type="checkbox" checked={card} onChange={(e) => setCard(e.target.checked)} />
        <span>This is a credit card statement (also detected automatically)</span>
      </label>
      {pw && (
        <form
          className="stack"
          style={{ marginTop: 8 }}
          onSubmit={(e) => {
            e.preventDefault()
            pw.resolve(pwText)
            setPw(null)
            setPwText('')
          }}
        >
          <p className={pw.wrong ? 'neg' : 'muted'} style={{ margin: 0 }}>
            {pw.wrong ? 'That password did not work. Try again:' : `${pw.file} is password-protected. Enter its password (it is not stored):`}
          </p>
          <input type="password" value={pwText} onChange={(e) => setPwText(e.target.value)} autoComplete="off" autoFocus aria-label="PDF password" />
          <div className="row">
            <button className="btn" type="submit" disabled={!pwText}>
              Open
            </button>
            <button className="btn danger" type="button" style={{ marginTop: 0 }} onClick={() => { pw.resolve(null); setPw(null); setPwText('') }}>
              Cancel
            </button>
          </div>
        </form>
      )}
      <details className="paste">
        <summary>Or paste statement text</summary>
        <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={4} placeholder={'25/10/2026 Luong thang 10 +15.000.000\n26/10/2026 Highlands Coffee -45.000'} />
        <button className="btn small" onClick={() => { ingest(paste, 'pasted text'); setPaste('') }} disabled={!paste.trim()}>
          Read text
        </button>
      </details>
      <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
        <label className="btn small filebtn">
          Add a history file (.json)
          <input type="file" accept=".json,application/json" hidden onChange={(e) => { void addHistory(e.target.files?.[0]); e.target.value = '' }} />
        </label>
        {importedCount > 0 && (
          <button className="btn small danger" style={{ marginTop: 0 }} onClick={removeHistory}>
            Remove imported history ({importedCount.toLocaleString()})
          </button>
        )}
      </div>
      <p className="muted" style={{ margin: '6px 0 0' }}>
        {importedCount > 0
          ? `${importedCount.toLocaleString()} imported transactions are stored on this device only. They give no XP and are not synced.`
          : 'For a long history from a spreadsheet: it is merged in, never replaces anything.'}
      </p>
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
                {(r.dup || !r.sure || r.hint) && <small className="warn">{r.dup ? 'Looks like a duplicate of one you already have' : r.hint ?? 'In or out unclear: check the badge'}</small>}
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
