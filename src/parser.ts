// Rule-based English/Vietnamese command parser. Pure: no DOM, no React.
import type { Habit, Job } from './store'

export type Parsed =
  | { kind: 'tx'; type: 'income' | 'spend'; amount: number; category: string; note: string }
  | { kind: 'event'; title: string; date: string; start: number; dur: number }
  | { kind: 'task'; title: string; dur: number; deadline?: string }
  | { kind: 'habit-new'; name: string; job: Job; time?: number; dur?: number }
  | { kind: 'habit-done'; habitId: string; name: string; date: string }
  | { kind: 'goal-new'; name: string; term: 'short' | 'long'; gkind: 'habit' | 'savings' | 'manual'; target: number; period?: 'week'; habitId?: string; habitName?: string; job?: Job; deadline?: string }
  | { kind: 'unknown'; text: string }

type Span = [number, number]

const pad = (n: number) => String(n).padStart(2, '0')
const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

const MAP: Record<string, string> = { đ: 'd', Đ: 'D' }
/** Lowercase, strip Vietnamese diacritics. Length-preserving so spans map back to the original text. */
export function fold(s: string): string {
  return [...s.normalize('NFC')].map((c) => MAP[c] ?? c.normalize('NFD').replace(/[̀-ͯ]/g, '')).join('').toLowerCase()
}

const blank = (n: string, spans: Span[]) => {
  const a = n.split('')
  spans.forEach(([s, e]) => a.fill(' ', s, e))
  return a.join('')
}
const cut = (o: string, spans: Span[]) => {
  const keep = o.split('')
  spans.forEach(([s, e]) => keep.fill('\u0000', s, e))
  return keep.filter((c) => c !== '\u0000').join('')
}

/* ---------- money ---------- */
const MONEY = /(?<![\d.,])(\d+(?:[.,]\d+)*)\s*(k|nghin|ngan|tr|trieu|million|vnd|dong|d)\b(\s*ruoi)?/
const BARE = /(?<![\d.,:])(\d{1,3}(?:[.,]\d{3})+|\d{4,})(?![\d.,:])/
const UNIT: Record<string, number> = { k: 1e3, nghin: 1e3, ngan: 1e3, tr: 1e6, trieu: 1e6, million: 1e6, vnd: 1, dong: 1, d: 1 }

function toNumber(raw: string, hasUnit: boolean): number {
  if (!hasUnit && /[.,]\d{3}/.test(raw)) return Number(raw.replace(/[.,]/g, ''))
  const t = raw.replace(/\.(?=.*[.,])|,(?=.*[.,])/g, '') // keep only the last separator
  return Number(t.replace(',', '.'))
}

function findMoney(n: string, cue: boolean): { amount: number; span: Span } | null {
  const m = MONEY.exec(n)
  if (m) {
    const factor = UNIT[m[2]]
    let v = toNumber(m[1], factor !== 1) * factor
    if (m[3]) v += factor / 2
    if (m[2] === 'd' && v < 1000) return findBare(n, cue)
    return { amount: Math.round(v), span: [m.index, m.index + m[0].length] }
  }
  return findBare(n, cue)
}
function findBare(n: string, cue: boolean) {
  if (!cue) return null
  const b = BARE.exec(n)
  if (!b) return null
  const v = toNumber(b[1], false)
  return v >= 1000 ? { amount: v, span: [b.index, b.index + b[0].length] as Span } : null
}

const INCOME_RE = /\b(luong|thu nhap|nhan duoc|nhan tien|nhan|received|earned|got paid|paid me|salary|income|bonus|thuong|sold|ban duoc|thu ve|deposit|refund|hoan tien)\b/
const SPEND_RE = /\b(spent|spend|paid|pay|bought|buy|cost|chi|tieu|mua|tra|het|ton)\b/
const CUE_RE = /\b(spent|spend|paid|pay|bought|buy|cost|chi|tieu|mua|tra|het|ton|nhan|luong|received|earned|salary|income|bonus|thuong|got)\b/

