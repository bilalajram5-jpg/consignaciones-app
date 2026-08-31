import { createPdfLayout, ensureSpace, drawLine, truncate, PDF_MARGIN } from './pdfHelpers';

/**
 * PDF del Inventario Actual de un cliente (secciones 4/5/17): foto del
 * inventario en consignación vigente al momento de generar el documento —
 * útil para llevar impreso a una visita o para dejar constancia de lo que
 * el cliente debería tener antes de un conteo físico. Usa la misma fuente
 * de datos que la pestaña "Inventario" de la ficha del cliente
 * (`getCustomerConsignmentInventory`), así que nunca puede mostrar
 * cantidades distintas a las que ya se ven en pantalla.
 */
export interface CurrentInventoryPdfData {
  customerName: string;
  customerCode: string;
  generatedDate: Date;
  items: Array<{
    sku: string;
    productName: string;
    unitPrice: string;
    availableQty: string;
    value: string;
  }>;
  totalValue: string;
  companyName?: string;
}

export async function generateCurrentInventoryPdf(data: CurrentInventoryPdfData): Promise<Buffer> {
  const layout = await createPdfLayout();
  const { doc, bold, font } = layout;

  layout.page.drawText(data.companyName || 'Sistema de Consignaciones', { x: PDF_MARGIN, y: layout.y, size: 16, font: bold });
  layout.y -= 20;
  layout.page.drawText('Inventario Actual en Consignación', { x: PDF_MARGIN, y: layout.y, size: 13, font: bold });
  layout.y -= 25;
  layout.page.drawText(`Cliente: ${data.customerName} (${data.customerCode})`, { x: PDF_MARGIN, y: layout.y, size: 10, font });
  layout.y -= 15;
  layout.page.drawText(`Generado: ${data.generatedDate.toLocaleDateString('es-PA')}`, { x: PDF_MARGIN, y: layout.y, size: 9, font });
  layout.y -= 25;

  const colX = {
    ref: PDF_MARGIN,
    prod: PDF_MARGIN + 70,
    precio: PDF_MARGIN + 320,
    disp: PDF_MARGIN + 400,
    valor: PDF_MARGIN + 470,
  };

  function drawTableHeader() {
    layout.page.drawText('Ref', { x: colX.ref, y: layout.y, size: 9, font: bold });
    layout.page.drawText('Producto', { x: colX.prod, y: layout.y, size: 9, font: bold });
    layout.page.drawText('Precio', { x: colX.precio, y: layout.y, size: 9, font: bold });
    layout.page.drawText('Disponible', { x: colX.disp, y: layout.y, size: 9, font: bold });
    layout.page.drawText('Valor', { x: colX.valor, y: layout.y, size: 9, font: bold });
    layout.y -= 5;
    drawLine(layout);
    layout.y -= 15;
  }

  drawTableHeader();

  for (const item of data.items) {
    if (ensureSpace(layout)) drawTableHeader();
    layout.page.drawText(item.sku, { x: colX.ref, y: layout.y, size: 9, font });
    layout.page.drawText(truncate(item.productName, 38), { x: colX.prod, y: layout.y, size: 9, font });
    layout.page.drawText(item.unitPrice, { x: colX.precio, y: layout.y, size: 9, font });
    layout.page.drawText(item.availableQty, { x: colX.disp, y: layout.y, size: 9, font });
    layout.page.drawText(item.value, { x: colX.valor, y: layout.y, size: 9, font });
    layout.y -= 16;
  }

  if (data.items.length === 0) {
    layout.page.drawText('Este cliente todavía no tiene inventario en consignación.', { x: PDF_MARGIN, y: layout.y, size: 10, font });
    layout.y -= 20;
  }

  ensureSpace(layout, 70);
  layout.y -= 10;
  drawLine(layout);
  layout.y -= 20;
  layout.page.drawText(`VALOR TOTAL DEL INVENTARIO: ${data.totalValue}`, { x: PDF_MARGIN, y: layout.y, size: 12, font: bold });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
