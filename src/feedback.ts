import { useEffect, useRef, useState } from 'react'
import { play } from './sfx'
import { GEAR, goalProgress, levelOf, partyOf, xpOf, type State } from './store'

/** Set before applying data that arrived from the cloud, so it is absorbed without celebrations. */
export const silence = { on: false }

export interface Burst {
  id: string
  kind: 'rank' | 'hero' | 'level' | 'quest'
  title: string
  sub: string
  color: string
}

const COLOR: Record<string, string> = { Scholar: '#00f0ff', Knight: '#ff2bd6', Monk: '#39ff88', Merchant: '#fcee0a' }

interface Peak {
  level: number
  heroes: Record<string, { level: number; tier: number }>
  goals: string[]
}
const KEY = 'tl-peak'

function snapshot(s: State): Peak {
  return {
    level: levelOf(xpOf(s)).level,
    heroes: Object.fromEntries(partyOf(s).map((p) => [p.job, { level: p.level, tier: p.tier }])),
    goals: s.goals.filter((g) => goalProgress(g, s).pct >= 1).map((g) => g.id),
  }
}
function readPeak(): Peak | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null')
  } catch {
    return null
  }
}
const writePeak = (p: Peak) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* ignore */
  }
}
const merge = (a: Peak | null, b: Peak): Peak => ({
  level: Math.max(a?.level ?? 0, b.level),
  heroes: Object.fromEntries(Object.keys(b.heroes).map((j) => [j, { level: Math.max(a?.heroes?.[j]?.level ?? 0, b.heroes[j].level), tier: Math.max(a?.heroes?.[j]?.tier ?? 0, b.heroes[j].tier) }])),
  goals: [...new Set([...(a?.goals ?? []), ...b.goals])],
})

/**
 * Watches the app state and plays a sound for what just happened. Level-ups, rank-ups and
 * finished quests are only celebrated once: a high-water mark stops "untick then tick again"
 * from replaying them, and whatever existed when the app first loaded is absorbed silently.
 */
export function useFeedback(state: State) {
  const [bursts, setBursts] = useState<Burst[]>([])
  const prev = useRef<{ clears: number; txs: number } | null>(null)
  const peak = useRef<Peak | null>(null)

  useEffect(() => {
    const snap = snapshot(state)
    const clears = state.habits.reduce((a, h) => a + h.done.length, 0)
    const txs = state.txs.length

    if (!peak.current) {
      peak.current = merge(readPeak(), snap)
      writePeak(peak.current)
      prev.current = { clears, txs }
      return
    }

    if (silence.on) {
      silence.on = false
      peak.current = merge(peak.current, snap)
      writePeak(peak.current)
      prev.current = { clears, txs }
      return
    }

    const pk = peak.current
    const found: Burst[] = []
    const id = () => Math.random().toString(36).slice(2, 8)

    for (const p of partyOf(state)) {
      const old = pk.heroes[p.job] ?? { level: 0, tier: 0 }
      if (p.tier > old.tier) found.push({ id: id(), kind: 'rank', title: 'RANK UP', sub: `${p.job.toUpperCase()} → ${p.rank}  ·  ${GEAR[p.tier]} unlocked`, color: COLOR[p.job] })
      else if (p.level > old.level) found.push({ id: id(), kind: 'hero', title: 'LEVEL UP', sub: `${p.job.toUpperCase()} reached Lv ${p.level}`, color: COLOR[p.job] })
    }
    for (const g of state.goals) {
      if (goalProgress(g, state).pct >= 1 && !pk.goals.includes(g.id)) found.push({ id: id(), kind: 'quest', title: 'QUEST COMPLETE', sub: g.name, color: '#fcee0a' })
    }
    if (snap.level > pk.level) found.push({ id: id(), kind: 'level', title: 'COMMANDER LEVEL UP', sub: `You are now Lv ${snap.level}`, color: '#ff2bd6' })

    peak.current = merge(pk, snap)
    writePeak(peak.current)

    const was = prev.current
    prev.current = { clears, txs }

    if (found.length) {
      play(found.some((b) => b.kind === 'rank') ? 'rankup' : found.some((b) => b.kind === 'quest') ? 'quest' : 'levelup')
      try {
        navigator.vibrate?.([40, 50, 90])
      } catch {
        /* ignore */
      }
      setBursts((b) => [...b, ...found].slice(0, 4))
    } else if (was && clears > was.clears) play('tick')
    else if (was && txs > was.txs) play('coin')
  }, [state])

  return { bursts, next: () => setBursts((b) => b.slice(1)) }
}