const CATS: [string, RegExp][] = [
  ['Bills', /\b(tien dien|tien nuoc|tien nha|thue nha|internet|wifi|dien thoai|phone bill|bill|utilities|electric|rent|hoa don)\b/],
  ['Health', /\b(thuoc|kham|benh vien|doctor|pharmacy|hospital|nha khoa|dentist|medicine|vitamin|y te)\b/],
  ['Study', /\b(sach|book|hoc phi|khoa hoc|course|tuition|ielts|exam|lop|class|udemy)\b/],
  ['Transport', /\b(grab|xang|taxi|uber|be|bus|gas|fuel|petrol|flight|ve may bay|train|gui xe|parking|xe)\b/],
  ['Fun', /\b(phim|cinema|movie|game|karaoke|party|nhau|du lich|travel|concert|netflix|spotify|nhac)\b/],
  ['Food', /\b(an|com|pho|bun|cafe|ca phe|coffee|tra sua|lunch|dinner|breakfast|food|nuoc|bia|restaurant|quan|tea|snack|banh|trua|toi|sang)\b/],
  ['Shopping', /\b(mua|quan ao|giay|shop|shopping|clothes|shoes|lazada|shopee|bought|buy)\b/],
]
const INCOME_CATS: [string, RegExp][] = [
  ['Salary', /\b(luong|salary|payroll)\b/],
  ['Teaching', /\b(day|teach\w*|tutor\w*|lesson\w*|hoc vien|student\w*|giang)\b/],
  ['Gift', /\b(li xi|gift|qua|tang|birthday|sinh nhat)\b/],
]
export function categoryOf(text: string, type: 'income' | 'spend'): string {
  const n = fold(text)
  const hit = (type === 'income' ? INCOME_CATS : CATS).find(([, re]) => re.test(n))
  return hit ? hit[0] : 'Other'
}

/* ---------- duration ---------- */
const NUMW: Record<string, number> = { mot: 1, hai: 2, ba: 3, bon: 4, nam: 5, one: 1, two: 2, three: 3, four: 4, five: 5, a: 1, an: 1 }
const NUM = '(\\d+(?:[.,]\\d+)?|mot|hai|ba|bon|nam|one|two|three|four|five|an?)'
const D1 = new RegExp(`\\b(?:for|trong|keo dai|khoang|mat)\\s+${NUM}\\s*(hours?|hrs?|h|gio|tieng|minutes?|mins?|phut)\\b`)
const D2 = new RegExp(`\\b${NUM}\\s*(hours?|hrs?|tieng|minutes?|mins?|phut)\\b`)
const D3 = /\b(half an hour|half hour|nua tieng|nua gio)\b/

function findDuration(n: string): { min: number; span: Span } | null {
  for (const re of [D1, D2]) {
    const m = re.exec(n)
    if (m) {
      const v = NUMW[m[1]] ?? parseFloat(m[1].replace(',', '.'))
      const min = /^(h|hr|hour|gio|tieng)/.test(m[2]) ? v * 60 : v
      if (min > 0) return { min: Math.round(min), span: [m.index, m.index + m[0].length] }
    }
  }
  const h = D3.exec(n)
  return h ? { min: 30, span: [h.index, h.index + h[0].length] } : null
}

/* ---------- time of day ---------- */
function period(h: number, p?: string): number {
  if (!p) return h
  if (p === 'am' || p === 'sang') return h === 12 ? 0 : h
  if (p === 'pm') return h < 12 ? h + 12 : h
  if (p === 'trua') return h < 11 ? h + 12 : h
  if (p === 'dem') return h === 12 ? 0 : h >= 6 && h < 12 ? h + 12 : h
  return h < 12 ? h + 12 : h // chieu, toi
}
const LB = '(?<![\\d.,:])'
function findTime(n: string, needPrep: boolean): { start: number; span: Span } | null {
  const pre = needPrep ? '(?:(?:at|luc|vao luc|vao|around|about|khoang)\\s+)' : '(?:(?:at|luc|vao luc|vao|around|about|khoang)\\s+)?'
  const pats: [RegExp, (m: RegExpExecArray) => [number, number] | null][] = [
    [new RegExp(`${pre}${LB}(\\d{1,2}):(\\d{2})\\s*(am|pm)?\\b`), (m) => [period(+m[1], m[3]), +m[2]]],
    [new RegExp(`${pre}${LB}(\\d{1,2})\\s*(?:h|gio)\\s*(\\d{2})?\\s*(sang|trua|chieu|toi|dem)?\\b`), (m) => [period(+m[1], m[3]), m[2] ? +m[2] : 0]],
    [new RegExp(`${pre}${LB}(\\d{1,2})\\s*(am|pm)\\b`), (m) => [period(+m[1], m[2]), 0]],
    [new RegExp(`${pre}${LB}(\\d{1,2})\\s*(sang|trua|chieu|toi|dem)\\b`), (m) => [period(+m[1], m[2]), 0]],
  ]
  for (const [re, get] of pats) {
    const m = re.exec(n)
    const hm = m && get(m)
    if (m && hm && hm[0] <= 23 && hm[1] <= 59) return { start: hm[0] * 60 + hm[1], span: [m.index, m.index + m[0].length] }
  }
  return null
}

