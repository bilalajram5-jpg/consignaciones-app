import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/auth/session';
import { getPaymentById } from '@/services/paymentService';
import { generatePaymentReceiptPdf, type PaymentReceiptPdfData } from '@/reports/pdf/generatePaymentReceiptPdf';
import { ForbiddenError } from '@/auth/permissions';

/**
 * GET /api/documents/payment/:paymentId
 * PDF del Recibo de Pago (sección 10). Protegido con 'payments.view',
 * revalidado server-side.
 */
export async function GET(request: NextRequest, { params }: { params: { paymentId: string } }) {
  try {
    await requireUser('payments.view');
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const result = await getPaymentById(params.paymentId);
  if (!result) {
    return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 });
  }
  const { payment, balanceAfter } = result;

  const data: PaymentReceiptPdfData = {
    receiptNumber: payment.id.slice(-8).toUpperCase(),
    customerName: payment.customer.tradeName,
    customerCode: payment.customer.code,
    paymentDate: payment.paymentDate,
    amount: payment.amount.toString(),
    method: payment.method,
    referenceNumber: payment.referenceNumber,
    bank: payment.bank,
    notes: payment.notes,
    registeredByName: payment.registeredBy?.name || 'Usuario del sistema',
    balanceAfter,
  };

  const pdfBuffer = await generatePaymentReceiptPdf(data);

  return new NextResponse(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="recibo-pago-${data.receiptNumber}.pdf"`,
    },
  });
}
