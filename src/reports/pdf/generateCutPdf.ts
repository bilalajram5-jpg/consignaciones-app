import { createPdfLayout, ensureSpace, drawLine, truncate, PDF_MARGIN } from './pdfHelpers';

/**
 * PDF del Corte de Consignación (sección 27). Usa `pdf-lib` directamente
 * (sin plantillas HTML) para tener control total sobre el layout y
 * mantener el bundle ligero. Incluye: cliente, fecha, número de documento,
 * detalle por producto y totales — tal como pide la sección 27. Pagina
 * automáticamente cuando el corte tiene más líneas de las que caben en una
 * hoja (antes se truncaba en seco al llegar al fondo de la página; ver
 * VERIFICATION_LOG.md).
 */
export interface CutPdfData {
  cutNumber: number;
  customerName: string;
  customerCode: string;
  cutDate: Date;
  items: Array<{
    productSku: string;
    productName: string;
    previousQty: string;
    countedQty: string | null;
    soldQty: string;
    unitPrice: string;
    lineAmount: string;
  }>;
  totalAmount: string;
  companyName?: string;
}

export async function generateCutPdf(data: CutPdfData): Promise<Buffer> {
  const layout = await createPdfLayout();
  const { doc, bold, font } = layout;

  layout.page.drawText(data.companyName || 'Sistema de Consignaciones', { x: PDF_MARGIN, y: layout.y, size: 16, font: bold });
  layout.y -= 20;
  layout.page.drawText(`Corte de Consignación #${String(data.cutNumber).padStart(5, '0')}`, {
    x: PDF_MARGIN,
    y: layout.y,
    size: 13,
    font: bold,
  });
  layout.y -= 25;

  layout.page.drawText(`Cliente: ${data.customerName} (${data.customerCode})`, { x: PDF_MARGIN, y: layout.y, size: 10, font });
  layout.y -= 15;
  layout.page.drawText(`Fecha: ${data.cutDate.toLocaleDateString('es-PA')}`, { x: PDF_MARGIN, y: layout.y, size: 10, font });
  layout.y -= 25;

  const colX = {
    ref: PDF_MARGIN,
    prod: PDF_MARGIN + 70,
    ant: PDF_MARGIN + 260,
    cont: PDF_MARGIN + 320,
    vend: PDF_MARGIN + 380,
    precio: PDF_MARGIN + 440,
    total: PDF_MARGIN + 500,
  };

  function drawTableHeader() {
    layout.page.drawText('Ref', { x: colX.ref, y: layout.y, size: 9, font: bold });
    layout.page.drawText('Producto', { x: colX.prod, y: layout.y, size: 9, font: bold });
    layout.page.drawText('Ant.', { x: colX.ant, y: layout.y, size: 9, font: bold });
    layout.page.drawText('Cont.', { x: colX.cont, y: layout.y, size: 9, font: bold });
    layout.page.drawText('Vend.', { x: colX.vend, y: layout.y, size: 9, font: bold });
    layout.page.drawText('Precio', { x: colX.precio, y: layout.y, size: 9, font: bold });
    layout.page.drawText('Total', { x: colX.total, y: layout.y, size: 9, font: bold });
    layout.y -= 5;
    drawLine(layout);
    layout.y -= 15;
  }

  drawTableHeader();

  for (const item of data.items) {
    if (ensureSpace(layout)) drawTableHeader();
    layout.page.drawText(item.productSku, { x: colX.ref, y: layout.y, size: 9, font });
    layout.page.drawText(truncate(item.productName, 30), { x: colX.prod, y: layout.y, size: 9, font });
    layout.page.drawText(item.previousQty, { x: colX.ant, y: layout.y, size: 9, font });
    layout.page.drawText(item.countedQty ?? '—', { x: colX.cont, y: layout.y, size: 9, font });
    layout.page.drawText(item.soldQty, { x: colX.vend, y: layout.y, size: 9, font });
    layout.page.drawText(item.unitPrice, { x: colX.precio, y: layout.y, size: 9, font });
    layout.page.drawText(item.lineAmount, { x: colX.total, y: layout.y, size: 9, font });
    layout.y -= 16;
  }

  ensureSpace(layout, 70);
  layout.y -= 10;
  drawLine(layout);
  layout.y -= 20;
  layout.page.drawText(`TOTAL DEL CORTE: ${data.totalAmount}`, { x: PDF_MARGIN, y: layout.y, size: 12, font: bold });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