/* ---------- date ---------- */
const WEEKDAYS: [RegExp, number][] = [
  [/monday|thu hai|thu 2/, 1],
  [/tuesday|thu ba|thu 3/, 2],
  [/wednesday|thu tu|thu 4/, 3],
  [/thursday|thu nam|thu 5/, 4],
  [/friday|thu sau|thu 6/, 5],
  [/saturday|thu bay|thu 7/, 6],
  [/sunday|chu nhat|cn/, 0],
]
const WD_RE = new RegExp(`\\b(?:(next|tuan sau)\\s+)?(${WEEKDAYS.map(([r]) => r.source).join('|')})\\b`)

function findDate(n: string, now: Date, allowYesterday = false): { date: string; span: Span; tonight?: boolean } | null {
  let m: RegExpExecArray | null
  if ((m = /\b(day after tomorrow|ngay kia|ngay mot)\b/.exec(n))) return { date: fmt(addDays(now, 2)), span: [m.index, m.index + m[0].length] }
  if ((m = /\b(tomorrow|tmrw|tmr|ngay mai|mai)\b/.exec(n))) return { date: fmt(addDays(now, 1)), span: [m.index, m.index + m[0].length] }
  if (allowYesterday && (m = /\b(yesterday|hom qua)\b/.exec(n))) return { date: fmt(addDays(now, -1)), span: [m.index, m.index + m[0].length] }
  if ((m = /\b(tonight|toi nay)\b/.exec(n))) return { date: fmt(now), span: [m.index, m.index + m[0].length], tonight: true }
  if ((m = /\b(today|hom nay)\b/.exec(n))) return { date: fmt(now), span: [m.index, m.index + m[0].length] }
  if ((m = WD_RE.exec(n))) {
    const target = WEEKDAYS.find(([r]) => new RegExp(`^(?:${r.source})$`).test(m![2]))![1]
    let delta = (target - now.getDay() + 7) % 7
    if (m[1] && delta === 0) delta = 7
    return { date: fmt(addDays(now, delta)), span: [m.index, m.index + m[0].length] }
  }
  if ((m = /(?<![\d.,:])(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?(?![\d:])/.exec(n))) {
    const [d, mo] = [+m[1], +m[2]]
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
      const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : now.getFullYear()
      return { date: `${y}-${pad(mo)}-${pad(d)}`, span: [m.index, m.index + m[0].length] }
    }
  }
  if ((m = /\bngay (\d{1,2})\b/.exec(n)) && +m[1] >= 1 && +m[1] <= 31) {
    let d = new Date(now.getFullYear(), now.getMonth(), +m[1])
    if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) d = new Date(now.getFullYear(), now.getMonth() + 1, +m[1])
    return { date: fmt(d), span: [m.index, m.index + m[0].length] }
  }
  return null
}

/* ---------- misc ---------- */
const FILLER =
  /\b(remind me to|remind me|nhac toi|nhac|please|schedule|book|set|add|them|dat lich|i need to|i have to|need to|have to|must|can phai|phai|toi|minh|at|on|vao luc|luc|vao|for|trong|keo dai|khoang|from|spent|spend|paid|pay|bought|buy|chi|tieu|mua|het|nhan duoc|nhan|received|earned|got|new|create|start|tao|moi|habit|thoi quen|every day|daily|moi ngay|hang ngay|did|done|finished|completed|xong|hoan thanh|the|my|cua|toi nay|tonight)\b/g

export function jobOf(n: string): Job {
  if (/\b(gym|run|running|workout|tap|chay|swim|boi|bong|exercise|the duc|muay|thai|box\w*|kick\w*|martial|karate|judo|pilates)\b/.test(n)) return 'Knight'
  if (/\b(meditat\w*|thien|yoga|sleep|ngu|stretch|pray\w*|journal\w*|nhat ky)\b/.test(n)) return 'Monk'
  if (/\b(save|saving|tiet kiem|budget|invest|dau tu|ngan sach)\b/.test(n)) return 'Merchant'
  return 'Scholar'
}

