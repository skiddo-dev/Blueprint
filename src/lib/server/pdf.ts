import PDFDocument from 'pdfkit'

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
