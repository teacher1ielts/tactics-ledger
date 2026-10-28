// Three-way merge for cloud sync. Pure: no DOM, no React.
//
// base   = the state both sides agreed on at the last sync
// local  = this device now,  remote = the cloud copy now
// Anything added anywhere is kept; anything deleted on one side stays deleted;
// edits on one side win over the other side's unchanged copy; true conflicts favour this device.
import type { State } from './store'

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
type Rec = { id: string } & Record<string, unknown>

/** Sets of strings or JSON-comparable values (habit check-ins, savings deposits). */
function mergeSet<T>(base: T[] | undefined, loc: T[], rem: T[]): T[] {
  const key = (x: T) => JSON.stringify(x)
  const b = new Set((base ?? []).map(key))
  const l = new Map(loc.map((x) => [key(x), x]))
  const r = new Map(rem.map((x) => [key(x), x]))
  const out: T[] = []
  for (const [k, v] of [...l, ...r]) {
    if (out.some((o) => key(o) === k)) continue
    const inL = l.has(k)
    const inR = r.has(k)
    if (inL && inR) out.push(v)
    else if (!b.has(k)) out.push(v) // new on one side
    // present in base but missing on one side: it was removed there, so stay removed
  }
  return out
}

function mergeFields(b: Rec | undefined, l: Rec, r: Rec): Rec {
  const out: Record<string, unknown> = {}
  for (const k of new Set([...Object.keys(l), ...Object.keys(r)])) {
    const lv = l[k]
    const rv = r[k]
    const bv = b?.[k]
    if ((k === 'done' || k === 'deposits') && (Array.isArray(lv) || Array.isArray(rv))) out[k] = mergeSet(bv as unknown[] | undefined, (lv ?? []) as unknown[], (rv ?? []) as unknown[])
    else if (k === 'milestones') out[k] = mergeById((bv ?? []) as Rec[], (lv ?? []) as Rec[], (rv ?? []) as Rec[])
    else if (eq(lv, rv)) out[k] = lv
    else if (b && eq(lv, bv)) out[k] = rv // only the cloud changed it
    else out[k] = lv // changed here (or both): this device wins
    if (out[k] === undefined) delete out[k]
  }
  return out as Rec
}

export function mergeById<T extends { id: string }>(base: T[], loc: T[], rem: T[]): T[] {
  const B = new Map(base.map((x) => [x.id, x]))
  const L = new Map(loc.map((x) => [x.id, x]))
  const R = new Map(rem.map((x) => [x.id, x]))
  const order = [...new Set([...L.keys(), ...R.keys()])]
  const out: T[] = []
  for (const id of order) {
    const b = B.get(id)
    const l = L.get(id)
    const r = R.get(id)
    if (l && r) out.push(eq(l, r) ? l : (mergeFields(b as Rec | undefined, l as unknown as Rec, r as unknown as Rec) as unknown as T))
    else if (l) {
      // gone from the cloud: a delete, unless this device edited it since
      if (!b || !eq(l, b)) out.push(l)
    } else if (r) {
      if (!b || !eq(r, b)) out.push(r)
    }
  }
  return out
}

export function mergeState(base: State | null, local: State, remote: State): State {
  const b = base ?? { habits: [], txs: [], budget: 0, goals: [], events: [] }
  return {
    habits: mergeById(b.habits ?? [], local.habits ?? [], remote.habits ?? []),
    txs: mergeById(b.txs ?? [], local.txs ?? [], remote.txs ?? []).sort((x, y) => (y.date > x.date ? 1 : y.date < x.date ? -1 : 0)),
    goals: mergeById(b.goals ?? [], local.goals ?? [], remote.goals ?? []),
    events: mergeById(b.events ?? [], local.events ?? [], remote.events ?? []),
    budget: eq(local.budget, remote.budget) ? local.budget : base ? (eq(local.budget, b.budget) ? remote.budget : local.budget) : local.budget || remote.budget,
  }
}

/** JSON with sorted keys, so two equal states always compare equal regardless of key order. */
export function stable(x: unknown): string {
  return JSON.stringify(x, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v))
}

export const isEmptyState = (s: State) => !s.habits?.length && !s.txs?.length && !s.goals?.length && !s.events?.length && !s.budget
