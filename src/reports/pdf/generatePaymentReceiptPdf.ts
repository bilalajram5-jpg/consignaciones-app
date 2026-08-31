import { createPdfLayout, drawLine, PDF_MARGIN } from './pdfHelpers';

/**
 * Recibo de Pago (sección 10: "generar recibo/comprobante de pago").
 * Documento de una sola página, pensado para entregarse impreso o por
 * correo al cliente en el momento en que se registra el pago.
 */
export interface PaymentReceiptPdfData {
  receiptNumber: string;
  customerName: string;
  customerCode: string;
  paymentDate: Date;
  amount: string;
  method: string;
  referenceNumber: string | null;
  bank: string | null;
  notes: string | null;
  registeredByName: string;
  balanceAfter: string;
  companyName?: string;
}

const METHOD_LABELS: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  ACH: 'ACH',
  TRANSFERENCIA: 'Transferencia bancaria',
  CHEQUE: 'Cheque',
  TARJETA: 'Tarjeta',
  OTRO: 'Otro',
};

export async function generatePaymentReceiptPdf(data: PaymentReceiptPdfData): Promise<Buffer> {
  const layout = await createPdfLayout();
  const { doc, bold, font } = layout;

  layout.page.drawText(data.companyName || 'Sistema de Consignaciones', { x: PDF_MARGIN, y: layout.y, size: 16, font: bold });
  layout.y -= 24;
  layout.page.drawText('RECIBO DE PAGO', { x: PDF_MARGIN, y: layout.y, size: 14, font: bold });
  layout.y -= 16;
  layout.page.drawText(`No. ${data.receiptNumber}`, { x: PDF_MARGIN, y: layout.y, size: 10, font });
  layout.y -= 30;
  drawLine(layout);
  layout.y -= 25;

  const row = (label: string, value: string) => {
    layout.page.drawText(label, { x: PDF_MARGIN, y: layout.y, size: 10, font: bold });
    layout.page.drawText(value, { x: PDF_MARGIN + 160, y: layout.y, size: 10, font });
    layout.y -= 22;
  };

  row('Cliente:', `${data.customerName} (${data.customerCode})`);
  row('Fecha de pago:', data.paymentDate.toLocaleDateString('es-PA'));
  row('Método de pago:', METHOD_LABELS[data.method] ?? data.method);
  if (data.referenceNumber) row('Referencia:', data.referenceNumber);
  if (data.bank) row('Banco:', data.bank);
  row('Registrado por:', data.registeredByName);

  layout.y -= 10;
  drawLine(layout);
  layout.y -= 30;

  layout.page.drawText('MONTO RECIBIDO', { x: PDF_MARGIN, y: layout.y, size: 11, font: bold });
  layout.y -= 22;
  layout.page.drawText(data.amount, { x: PDF_MARGIN, y: layout.y, size: 22, font: bold });
  layout.y -= 35;

  layout.page.drawText(`Saldo pendiente después de este pago: ${data.balanceAfter}`, {
    x: PDF_MARGIN,
    y: layout.y,
    size: 10,
    font,
  });
  layout.y -= 25;

  if (data.notes) {
    layout.page.drawText('Notas:', { x: PDF_MARGIN, y: layout.y, size: 9, font: bold });
    layout.y -= 14;
    layout.page.drawText(data.notes.slice(0, 120), { x: PDF_MARGIN, y: layout.y, size: 9, font });
    layout.y -= 20;
  }

  layout.y -= 20;
  drawLine(layout);
  layout.y -= 20;
  layout.page.drawText('Este recibo confirma la recepción del pago indicado. No modifica cortes ni ventas anteriores.', {
    x: PDF_MARGIN,
    y: layout.y,
    size: 8,
    font,
  });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
