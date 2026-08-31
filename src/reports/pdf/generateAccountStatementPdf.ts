import { createPdfLayout, ensureSpace, drawLine, truncate, PDF_MARGIN } from './pdfHelpers';

/**
 * PDF del Estado de Cuenta estilo bancario (sección 11). Usa exactamente
 * los mismos movimientos y saldo corrido que la pantalla "Estado de
 * cuenta" (`src/services/accountService.ts` → `getAccountStatement`), así
 * que este documento nunca puede mostrar una cifra distinta a la que el
 * usuario ya vio en pantalla antes de descargarlo.
 */
export interface AccountStatementPdfData {
  customerName: string;
  customerCode: string;
  generatedDate: Date;
  from?: Date | null;
  to?: Date | null;
  movements: Array<{
    date: Date;
    typeLabel: string;
    documentRef: string;
    debit: string;
    credit: string;
    balance: string;
  }>;
  finalBalance: string;
  companyName?: string;
}

export async function generateAccountStatementPdf(data: AccountStatementPdfData): Promise<Buffer> {
  const layout = await createPdfLayout();
  const { doc, bold, font } = layout;

  layout.page.drawText(data.companyName || 'Sistema de Consignaciones', { x: PDF_MARGIN, y: layout.y, size: 16, font: bold });
  layout.y -= 20;
  layout.page.drawText('Estado de Cuenta', { x: PDF_MARGIN, y: layout.y, size: 13, font: bold });
  layout.y -= 25;
  layout.page.drawText(`Cliente: ${data.customerName} (${data.customerCode})`, { x: PDF_MARGIN, y: layout.y, size: 10, font });
  layout.y -= 15;
  const rangeLabel =
    data.from && data.to
      ? `Periodo: ${data.from.toLocaleDateString('es-PA')} - ${data.to.toLocaleDateString('es-PA')}`
      : 'Periodo: histórico completo';
  layout.page.drawText(rangeLabel, { x: PDF_MARGIN, y: layout.y, size: 10, font });
  layout.y -= 15;
  layout.page.drawText(`Generado: ${data.generatedDate.toLocaleDateString('es-PA')}`, { x: PDF_MARGIN, y: layout.y, size: 9, font });
  layout.y -= 25;

  const colX = {
    fecha: PDF_MARGIN,
    tipo: PDF_MARGIN + 65,
    doc: PDF_MARGIN + 165,
    debito: PDF_MARGIN + 300,
    credito: PDF_MARGIN + 380,
    saldo: PDF_MARGIN + 460,
  };

  function drawTableHeader() {
    layout.page.drawText('Fecha', { x: colX.fecha, y: layout.y, size: 9, font: bold });
    layout.page.drawText('Tipo', { x: colX.tipo, y: layout.y, size: 9, font: bold });
    layout.page.drawText('Documento', { x: colX.doc, y: layout.y, size: 9, font: bold });
    layout.page.drawText('Débito', { x: colX.debito, y: layout.y, size: 9, font: bold });
    layout.page.drawText('Crédito', { x: colX.credito, y: layout.y, size: 9, font: bold });
    layout.page.drawText('Saldo', { x: colX.saldo, y: layout.y, size: 9, font: bold });
    layout.y -= 5;
    drawLine(layout);
    layout.y -= 15;
  }

  drawTableHeader();

  for (const m of data.movements) {
    if (ensureSpace(layout)) drawTableHeader();
    layout.page.drawText(m.date.toLocaleDateString('es-PA'), { x: colX.fecha, y: layout.y, size: 9, font });
    layout.page.drawText(truncate(m.typeLabel, 18), { x: colX.tipo, y: layout.y, size: 9, font });
    layout.page.drawText(truncate(m.documentRef, 22), { x: colX.doc, y: layout.y, size: 9, font });
    layout.page.drawText(Number(m.debit) > 0 ? m.debit : '—', { x: colX.debito, y: layout.y, size: 9, font });
    layout.page.drawText(Number(m.credit) > 0 ? m.credit : '—', { x: colX.credito, y: layout.y, size: 9, font });
    layout.page.drawText(m.balance, { x: colX.saldo, y: layout.y, size: 9, font: bold });
    layout.y -= 16;
  }

  if (data.movements.length === 0) {
    layout.page.drawText('Sin movimientos en este periodo.', { x: PDF_MARGIN, y: layout.y, size: 10, font });
    layout.y -= 20;
  }

  ensureSpace(layout, 70);
  layout.y -= 10;
  drawLine(layout);
  layout.y -= 20;
  layout.page.drawText(`SALDO PENDIENTE: ${data.finalBalance}`, { x: PDF_MARGIN, y: layout.y, size: 12, font: bold });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
