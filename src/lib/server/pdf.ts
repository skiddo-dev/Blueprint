import PDFDocument from 'pdfkit'
import type { Invoice, Bill } from '$lib/accounting/types'
import { format as usd } from '$lib/money'

export interface QuoteData {
  customer: string
  date_received: string
  bid_due_date: string
  architect: string
  project_location: string
  description: string
  notes?: string
  labor: number
  materials: number
  total: number
  quote_type: string
}

export async function generateQuotePdf(data: QuoteData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 28 })
    const chunks: Buffer[] = []
    doc.on('data', chunk => chunks.push(Buffer.from(chunk)))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const W = doc.page.width - 56  // content width (margin 28 each side)
    const LEFT = 28

    // Border
    doc.rect(LEFT, 28, W, doc.page.height - 56).stroke()

    // Logo (if present)
    // Note: logo.png is in project root; resolve relative to cwd
    try {
      doc.image('logo.png', LEFT + (W - 272) / 2, 40, { width: 272 })
      doc.moveDown(4)
    } catch {
      doc.moveDown(2)
    }

    // Address + title
    doc.fontSize(10).font('Helvetica').text('1704 E. Highland Rd. Highland, MI. 48356', { align: 'center' })
    doc.moveDown(0.5)
    doc.fontSize(14).font('Helvetica-Bold').text('Proposal', { align: 'center' })
    doc.moveDown(0.8)

    // Info grid (4 columns)
    const colW = [W * 0.24, W * 0.24, W * 0.24, W * 0.28]
    const rowH = 22
    const gridY = doc.y
    const headers = ['Customer:', 'Date Received:', 'Bid Due Date:', 'Architect:']
    const vals = [data.customer, data.date_received, data.bid_due_date, data.architect]
    const vals2 = ['', '', '', data.project_location]

    for (let row = 0; row < 3; row++) {
      let x = LEFT
      for (let col = 0; col < 4; col++) {
        const y = gridY + row * rowH
        if (row === 0) doc.rect(x, y, colW[col], rowH).fillAndStroke('#e8e8e8', '#000')
        else doc.rect(x, y, colW[col], rowH).stroke()
        doc.fillColor('#000').fontSize(9).font(row === 0 ? 'Helvetica-Bold' : 'Helvetica')
        const text = row === 0 ? headers[col] : row === 1 ? vals[col] : vals2[col]
        doc.text(text.slice(0, 28), x + 4, y + 6, { width: colW[col] - 8, lineBreak: false })
        x += colW[col]
      }
    }

    doc.y = gridY + 3 * rowH + 8

    // Description header
    const descY = doc.y
    doc.rect(LEFT, descY, W, rowH).fillAndStroke('#e8e8e8', '#000')
    doc.fillColor('#000').fontSize(10).font('Helvetica-Bold')
    doc.text('Description of Work:', LEFT + 4, descY + 6)

    // Description lines grid
    const lineH = 20
    for (let r = 0; r < 12; r++) {
      const y = descY + rowH + r * lineH
      doc.rect(LEFT, y, W, lineH).stroke()
    }

    // Write description text in first lines
    if (data.description) {
      doc.fontSize(9).font('Helvetica').fillColor('#333')
      doc.text(data.description, LEFT + 4, descY + rowH + 3, {
        width: W - 8,
        height: 12 * lineH - 6,
      })
    }

    doc.y = descY + rowH + 12 * lineH + 8

    // Bottom boxes
    const botY = doc.y + 4
    const boxW = W / 2 - 4

    // Left: signature box
    doc.rect(LEFT, botY, boxW, 72).fillAndStroke('#e8e8e8', '#000')
    ;['Sign:', 'Print:', 'Date:'].forEach((lbl, i) => {
      doc.fillColor('#000').fontSize(10).font('Helvetica-Bold')
      doc.text(lbl, LEFT + 6, botY + i * 22 + 6)
    })

    // Right: cost box
    const rightX = LEFT + boxW + 8
    doc.rect(rightX, botY, boxW, 72).fillAndStroke('#e8e8e8', '#000')
    // Show the labor/materials breakdown only when provided; otherwise just the
    // single quoted amount (the quote log tracks one Amount per quote).
    const costRows: Array<[string, number]> =
      data.labor > 0 || data.materials > 0
        ? [['Labor:', data.labor], ['Materials:', data.materials], ['Total:', data.total]]
        : [['Amount:', data.total]]
    costRows.forEach(([lbl, val], i) => {
      doc.fillColor('#000').fontSize(10).font('Helvetica-Bold')
      doc.text(lbl, rightX + 6, botY + i * 22 + 6, { width: boxW / 2 })
      doc.font('Helvetica')
      doc.text(`$${val.toFixed(2)}`, rightX + boxW / 2, botY + i * 22 + 6, {
        width: boxW / 2 - 8,
        align: 'right',
      })
    })

    doc.end()
  })
}

