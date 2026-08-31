import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/auth/session';
import { getConsignmentCutById } from '@/services/cutService';
import { generateCutPdf, type CutPdfData } from '@/reports/pdf/generateCutPdf';
import { ForbiddenError } from '@/auth/permissions';

export async function GET(request: NextRequest, { params }: { params: { cutId: string } }) {
  try {
    await requireUser();
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const cut = await getConsignmentCutById(params.cutId);
  if (!cut) {
    return NextResponse.json({ error: 'Corte no encontrado' }, { status: 404 });
  }

  const snapshot = cut.snapshot as unknown as {
    items: Array<{
      productSku: string;
      productName: string;
      previousQty: string;
      countedQty: string | null;
      soldQty: string;
      unitPrice: string;
      lineAmount: string;
    }>;
  };

  const data: CutPdfData = {
    cutNumber: cut.cutNumber,
    customerName: cut.customer.tradeName,
    customerCode: cut.customer.code,
    cutDate: cut.cutDate,
    items: snapshot.items ?? [],
    totalAmount: cut.totalAmount.toString(),
  };

  const pdfBuffer = await generateCutPdf(data);

  return new NextResponse(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="corte-${cut.cutNumber}.pdf"`,
    },
  });
}
