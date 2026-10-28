// Rule-based English/Vietnamese command parser. Pure: no DOM, no React.
import type { Habit, Job } from './store'

export type Parsed =
  | { kind: 'tx'; type: 'income' | 'spend'; amount: number; category: string; note: string }
  | { kind: 'event'; title: string; date: string; start: number; dur: number }
  | { kind: 'task'; title: string; dur: number; deadline?: string }
  | { kind: 'habit-new'; name: string; job: Job; time?: number; dur?: number }
  | { kind: 'habit-done'; habitId: string; name: string; date: string }
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

function jobOf(n: string): Job {
  if (/\b(gym|run|running|workout|tap|chay|swim|boi|bong|exercise|the duc)\b/.test(n)) return 'Knight'
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

function split(o: string, n: string): string[] {
  const re = /\s*(?:[;\n]|[,.](?=\s)|\s+(?:and then|and|then|also|va|roi|sau do)\s+)\s*/g
  const out: string[] = []
  let last = 0
  for (const m of n.matchAll(re)) {
    out.push(o.slice(last, m.index))
    last = m.index! + m[0].length
  }
  out.push(o.slice(last))
  return out.map((s) => s.trim().replace(/[.,;]+$/, '')).filter(Boolean)
}

const DONE_RE = /\b(done|did|finished|completed|checked|tick|xong|da tap|da hoc|da lam|da doc|da chay|da thien|hoan thanh|vua)\b/
const NEWHABIT_RE = /\b(habit|thoi quen)\b/
const NEWCUE_RE = /\b(add|new|create|start|build|them|tao|moi)\b/
const TASK_RE = /\b(remind|todo|to do|task|need to|have to|must|nhac|phai|can phai|deadline|due|finish|complete|write|submit|nop|hoan thanh)\b/

function matchHabit(n: string, habits: Habit[]): Habit | null {
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

export function parseCommand(text: string, now: Date, habits: Habit[]): Parsed[] {
  const o = text.normalize('NFC')
  return split(o, fold(o)).map((seg) => parseSegment(seg, now, habits))
}

function parseSegment(seg: string, now: Date, habits: Habit[]): Parsed {
  const o = seg
  const n = fold(o)

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
