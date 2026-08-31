import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/auth/session';
import { getCustomerById } from '@/services/customerService';
import { getCustomerHistory } from '@/services/historyService';
import { generateCustomerHistoryPdf, type CustomerHistoryPdfData } from '@/reports/pdf/generateCustomerHistoryPdf';
import { ForbiddenError } from '@/auth/permissions';

/**
 * GET /api/documents/customer-history/:customerId
 * PDF del Historial del Cliente (sección 8). Usa el mismo
 * `getCustomerHistory` que alimenta la pestaña "Historial" en pantalla.
 */
export async function GET(request: NextRequest, { params }: { params: { customerId: string } }) {
  try {
    await requireUser('customers.view');
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const customer = await getCustomerById(params.customerId);
  if (!customer) {
    return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
  }

  const events = await getCustomerHistory(params.customerId);

  const data: CustomerHistoryPdfData = {
    customerName: customer.tradeName,
    customerCode: customer.code,
    generatedDate: new Date(),
    events,
  };

  const pdfBuffer = await generateCustomerHistoryPdf(data);

  return new NextResponse(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="historial-${customer.code}.pdf"`,
    },
  });
}
