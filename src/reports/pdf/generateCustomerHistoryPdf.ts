import { createPdfLayout, ensureSpace, drawLine, truncate, PDF_MARGIN } from './pdfHelpers';

/**
 * PDF del Historial del Cliente (sección 8: "cada cliente debe tener una
 * vista de historial completo"). Reutiliza exactamente los mismos eventos
 * que ya arma `buildHistorial()` en la pantalla de detalle del cliente
 * (facturas, cortes, pagos, devoluciones y ajustes, ordenados del más
 * reciente al más antiguo) para que el documento y la pantalla coincidan
 * siempre.
 */
export interface CustomerHistoryPdfData {
  customerName: string;
  customerCode: string;
  generatedDate: Date;
  events: Array<{ date: Date; type: string; detail: string }>;
  companyName?: string;
}

export async function generateCustomerHistoryPdf(data: CustomerHistoryPdfData): Promise<Buffer> {
  const layout = await createPdfLayout();
  const { doc, bold, font } = layout;

  layout.page.drawText(data.companyName || 'Sistema de Consignaciones', { x: PDF_MARGIN, y: layout.y, size: 16, font: bold });
  layout.y -= 20;
  layout.page.drawText('Historial del Cliente', { x: PDF_MARGIN, y: layout.y, size: 13, font: bold });
  layout.y -= 25;
  layout.page.drawText(`Cliente: ${data.customerName} (${data.customerCode})`, { x: PDF_MARGIN, y: layout.y, size: 10, font });
  layout.y -= 15;
  layout.page.drawText(`Generado: ${data.generatedDate.toLocaleDateString('es-PA')}`, { x: PDF_MARGIN, y: layout.y, size: 9, font });
  layout.y -= 25;

  const colX = { fecha: PDF_MARGIN, tipo: PDF_MARGIN + 70, detalle: PDF_MARGIN + 160 };

  function drawTableHeader() {
    layout.page.drawText('Fecha', { x: colX.fecha, y: layout.y, size: 9, font: bold });
    layout.page.drawText('Evento', { x: colX.tipo, y: layout.y, size: 9, font: bold });
    layout.page.drawText('Detalle', { x: colX.detalle, y: layout.y, size: 9, font: bold });
    layout.y -= 5;
    drawLine(layout);
    layout.y -= 15;
  }

  drawTableHeader();

  for (const e of data.events) {
    if (ensureSpace(layout)) drawTableHeader();
    layout.page.drawText(e.date.toLocaleDateString('es-PA'), { x: colX.fecha, y: layout.y, size: 9, font });
    layout.page.drawText(truncate(e.type, 14), { x: colX.tipo, y: layout.y, size: 9, font });
    layout.page.drawText(truncate(e.detail, 60), { x: colX.detalle, y: layout.y, size: 9, font });
    layout.y -= 16;
  }

  if (data.events.length === 0) {
    layout.page.drawText('Sin actividad registrada todavía.', { x: PDF_MARGIN, y: layout.y, size: 10, font });
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
