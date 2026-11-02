// Archetype: what kind of hero your real activity is turning you into. Pure and derived, so nothing is stored or synced.
import { JOBS, dayKey, shiftDay, type Job, type State } from './store'

const JOB_LIST = Object.keys(JOBS) as Job[]
export const STEPS = [20, 50, 100] // lifetime clears that unlock each form of a path

const FORMS: Record<Job, string[]> = {
  Scholar: ['Student', 'Scholar', 'Sage', 'Archmage'],
  Knight: ['Squire', 'Knight', 'Paladin', 'Champion'],
  Monk: ['Acolyte', 'Monk', 'Mystic', 'Enlightened'],
  Merchant: ['Peddler', 'Merchant', 'Broker', 'Tycoon'],
}
const HYBRID: Record<string, string> = {
  'Scholar+Knight': 'Battle Mage',
  'Scholar+Monk': 'Oracle',
  'Scholar+Merchant': 'Strategist',
  'Knight+Monk': 'Warrior Monk',
  'Knight+Merchant': 'Captain of Fortune',
  'Monk+Merchant': 'Alchemist',
}
export const WHAT: Record<Job, string> = {
  Scholar: 'study and learning habits',
  Knight: 'training and discipline habits',
  Monk: 'calm and recovery habits',
  Merchant: 'money habits and every transaction you log',
}

export const AXIS: Record<Job, string> = { Scholar: 'Mind', Knight: 'Body', Monk: 'Spirit', Merchant: 'Wealth' }

export const FLAVOR: Record<string, string> = {
  Student: 'You have started to learn on purpose.',
  Scholar: 'Learning is now a habit, not a mood.',
  Sage: 'You see patterns others miss.',
  Archmage: 'Knowledge bends to you.',
  Squire: 'You showed up to train.',
  Knight: 'Discipline carries you when motivation does not.',
  Paladin: 'Your effort protects your future.',
  Champion: 'Nothing stops you now.',
  Acolyte: 'You learned to pause.',
  Monk: 'Calm is part of your routine.',
  Mystic: 'You are steady when others are not.',
  Enlightened: 'Peace you built yourself.',
  Peddler: 'You started watching your money.',
  Merchant: 'Every coin has a place.',
  Broker: 'You make money work for you.',
  Tycoon: 'Your finances run like a fortress.',
  'Battle Mage': 'Mind and body, trained together.',
  Oracle: 'Study and stillness give you foresight.',
  Strategist: 'You learn, then you invest it.',
  'Warrior Monk': 'Strength with a calm centre.',
  'Captain of Fortune': 'Discipline that pays.',
  Alchemist: 'You turn calm into wealth.',
  Paragon: 'Mind, body, spirit and wealth in balance.',
  Wanderer: 'The road is still open.',
}

export interface CodexEntry {
  name: string
  jobs: Job[]
  tier: number // 0-3 for path forms, -1 for hybrids, -2 for Paragon, -3 for Wanderer
  clue: string
}
const pairKey = (a: Job, b: Job) => [a, b].sort((x, y) => JOB_LIST.indexOf(x) - JOB_LIST.indexOf(y)).join('+')
export const CODEX: CodexEntry[] = [
  ...JOB_LIST.flatMap((job) => FORMS[job].map((name, tier) => ({ name, jobs: [job], tier, clue: tier === 0 ? `Tick your first ${job} habit.` : `Reach ${STEPS[tier - 1]} ${job} clears.` }))),
  { name: 'Wanderer', jobs: [], tier: -3, clue: 'Where everyone starts.' },
  ...Object.entries(HYBRID).map(([k, name]) => {
    const [x, y] = k.split('+') as Job[]
    return { name, jobs: [x, y], tier: -1, clue: `Grow ${x} and ${y} together: 20+ clears each, within half of each other.` }
  }),
  { name: 'Paragon', jobs: [...JOB_LIST], tier: -2, clue: 'Reach 50 clears on all four paths.' },
]

export interface PathInfo {
  job: Job
  total: number // lifetime clears
  recent: number // clears in the last 30 days
  tier: number // 0-3
  form: string
}
export interface Archetype {
  name: string // current archetype
  kind: 'new' | 'single' | 'hybrid' | 'paragon'
  blurb: string
  paths: PathInfo[] // sorted, strongest first
  next: string // what to do to evolve
  trend: string // what the last 30 days say
  titles: string[] // every form the user has reached, for evolution celebrations
  orientation: string // plain-language lean, e.g. "Mind-led, with Wealth rising"
}

/** Where you lean: the strongest axis, and which one is rising or fading against your lifetime shape. */
function orientationOf(paths: PathInfo[]): string {
  const sum = paths.reduce((x, p) => x + p.total, 0)
  if (sum < 5) return 'Not enough activity yet to read a lean. Use the app for a few days.'
  const rsum = paths.reduce((x, p) => x + p.recent, 0) || 1
  const [a, b] = paths
  const lead = a.total >= b.total * 1.6 ? `${AXIS[a.job]}-led` : `Balanced between ${AXIS[a.job]} and ${AXIS[b.job]}`
  const shift = paths.map((p) => ({ p, d: p.recent / rsum - p.total / sum })).sort((x, y) => y.d - x.d)[0]
  return shift.d > 0.12 && rsum >= 3 && shift.p.job !== a.job ? `${lead}, with ${AXIS[shift.p.job]} rising` : lead
}

