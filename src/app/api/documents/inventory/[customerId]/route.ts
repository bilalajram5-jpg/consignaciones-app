import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/auth/session';
import { getCustomerById } from '@/services/customerService';
import { getCustomerConsignmentInventory } from '@/services/inventoryService';
import { generateCurrentInventoryPdf, type CurrentInventoryPdfData } from '@/reports/pdf/generateCurrentInventoryPdf';
import { ForbiddenError } from '@/auth/permissions';
import { Money } from '@/lib/money';

/**
 * GET /api/documents/inventory/:customerId
 * PDF del Inventario Actual en consignación de un cliente (secciones
 * 4/5/17). Usa exactamente `getCustomerConsignmentInventory`, la misma
 * fuente que alimenta la pestaña "Inventario" en pantalla.
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

  const inventory = await getCustomerConsignmentInventory(params.customerId);

  const items = inventory.map((line) => {
    const value = Money.fromDecimal(line.referenceUnitPrice).multiplyByQuantity(Math.max(line.availableQty, 0));
    return {
      sku: line.sku,
      productName: line.productName,
      unitPrice: Money.fromDecimal(line.referenceUnitPrice).toDecimalString(),
      availableQty: String(line.availableQty),
      value: value.toDecimalString(),
    };
  });

  const totalValue = Money.sum(
    inventory.map((line) => Money.fromDecimal(line.referenceUnitPrice).multiplyByQuantity(Math.max(line.availableQty, 0)))
  ).toDecimalString();

  const data: CurrentInventoryPdfData = {
    customerName: customer.tradeName,
    customerCode: customer.code,
    generatedDate: new Date(),
    items,
    totalValue,
  };

  const pdfBuffer = await generateCurrentInventoryPdf(data);

  return new NextResponse(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="inventario-${customer.code}.pdf"`,
    },
  });
}
