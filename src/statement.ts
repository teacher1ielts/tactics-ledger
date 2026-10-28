// Turns raw text from a bank statement (PDF text layer, OCR, or pasted) into candidate transactions. Pure.
import { categoryOf, fold } from './parser'

export interface StatementRow {
  id: string
  date: string
  desc: string
  amount: number
  type: 'income' | 'spend'
  sure: boolean // false when the direction (in or out) had to be guessed
  category: string
}

const pad = (n: number) => String(n).padStart(2, '0')
const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const DATES: { re: RegExp; get: (m: RegExpExecArray) => [number, number, number | null] }[] = [
  { re: /(?<![\d.])(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/g, get: (m) => [+m[3], +m[2], +m[1]] },
  { re: /(?<![\d.])(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?!\d)/g, get: (m) => [+m[1], +m[2], +m[3]] },
  { re: /(?<![\d.])(\d{1,2})[-/](\d{1,2})[-/](\d{2})(?!\d)/g, get: (m) => [+m[1], +m[2], 2000 + +m[3]] },
  { re: /(?<![\d.,/])(\d{1,2})\/(\d{1,2})(?![\d/])/g, get: (m) => [+m[1], +m[2], null] },
]

function findDate(line: string, now: Date): string | undefined {
  for (const { re, get } of DATES) {
    re.lastIndex = 0
    const m = re.exec(line)
    if (!m) continue
    const [d, mo, y] = get(m)
    if (d < 1 || d > 31 || mo < 1 || mo > 12) continue
    let year = y ?? now.getFullYear()
    if (y === null && new Date(year, mo - 1, d).getTime() > now.getTime() + 31 * 86400000) year -= 1
    return `${year}-${pad(mo)}-${pad(d)}`
  }
  return undefined
}

const strip = (line: string) =>
  DATES.reduce((s, { re }) => s.replace(new RegExp(re.source, 'g'), ' '), line).replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ')

const AMT = /(?<![\w.,])([+\-−–])?(\d{1,3}(?:[.,]\d{3})+|\d{4,9})(?:[.,]\d{1,2})?(?!\d)\s*(?:vnd|vnđ|đ|d)?(?![a-z])/gi

interface Amt {
  value: number
  sign: '+' | '-' | ''
  text: string
}
function amounts(line: string): Amt[] {
  return [...strip(line).matchAll(AMT)]
    .map((m) => ({
      value: Number(m[2].replace(/[.,]/g, '')),
      sign: (m[1] === '+' ? '+' : m[1] ? '-' : '') as Amt['sign'],
      text: m[0],
    }))
    .filter((a) => a.value >= 1000)
}

const SKIP = /\b(so du|balance|opening|closing|tong cong|total|dau ky|cuoi ky|account (?:no|number)|so tai khoan|trang \d|page \d)\b/
const CREDIT = /\b(ghi co|credit|chuyen den|ck den|nhan tien|nhan duoc|luong|salary|hoan tien|refund|lai suat|interest|nap tien vao|deposit|received|tien vao|thu nhap|bonus|thuong|cashback)\b/
const DEBIT = /\b(ghi no|debit|chuyen di|ck di|thanh toan|rut tien|payment|purchase|pos|atm|phi |fee|mua|ban hang|withdraw|tien ra|nap dt|topup|chuyen khoan toi|trich no)\b/

export function parseStatement(raw: string, now = new Date()): StatementRow[] {
  const lines = raw.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
  interface Rec {
    date?: string
    parts: string[]
  }
  const recs: Rec[] = []
  let cur: Rec | null = null
  let lastDate: string | undefined

  for (const line of lines) {
    const d = findDate(line, now)
    if (!d && SKIP.test(fold(line))) {
      cur = null
      continue
    }
    if (d) {
      lastDate = d
      cur = { date: d, parts: [line] }
      recs.push(cur)
      continue
    }
    const has = amounts(line).length > 0
    if (cur && cur.parts.length < 4 && (!has || amounts(cur.parts.join(' ')).length === 0)) {
      cur.parts.push(line)
      continue
    }
    if (has) {
      cur = { date: lastDate, parts: [line] }
      recs.push(cur)
    }
  }

  const rows: StatementRow[] = []
  for (const r of recs) {
    const text = r.parts.join(' ')
    const amts = amounts(text)
    if (amts.length === 0) continue
    const signed = amts.find((a) => a.sign)
    const pick = signed ?? amts[0] // unsigned rows list the amount first and the running balance last
    const f = fold(text)
    let type: 'income' | 'spend'
    let sure = true
    if (signed) type = signed.sign === '+' ? 'income' : 'spend'
    else {
      const c = CREDIT.test(f)
      const dbt = DEBIT.test(f)
      if (c && !dbt) type = 'income'
      else if (dbt && !c) type = 'spend'
      else {
        type = 'spend'
        sure = false
      }
    }
    let desc = strip(text)
    amts.forEach((a) => (desc = desc.replace(a.text, ' ')))
    desc = desc.replace(/\s+/g, ' ').replace(/^[\s\-–|:.,]+|[\s\-–|:.,]+$/g, '')
    if (desc.length > 80) desc = desc.slice(0, 79) + '…'
    if (!desc) desc = 'Bank transaction'
    rows.push({
      id: Math.random().toString(36).slice(2, 10),
      date: r.date ?? fmt(now),
      desc,
      amount: pick.value,
      type,
      sure,
      category: categoryOf(desc, type),
    })
  }
  return rows
}