// ── Accounting documents (invoice / bill) ──────────────────────────────────────
// Both render as the same letterhead + party block + line table + totals layout;
// renderDoc() is the shared renderer and the two exports just describe their doc.
const COMPANY_ADDRESS = '1704 E. Highland Rd. Highland, MI. 48356'

interface DocColumn { label: string; width: number; align?: 'left' | 'right' } // width is a fraction of the content width
interface DocTotal { label: string; value: string; bold?: boolean }
interface DocSpec {
  title: string
  number: string
  partyLabel: string
  partyName: string
  partyEmail?: string
  meta: Array<[string, string]>
  columns: DocColumn[]
  rows: string[][]
  totals: DocTotal[]
  status: string
}

function renderDoc(spec: DocSpec): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 })
    const chunks: Buffer[] = []
    doc.on('data', (c) => chunks.push(Buffer.from(c)))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const LEFT = 40
    const W = doc.page.width - 80

    // Letterhead: optional logo (left) + doc title/number/address (right).
    try { doc.image('logo.png', LEFT, 40, { width: 170 }) } catch { /* logo optional */ }
    doc.fillColor('#111').font('Helvetica-Bold').fontSize(22).text(spec.title, LEFT, 46, { width: W, align: 'right' })
    doc.font('Helvetica').fontSize(10).fillColor('#555').text(`#${spec.number}`, LEFT, 74, { width: W, align: 'right' })
    doc.fontSize(9).text(COMPANY_ADDRESS, LEFT, 92, { width: W, align: 'right' })

    // Party (left) + meta rows (right).
    let y = 132
    doc.fillColor('#888').font('Helvetica-Bold').fontSize(9).text(spec.partyLabel.toUpperCase(), LEFT, y)
    doc.fillColor('#111').font('Helvetica-Bold').fontSize(12).text(spec.partyName, LEFT, y + 12, { width: W * 0.5 })
    if (spec.partyEmail) doc.fillColor('#555').font('Helvetica').fontSize(9).text(spec.partyEmail, LEFT, y + 30, { width: W * 0.5 })

    let my = y
    for (const [label, value] of spec.meta) {
      doc.fillColor('#888').font('Helvetica').fontSize(9).text(label, LEFT + W * 0.55, my, { width: W * 0.2 })
      doc.fillColor('#111').font('Helvetica-Bold').fontSize(9).text(value, LEFT + W * 0.75, my, { width: W * 0.25, align: 'right' })
      my += 15
    }

    y = Math.max(y + 52, my) + 10
    doc.fillColor('#555').font('Helvetica-Bold').fontSize(9).text(`Status: ${spec.status.toUpperCase()}`, LEFT, y)
    y += 20

    // Column x-offsets.
    const colX: number[] = []
    let cx = LEFT
    for (const c of spec.columns) { colX.push(cx); cx += c.width * W }

    // Header band.
    doc.rect(LEFT, y, W, 22).fill('#1f2937')
    spec.columns.forEach((c, i) => {
      doc.fillColor('#fff').font('Helvetica-Bold').fontSize(9)
        .text(c.label, colX[i] + 6, y + 7, { width: c.width * W - 12, align: c.align ?? 'left' })
    })
    y += 22

    // Rows — height grows to fit the tallest (wrapping) cell so nothing overlaps.
    doc.font('Helvetica').fontSize(9)
    for (const row of spec.rows) {
      let rowH = 20
      spec.columns.forEach((c, i) => {
        const h = doc.heightOfString(row[i] ?? '', { width: c.width * W - 12 }) + 12
        if (h > rowH) rowH = h
      })
      doc.fillColor('#111')
      spec.columns.forEach((c, i) => {
        doc.text(row[i] ?? '', colX[i] + 6, y + 6, { width: c.width * W - 12, align: c.align ?? 'left' })
      })
      doc.moveTo(LEFT, y + rowH).lineTo(LEFT + W, y + rowH).strokeColor('#e5e7eb').stroke()
      y += rowH
    }

    // Totals block (right-aligned).
    y += 12
    const totW = W * 0.42
    const totX = LEFT + W - totW
    for (const t of spec.totals) {
      if (t.bold) doc.moveTo(totX, y - 4).lineTo(totX + totW, y - 4).strokeColor('#1f2937').stroke()
      doc.font(t.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(t.bold ? 11 : 10).fillColor('#111')
      doc.text(t.label, totX, y, { width: totW * 0.5 })
      doc.text(t.value, totX + totW * 0.5, y, { width: totW * 0.5, align: 'right' })
      y += t.bold ? 20 : 16
    }

    doc.end()
  })
}

