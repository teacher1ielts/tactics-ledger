// Reads text out of bank PDFs and screenshots, entirely in the browser. Heavy libraries load on first use.

type Status = (msg: string) => void

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

async function pdfText(file: File, status: Status): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  task.onPassword = (supply: (pw: string) => void, reason: number) => {
    const pw = window.prompt(reason === 2 ? 'Wrong password. Try again:' : `${file.name} is password-protected. Enter its password (not stored):`)
    if (pw) supply(pw)
    else void task.destroy()
  }
  const pdf = await task.promise

  const pages: string[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    status(`Reading ${file.name} page ${p}/${pdf.numPages}…`)
    const page = await pdf.getPage(p)
    const tc = await page.getTextContent()
    const items = tc.items
      .filter((i): i is typeof i & { str: string; transform: number[] } => 'str' in i && i.str.trim() !== '')
      .map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5] }))
      .sort((a, b) => b.y - a.y || a.x - b.x)

    // Cluster text fragments that share a baseline into one visual row.
    const lines: { y: number; parts: { s: string; x: number }[] }[] = []
    for (const it of items) {
      const line = lines.find((l) => Math.abs(l.y - it.y) <= 3)
      if (line) line.parts.push({ s: it.s, x: it.x })
      else lines.push({ y: it.y, parts: [{ s: it.s, x: it.x }] })
    }
    let text = lines.map((l) => l.parts.sort((a, b) => a.x - b.x).map((x) => x.s).join(' ')).join('\n')

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

export async function extractText(file: File, status: Status): Promise<string> {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return pdfText(file, status)
  if (file.type.startsWith('image/')) return ocr(file, status, file.name)
  throw new Error(`${file.name}: unsupported file type (use a PDF or an image)`)
}
