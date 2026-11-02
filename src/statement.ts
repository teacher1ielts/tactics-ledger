// Turns raw text from a bank statement (PDF text layer, OCR, or pasted) into candidate transactions. Pure.
import { categoryOf, fold } from './parser'

export interface StatementRow {
  id: string
  date: string
  desc: string
  amount: number
  type: 'income' | 'spend'
  sure: boolean // false when the direction (in or out) had to be guessed
  hint?: string // a note shown under the row
  skip?: boolean // unticked by default (for example a payment to the card)
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

const AMT = /(?<![\w.,])([+\-−–])?(\d{1,3}(?:[.,]\d{3})+|\d{4,9}|\d{1,3}(?= \[(?:DR|CR)\]))(?:[.,]\d{1,2})?(?!\d)\s*(?:vnd|vnđ|đ|d)?(?![a-z])/gi

interface Amt {
  value: number
  sign: '+' | '-' | ''
  text: string
  tag: 'DR' | 'CR' | '' // set by the PDF reader when the amount sits under a Debit or Credit header
}
function amounts(line: string): Amt[] {
  const clean = strip(line)
  return [...clean.matchAll(AMT)]
    .map((m) => {
      const end = m.index! + m[0].trimEnd().length
      const rest = clean.slice(end, end + 6)
      return {
        value: Number(m[2].replace(/[.,]/g, '')),
        sign: (m[1] === '+' ? '+' : m[1] ? '-' : '') as Amt['sign'],
        text: m[0],
        tag: (rest.startsWith(' [DR]') ? 'DR' : rest.startsWith(' [CR]') ? 'CR' : '') as Amt['tag'],
      }
    })
    .filter((a) => a.value >= 1000 || a.tag) // a tiny fee (70, 100 dong) still counts when it sits in a Debit/Credit column
}

/** Lines that describe the statement itself (limits, due dates), even when they carry a date or an amount. */
const SKIP_HARD = /\b(thanh toan toi thieu|minimum payment|payment due|han thanh toan|han muc|credit limit|ngay sao ke|statement date|tong du no|du no cuoi|du no dau|closing balance|opening balance)\b/
const CARD_PAYMENT = /\b(thanh toan the|thanh toan tien|tt the|payment|thu no|nop tien|tra no|autopay|auto debit|ck tu tk|chuyen khoan|thanh toan)\b/
const PAYS_CARD = /\b(thu no the|thanh toan the (?:td|tin dung|visa)|nop tien the|tra no the)\b/

/** True when the text reads like a credit card statement (so purchases are the default direction). */
export function looksLikeCard(text: string): boolean {
  const head = fold(text.slice(0, 1200))
  return /the tin dung|credit card|lich su giao dich the|sao ke the|d{4,6}x{3,}d{4}/.test(head)
}

export interface ParseOptions {
  card?: boolean
}

const SKIP = /\b(so du|balance|opening|closing|tong cong|total|dau ky|cuoi ky|account (?:no|number)|so tai khoan|trang \d|page \d)\b/
const CREDIT = /\b(ghi co|credit|chuyen den|ck den|nhan tien|nhan duoc|luong|salary|hoan tien|refund|lai suat|interest|nap tien vao|deposit|received|tien vao|thu nhap|bonus|thuong|cashback)\b/
const DEBIT = /\b(ghi no|debit|chuyen di|ck di|thanh toan|rut tien|payment|purchase|pos|atm|phi |fee|mua|ban hang|withdraw|tien ra|nap dt|topup|chuyen khoan toi|trich no)\b/

export function parseStatement(raw: string, now = new Date(), opts: ParseOptions = {}): StatementRow[] {
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
    if (SKIP_HARD.test(fold(line)) || (!d && SKIP.test(fold(line)))) {
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
    // An undated line only starts a new transaction (a screenshot or pasted list) when it clearly shows money:
    // a signed or formatted amount of a plausible size, plus some words. Bare digit strings and years are not money.
    const money = amounts(line).some((x) => x.value >= 5000 && (x.sign || /[.,]\d{3}/.test(x.text) || /(?:vnd|vnđ|đ|d)\s*$/i.test(x.text.trim())))
    const words = (line.match(/\p{L}/gu) ?? []).length >= 3
    if (has && money && words) {
      cur = { date: lastDate, parts: [line] }
      recs.push(cur)
    }
  }

  const rows: StatementRow[] = []
  let prevKey = ''
  for (const r of recs) {
    const text = r.parts.join(' ')
    const amts = amounts(text)
    if (amts.length === 0) continue
    const signed = amts.find((a) => a.sign)
    const tagged = amts.find((a) => a.tag)
    const mark = tagged?.tag ?? ''
    const pick = tagged ?? signed ?? amts[0] // unsigned rows list the amount first and the running balance last
    // A long description that wraps onto a second line repeats the amount AND the running balance.
    // A genuine second payment of the same amount would show a different balance, so the pair identifies it.
    // (Card statements have no balance column, so two identical purchases on one day are never merged.)
    const last = amts[amts.length - 1]
    const key = amts.length >= 2 && last.value !== pick.value ? `${r.date}|${pick.value}|${last.value}` : ''
    if (key && key === prevKey) continue
    prevKey = key
    const f = fold(text)
    let type: 'income' | 'spend'
    let sure = true
    let hint: string | undefined
    let skip = false
    if (mark) type = mark === 'CR' ? 'income' : 'spend'
    else if (signed) type = signed.sign === '+' ? 'income' : 'spend'
    else if (opts.card) type = CREDIT.test(f) || /hoan|refund|reversal/.test(f) || CARD_PAYMENT.test(f) ? 'income' : 'spend' // on a card, a purchase is the normal row
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
    if (opts.card && type === 'income') {
      if (CARD_PAYMENT.test(f) && !/hoan|refund/.test(f)) {
        skip = true
        hint = 'Payment to the card: unticked, so it is not counted as income. The money was already counted when it left your bank.'
      } else hint = 'Refund or credit to the card'
    } else if (type === 'spend' && PAYS_CARD.test(f)) {
      hint = 'Pays your credit card. If you also import the card statement, untick this one or it is counted twice.'
    }
    let desc = strip(text).replace(/\[(?:DR|CR)\]/g, ' ')
    amts.forEach((a) => (desc = desc.split(a.text.trimEnd()).join(' '))) // every copy: card statements repeat the amount in two columns
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
      hint,
      skip,
    })
  }
  return rows
}