const tierOf = (n: number) => (n >= STEPS[2] ? 3 : n >= STEPS[1] ? 2 : n >= STEPS[0] ? 1 : 0)

export function pathsOf(s: State): PathInfo[] {
  const since = shiftDay(dayKey(), -29)
  return JOB_LIST.map((job) => {
    const habits = s.habits.filter((h) => h.job === job)
    let total = habits.reduce((a, h) => a + h.done.length, 0)
    let recent = habits.reduce((a, h) => a + h.done.filter((d) => d >= since).length, 0)
    if (job === 'Merchant') {
      const real = s.txs.filter((t) => !t.rid)
      total += real.length
      recent += real.filter((t) => t.date >= since).length
    }
    const tier = tierOf(total)
    return { job, total, recent, tier, form: FORMS[job][tier] }
  }).sort((a, b) => b.total - a.total)
}

/** Every form your activity has earned so far (the Codex shows these as discovered). */
export function earnedOf(paths: PathInfo[]): string[] {
  const out = ['Wanderer']
  for (const p of paths) {
    if (p.total >= 1) out.push(FORMS[p.job][0])
    for (let t = 1; t <= p.tier; t++) out.push(FORMS[p.job][t])
  }
  for (const [i, x] of paths.entries())
    for (const y of paths.slice(i + 1)) {
      const hi = Math.max(x.total, y.total)
      if (Math.min(x.total, y.total) >= STEPS[0] && Math.min(x.total, y.total) >= hi * 0.5) out.push(HYBRID[pairKey(x.job, y.job)])
    }
  if (paths.every((p) => p.total >= STEPS[1])) out.push('Paragon')
  return out
}

export function archetypeOf(s: State): Archetype {
  const paths = pathsOf(s)
  const [a, b] = paths
  const sum = paths.reduce((x, p) => x + p.total, 0)
  const titles = earnedOf(paths).filter((n) => n !== 'Wanderer' && !JOB_LIST.some((j) => FORMS[j][0] === n))

  let name: string
  let kind: Archetype['kind']
  let blurb: string
  if (sum < STEPS[0]) {
    name = 'Wanderer'
    kind = 'new'
    blurb = 'You have not settled on a path yet. Your habits and what you log decide what you become.'
  } else if (paths.every((p) => p.total >= STEPS[1])) {
    name = 'Paragon'
    kind = 'paragon'
    blurb = 'All four paths are strong. Study, training, calm and money are all in balance.'
  } else if (b.total >= STEPS[0] && b.total >= a.total * 0.5) {
    name = HYBRID[[a.job, b.job].sort((x, y) => JOB_LIST.indexOf(x) - JOB_LIST.indexOf(y)).join('+')]
    kind = 'hybrid'
    blurb = `A blend of ${a.job} and ${b.job}. You train two sides at once, so you evolve as both.`
  } else {
    name = a.form
    kind = 'single'
    blurb = `A ${a.job} path: ${WHAT[a.job]}.`
  }

  // what moves the archetype forward
  let next: string
  if (kind === 'new') next = `${STEPS[0] - sum} more clears (habit ticks or logged transactions) and a path forms.`
  else if (kind === 'paragon') next = 'Keep all four above 100 clears for the top form of each.'
  else {
    const toTier = a.tier < 3 ? STEPS[a.tier] - a.total : 0
    const grow = a.tier < 3 ? `${toTier} more ${a.job} clears to become a ${FORMS[a.job][a.tier + 1]}` : `${a.job} is at its top form (${a.form})`
    if (kind === 'single') {
      const need = Math.max(STEPS[0] - b.total, Math.ceil(a.total * 0.5) - b.total, 1)
      next = `${grow}. Or ${need} more ${b.job} clears to blend into a ${HYBRID[[a.job, b.job].sort((x, y) => JOB_LIST.indexOf(x) - JOB_LIST.indexOf(y)).join('+')]}.`
    } else next = `${grow}.`
  }

  // what the last 30 days say
  const hot = [...paths].sort((x, y) => y.recent - x.recent)[0]
  const trend = hot.recent < 3 ? 'Quiet in the last 30 days. A few clears will show where you are heading.' : hot.job === a.job || kind === 'new' ? `Last 30 days: mostly ${hot.job} (${hot.recent} clears). You are doubling down.` : `Last 30 days: mostly ${hot.job} (${hot.recent} clears) while your main path is ${a.job}. You are drifting toward ${hot.job}.`

  return { name, kind, blurb, paths, next, trend, titles: [...new Set(titles)], orientation: orientationOf(paths) }
}