const titleCase = (s: string) => {
  const t = s.replace(/\s+/g, ' ').replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '')
  return t ? t[0].toUpperCase() + t.slice(1) : ''
}

function stripFiller(o: string, n: string, spans: Span[]): string {
  const all = [...spans]
  for (const m of n.matchAll(FILLER)) all.push([m.index!, m.index! + m[0].length])
  return titleCase(cut(o, all))
}

function split(o: string, n: string, habits: Habit[]): string[] {
  const habitWords = habits.flatMap((h) => fold(h.name).split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !/^\d/.test(t)))
  const looksNew = (rhs: string) =>
    /\d|\b(spent|paid|did|done|add|remind|goal|habit|today|tomorrow|mai|hom nay|at|luc|finished|completed|xong|da)\b/.test(rhs) || habitWords.some((w) => new RegExp('\\b' + w).test(rhs))

  const pieces: [string, string][] = []
  let last = 0
  for (const m of n.matchAll(/\s*(?:[;\n]|[,.](?=\s))\s*/g)) {
    pieces.push([o.slice(last, m.index), n.slice(last, m.index)])
    last = m.index! + m[0].length
  }
  pieces.push([o.slice(last), n.slice(last)])

  const out: string[] = []
  for (const [po, pn] of pieces) {
    let from = 0
    for (const m of pn.matchAll(/\s+(and then|then|also|roi|sau do|and|va)\s+/g)) {
      const soft = m[1] === 'and' || m[1] === 'va'
      if (soft && !looksNew(pn.slice(m.index! + m[0].length))) continue
      out.push(po.slice(from, m.index))
      from = m.index! + m[0].length
    }
    out.push(po.slice(from))
  }
  return out.map((x) => x.trim().replace(/[.,;]+$/, '')).filter(Boolean)
}

const DONE_RE = /\b(done|did|finished|completed|checked|tick|xong|da tap|da hoc|da lam|da doc|da chay|da thien|hoan thanh|vua)\b/
const NEWHABIT_RE = /\b(habit|thoi quen)\b/
const NEWCUE_RE = /\b(add|new|create|start|build|them|tao|moi)\b/
const TASK_RE = /\b(remind|todo|to do|task|need to|have to|must|nhac|phai|can phai|deadline|due|finish|complete|write|submit|nop|hoan thanh)\b/

export function matchHabit(n: string, habits: Habit[]): Habit | null {
  let best: Habit | null = null
  let score = 0
  for (const h of habits) {
    const toks = fold(h.name).split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !/^\d/.test(t))
    const s = toks.filter((t) => new RegExp(`\\b${t}`).test(n)).length
    if (s > score) {
      score = s
      best = h
    }
  }
  return best
}

/** "goal ..." / "my goals: ..." / "mục tiêu ..." at the start of a sentence or segment. */
const GOAL_CUE = /^(?:my\s+)?(?:new\s+)?(?:goals?|muc tieu)\b\s*(?:is|are|la)?\s*[:\-]?\s*/

export function parseCommand(text: string, now: Date, habits: Habit[]): Parsed[] {
  const o = text.normalize('NFC')
  const n = fold(o)
  const lead = o.length - o.trimStart().length
  const gm = GOAL_CUE.exec(n.slice(lead))
  const start = gm ? lead + gm[0].length : 0 // one "goal" can introduce a whole list
  return split(o.slice(start), n.slice(start), habits).map((seg) => parseSegment(seg, now, habits, !!gm))
}