const docNumber = (year: number, n: number) => `${year}-${String(n).padStart(4, '0')}`

/** Customer-facing invoice PDF. */
export async function generateInvoicePdf(inv: Invoice): Promise<Buffer> {
  const totals: DocTotal[] = [{ label: 'Subtotal', value: usd(inv.subtotal) }]
  if (inv.tax > 0) totals.push({ label: `Tax (${inv.tax_rate}%)`, value: usd(inv.tax) })
  totals.push({ label: 'Total', value: usd(inv.total), bold: true })
  totals.push({ label: 'Paid', value: usd(inv.paid) })
  totals.push({ label: 'Balance Due', value: usd(inv.balance), bold: true })

  return renderDoc({
    title: 'INVOICE',
    number: docNumber(inv.year, inv.number),
    partyLabel: 'Bill To',
    partyName: inv.customer_name,
    meta: [
      ['Issue date', inv.issue_date],
      ['Due date', inv.due_date],
      ...(inv.po ? [['PO', inv.po] as [string, string]] : []),
    ],
    columns: [
      { label: 'Description', width: 0.52 },
      { label: 'Qty', width: 0.12, align: 'right' },
      { label: 'Unit Price', width: 0.18, align: 'right' },
      { label: 'Amount', width: 0.18, align: 'right' },
    ],
    rows: inv.lines.map((l) => [l.description, String(l.quantity), usd(l.unit_price), usd(l.amount)]),
    totals,
    status: inv.status,
  })
}

/** Printable record of a vendor bill (A/P). */
export async function generateBillPdf(bill: Bill): Promise<Buffer> {
  return renderDoc({
    title: 'BILL',
    number: docNumber(bill.year, bill.number),
    partyLabel: 'Vendor',
    partyName: bill.vendor_name,
    meta: [
      ['Bill date', bill.bill_date],
      ['Due date', bill.due_date],
      ...(bill.vendor_invoice_no ? [['Vendor inv #', bill.vendor_invoice_no] as [string, string]] : []),
      ...(bill.po ? [['PO', bill.po] as [string, string]] : []),
    ],
    columns: [
      { label: 'Account', width: 0.18 },
      { label: 'Description', width: 0.52 },
      { label: 'Amount', width: 0.30, align: 'right' },
    ],
    rows: bill.lines.map((l) => [l.account_id, l.description, usd(l.amount)]),
    totals: [
      { label: 'Total', value: usd(bill.total), bold: true },
      { label: 'Paid', value: usd(bill.paid) },
      { label: 'Balance Due', value: usd(bill.balance), bold: true },
    ],
    status: bill.status,
  })
}
