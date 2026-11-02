// Reads text out of bank PDFs and screenshots, entirely in the browser. Heavy libraries load on first use.
import { linesFromItems, type Cols } from './pdflines'

type Status = (msg: string) => void
/** Asks the person for a PDF's password. `wrong` is true when the last attempt failed. Resolve null to give up. */
export type AskPassword = (fileName: string, wrong: boolean) => Promise<string | null>

async function ocr(image: Blob | HTMLCanvasElement, status: Status, label: string): Promise<string> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker(['vie', 'eng'], 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') status(`Reading ${label}… ${Math.round(m.progress * 100)}%`)
      else status(`Preparing OCR (${m.status})…`)
    },
  })
  try {
    const { data } = await worker.recognize(image)
    return data.text
  } finally {
    await worker.terminate()
  }
}

async function pdfText(file: File, status: Status, ask: AskPassword): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  let gaveUp = false
  task.onPassword = (supply: (pw: string) => void, reason: number) => {
    void ask(file.name, reason === 2).then((pw) => {
      if (pw) supply(pw)
      else {
        gaveUp = true
        void task.destroy()
      }
    })
  }
  let pdf
  try {
    pdf = await task.promise
  } catch (e) {
    if (gaveUp) throw new Error(`${file.name} is password-protected and no password was entered.`)
    throw e
  }

  const pages: string[] = []
  let cols: Cols | undefined
  for (let p = 1; p <= pdf.numPages; p++) {
    status(`Reading ${file.name} page ${p}/${pdf.numPages}…`)
    const page = await pdf.getPage(p)
    const tc = await page.getTextContent()
    const items = tc.items
      .filter((i): i is typeof i & { str: string; transform: number[]; width: number } => 'str' in i && i.str.trim() !== '')
      .map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width }))
    const r = linesFromItems(items, cols)
    cols = r.cols
    let text = r.lines.join('\n')

    if (text.replace(/\s/g, '').length < 40) {
      // Scanned page with no text layer: render it and OCR the picture.
      const viewport = page.getViewport({ scale: 2.2 })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise
      text = await ocr(canvas, status, `${file.name} page ${p}`)
    }
    pages.push(text)
  }
  return pages.join('\n')
}

export async function extractText(file: File, status: Status, ask: AskPassword): Promise<string> {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return pdfText(file, status, ask)
  if (file.type.startsWith('image/')) return ocr(file, status, file.name)
  throw new Error(`${file.name}: unsupported file type (use a PDF or an image)`)
}