function parseSegment(seg: string, now: Date, habits: Habit[], goalMode = false): Parsed {
  const o = seg
  const n = fold(o)

  if (goalMode) return parseGoal(o, n, now, habits)
  const gc = GOAL_CUE.exec(n)
  if (gc) return parseGoal(o.slice(gc[0].length), n.slice(gc[0].length), now, habits)

  // 1. check-in on an existing habit
  if (DONE_RE.test(n)) {
    const h = matchHabit(n, habits)
    if (h) {
      const d = findDate(n, now, true)
      return { kind: 'habit-done', habitId: h.id, name: h.name, date: d && d.date <= fmt(now) ? d.date : fmt(now) }
    }
  }

  // 2. new habit
  if (NEWHABIT_RE.test(n) && NEWCUE_RE.test(n)) {
    const dur = findDuration(n)
    const t = findTime(dur ? blank(n, [dur.span]) : n, true)
    const spans = [dur?.span, t?.span].filter(Boolean) as Span[]
    const name = stripFiller(o, n, spans)
    if (name) return { kind: 'habit-new', name, job: jobOf(n), time: t?.start, dur: dur?.min }
  }

  // 3. money
  const money = findMoney(n, CUE_RE.test(n))
  if (money) {
    const income = INCOME_RE.test(n) && !(SPEND_RE.test(n) && !/\b(got paid|paid me)\b/.test(n) && !/\b(luong|salary|nhan)\b/.test(n))
    const type = income ? 'income' : 'spend'
    const note = stripFiller(o, n, [money.span])
    return { kind: 'tx', type, amount: money.amount, category: categoryOf(o, type), note }
  }

  // 4. event or task
  const dur = findDuration(n)
  const n2 = dur ? blank(n, [dur.span]) : n
  const time = findTime(n2, false)
  const n3 = time ? blank(n2, [time.span]) : n2
  const date = findDate(n3, now)
  const spans = [dur?.span, time?.span, date?.span].filter(Boolean) as Span[]
  const title = stripFiller(o, n, spans) || 'Untitled'
  const today = fmt(now)

  if (time) {
    let start = time.start
    if (date?.tonight && start < 12 * 60) start += 12 * 60
    let day = date?.date
    if (!day) day = start <= now.getHours() * 60 + now.getMinutes() ? fmt(addDays(now, 1)) : today
    return { kind: 'event', title, date: day, start, dur: dur?.min ?? 60 }
  }
  if (date || dur || TASK_RE.test(n)) {
    return { kind: 'task', title, dur: dur?.min ?? 60, deadline: date?.date }
  }
  return { kind: 'unknown', text: seg }
}

/* ---------- goals ---------- */
const WEEKLY = /\b(?:(?:a|per|each|every|1)\s+week|weekly|moi tuan|mot tuan)\b|\/\s*(?:week|tuan)\b/
const CNT = /\b(\d+|once|twice|one|two|three|four|five|six|seven|mot|hai|ba|bon|nam|sau|bay)\b/
const CNTW: Record<string, number> = { once: 1, one: 1, mot: 1, twice: 2, two: 2, hai: 2, three: 3, ba: 3, four: 4, bon: 4, five: 5, nam: 5, six: 6, sau: 6, seven: 7, bay: 7 }
const HZ = new RegExp(`\\b(?:in|within|trong|sau|for the next|over the next)\\s+${NUM}\\s*(days?|weeks?|months?|years?|ngay|tuan|thang|nam)\\b`)
const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const BYMONTH = /\b(?:by|before|until|truoc|den)\s+(?:the\s+end\s+of\s+|end\s+of\s+|cuoi\s+)?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec|thang\s+(\d{1,2}))\b/
const GOAL_LEAD = /^(?:(?:i\s+(?:want|need|have|would like|wanna)\s+to|want to|need to|have to|break(?:\s+down)?|to|a|an|the)\s+)+/
const GOAL_FILLER = /\b(times?|lan|buoi|sessions?|x|of|my|do|doing|long term|short term|dai han|ngan han)\b/g
const SAVE_CUE = /\b(save|saving|savings|tiet kiem|de danh|fund)\b/

const daysUntil = (date: string, now: Date) => Math.round((new Date(date + 'T12:00:00').getTime() - new Date(fmt(now) + 'T12:00:00').getTime()) / 86400000)

function findHorizon(n: string, now: Date): { date: string; span: Span } | null {
  let m = HZ.exec(n)
  if (m) {
    const v = NUMW[m[1]] ?? parseFloat(m[1].replace(',', '.'))
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    if (/^(day|ngay)/.test(m[2])) d.setDate(d.getDate() + Math.round(v))
    else if (/^(week|tuan)/.test(m[2])) d.setDate(d.getDate() + Math.round(v * 7))
    else if (/^(month|thang)/.test(m[2])) d.setMonth(d.getMonth() + Math.round(v))
    else d.setFullYear(d.getFullYear() + Math.round(v))
    return { date: fmt(d), span: [m.index, m.index + m[0].length] }
  }
  m = BYMONTH.exec(n)
  if (m) {
    const mi = m[2] ? +m[2] - 1 : MONTH_NAMES.indexOf(m[1].slice(0, 3))
    if (mi >= 0 && mi <= 11) {
      const y = mi >= now.getMonth() ? now.getFullYear() : now.getFullYear() + 1
      return { date: fmt(new Date(y, mi + 1, 0)), span: [m.index, m.index + m[0].length] } // last day of that month
    }
  }
  const d = findDate(n, now)
  if (d) {
    const pre = /(?:by|before|until|truoc|den)\s+$/.exec(n.slice(0, d.span[0]))
    return { date: d.date, span: [pre ? d.span[0] - pre[0].length : d.span[0], d.span[1]] }
  }
  return null
}

