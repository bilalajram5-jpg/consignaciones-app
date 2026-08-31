import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/auth/session';
import { getCustomerById } from '@/services/customerService';
import { getAccountStatement, getCustomerBalance } from '@/services/accountService';
import { generateAccountStatementPdf, type AccountStatementPdfData } from '@/reports/pdf/generateAccountStatementPdf';
import { ForbiddenError } from '@/auth/permissions';
import { MOVEMENT_TYPE_LABELS } from '@/lib/utils';

/**
 * GET /api/documents/statement/:customerId?from=YYYY-MM-DD&to=YYYY-MM-DD
 * PDF del Estado de Cuenta (sección 11). Protegido con el mismo permiso
 * que la pantalla ('receivables.view') — revalidado server-side, nunca
 * confiando en que el botón esté oculto en el frontend (sección 22).
 */
export async function GET(request: NextRequest, { params }: { params: { customerId: string } }) {
  try {
    await requireUser('receivables.view');
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const customer = await getCustomerById(params.customerId);
  if (!customer) {
    return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
  }

  const fromParam = request.nextUrl.searchParams.get('from');
  const toParam = request.nextUrl.searchParams.get('to');
  const from = fromParam ? new Date(fromParam) : undefined;
  const to = toParam ? new Date(toParam) : undefined;

  const [rows, finalBalance] = await Promise.all([
    getAccountStatement({ customerId: params.customerId, from, to }),
    getCustomerBalance(params.customerId),
  ]);

  const data: AccountStatementPdfData = {
    customerName: customer.tradeName,
    customerCode: customer.code,
    generatedDate: new Date(),
    from: from ?? null,
    to: to ?? null,
    movements: rows.map((r) => ({
      date: r.date,
      typeLabel: MOVEMENT_TYPE_LABELS[r.type] ?? r.type,
      documentRef: r.documentRef,
      debit: r.debit,
      credit: r.credit,
      balance: r.balance,
    })),
    // El saldo final del documento SIEMPRE es el saldo total actual del
    // cliente (no el saldo corrido de la última fila filtrada), para que
    // coincida con la tarjeta "Saldo pendiente" del encabezado aunque se
    // filtre por rango de fechas.
    finalBalance,
  };

  const pdfBuffer = await generateAccountStatementPdf(data);

  return new NextResponse(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="estado-de-cuenta-${customer.code}.pdf"`,
    },
  });
}
