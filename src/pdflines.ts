// Turns the positioned text fragments of one PDF page into lines of text. Pure: no DOM.
//
// A statement table shows money in a Debit column and a Credit column, but the text alone only says
// "163,000" for both. So when the page has a Debit/Credit header, each amount that sits under one of
// those headers is tagged [DR] or [CR]. That is far more reliable than guessing from the description.

export interface PdfItem {
  s: string
  x: number
  y: number
  w: number
}
export interface Cols {
  dr: number
  cr: number
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
const isDebitHead = (s: string) => /ghi no|\bdebit\b/.test(fold(s))
const isCreditHead = (s: string) => /ghi co|\bcredit\b/.test(fold(s))
// small fees (70, 100 dong) are real amounts when they sit under the Debit or Credit header
const isAmountPart = (s: string) => /^[+-]?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?$|^[+-]?\d{1,9}$/.test(s.trim())

/** `carry` is the column layout found on an earlier page: many statements print the header only once. */
export function linesFromItems(items: PdfItem[], carry?: Cols): { lines: string[]; cols?: Cols } {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x)
  const rows: { y: number; parts: PdfItem[] }[] = []
  for (const it of sorted) {
    const row = rows.find((r) => Math.abs(r.y - it.y) <= 3)
    if (row) row.parts.push(it)
    else rows.push({ y: it.y, parts: [it] })
  }

  let cols = carry
  const lines: string[] = []
  for (const row of rows) {
    row.parts.sort((a, b) => a.x - b.x)
    const d = row.parts.find((p) => isDebitHead(p.s))
    const c = row.parts.find((p) => isCreditHead(p.s))
    if (d && c && d !== c) cols = { dr: d.x + d.w / 2, cr: c.x + c.w / 2 }
    const tol = cols ? Math.max(18, Math.abs(cols.dr - cols.cr) * 0.5) : 0
    lines.push(
      row.parts
        .map((p) => {
          if (!cols || !isAmountPart(p.s)) return p.s
          const mid = p.x + p.w / 2
          const toDr = Math.abs(mid - cols.dr)
          const toCr = Math.abs(mid - cols.cr)
          if (Math.min(toDr, toCr) > tol) return p.s // an amount in some other column (balance, total)
          return `${p.s} ${toDr <= toCr ? '[DR]' : '[CR]'}`
        })
        .join(' | '),
    )
  }
  return { lines, cols }
}