const upper = (s: string) => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase())

/** Goal wording left after removing numbers, dates and filler. */
function goalName(o: string, spans: Span[]): string {
  const t = cut(o, spans)
  const tn = fold(t)
  const ws = tn.length - tn.trimStart().length
  const lead = GOAL_LEAD.exec(tn.slice(ws))
  const more: Span[] = lead ? [[ws, ws + lead[0].length]] : []
  for (const m of tn.matchAll(/\b(long term|short term|dai han|ngan han)\b/g)) more.push([m.index!, m.index! + m[0].length])
  const name = cut(t, more).replace(/\s+/g, ' ').trim()
  return name ? name[0].toUpperCase() + name.slice(1) : ''
}

function parseGoal(o: string, n: string, now: Date, habits: Habit[]): Parsed {
  const spans: Span[] = []
  let deadline: string | undefined
  const hz = findHorizon(n, now)
  if (hz) {
    spans.push(hz.span)
    deadline = hz.date
  }
  const nb = hz ? blank(n, [hz.span]) : n
  const termHint = /\b(long term|dai han)\b/.test(nb) ? 'long' : /\b(short term|ngan han)\b/.test(nb) ? 'short' : undefined
  const termFor = (fallback: 'short' | 'long') => termHint ?? (deadline ? (daysUntil(deadline, now) <= 92 ? 'short' : 'long') : fallback)

  // "2 muay thai a week": a habit with a weekly target
  const wk = WEEKLY.exec(nb)
  if (wk) {
    const wspan: Span = [wk.index, wk.index + wk[0].length]
    const c = CNT.exec(blank(nb, [wspan]))
    const count = c ? CNTW[c[1]] ?? parseInt(c[1], 10) : 1
    const sp: Span[] = [...spans, wspan]
    if (c) sp.push([c.index, c.index + c[0].length])
    const t = cut(o, sp)
    const tn = fold(t)
    const fill: Span[] = [...tn.matchAll(GOAL_FILLER)].map((m) => [m.index!, m.index! + m[0].length])
    let thing = cut(t, fill).replace(/\s+/g, ' ').trim()
    thing = thing.replace(/^(?:a|an|the)\s+/i, '')
    const words = thing.split(' ')
    const last = words[words.length - 1] ?? ''
    if (last.length > 3 && /s$/i.test(last) && !/ss$/i.test(last)) words[words.length - 1] = last.slice(0, -1)
    thing = upper(words.join(' ')).trim()
    if (!thing) return { kind: 'unknown', text: o }
    const existing = matchHabit(fold(thing), habits)
    const habitName = existing?.name ?? thing
    return { kind: 'goal-new', name: `${habitName}, ${count}× a week`, term: termHint ?? 'short', gkind: 'habit', target: count, period: 'week', habitId: existing?.id, habitName, job: jobOf(fold(thing)), deadline }
  }

  // "save 50tr for a laptop by March"
  const money = findMoney(nb, SAVE_CUE.test(nb))
  if (money) {
    return { kind: 'goal-new', name: goalName(o, [...spans, money.span]) || 'Savings goal', term: termFor('long'), gkind: 'savings', target: money.amount, deadline }
  }

  // "30 IELTS sessions" when that habit already exists
  const hm = matchHabit(nb, habits)
  const c2 = CNT.exec(nb)
  if (hm && c2 && /^\d+$/.test(c2[1]) && +c2[1] >= 2) {
    return { kind: 'goal-new', name: goalName(o, [...spans, [c2.index, c2.index + c2[0].length]]) || hm.name, term: termFor('short'), gkind: 'habit', target: +c2[1], habitId: hm.id, habitName: hm.name, job: hm.job, deadline }
  }

  const name = goalName(o, spans)
  if (!name) return { kind: 'unknown', text: o }
  return { kind: 'goal-new', name, term: termFor('short'), gkind: 'manual', target: 0, deadline }
}
