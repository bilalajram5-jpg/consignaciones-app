import { prisma } from '@/lib/prisma';
import { calculateCurrentInventory } from '@/domain/inventory/currentInventory';
import { Money } from '@/lib/money';

export interface ProductInventoryLine {
  productId: string;
  sku: string;
  barcode: string | null;
  productName: string;
  availableQty: number;
  /** Precio de referencia para mostrar en pantalla (del lote más reciente con stock) */
  referenceUnitPrice: string;
  batches: Array<{
    batchId: string;
    availableQty: number;
    unitPrice: string;
    batchDate: Date;
  }>;
}

/**
 * Inventario en consignación de un cliente, agrupado por producto
 * (secciones 4 y 5: "Realizar inventario" muestra todos los productos que
 * el cliente debería tener). Cada línea trae también el detalle por lote
 * para poder hacer la asignación FIFO cuando se registre la venta.
 */
export async function getCustomerConsignmentInventory(customerId: string): Promise<ProductInventoryLine[]> {
  const batches = await prisma.consignmentBatch.findMany({
    where: { customerId },
    include: { product: true },
    orderBy: { batchDate: 'asc' },
  });

  const byProduct = new Map<string, ProductInventoryLine>();

  for (const b of batches) {
    const available = calculateCurrentInventory({
      deliveredQty: Number(b.deliveredQty),
      soldQty: Number(b.soldQty),
      returnedQty: Number(b.returnedQty),
      adjustedQty: Number(b.adjustedQty),
    });

    const existing = byProduct.get(b.productId);
    const line: ProductInventoryLine = existing ?? {
      productId: b.productId,
      sku: b.product.sku,
      barcode: b.product.barcode,
      productName: b.product.name,
      availableQty: 0,
      referenceUnitPrice: b.unitPrice.toString(),
      batches: [],
    };

    line.availableQty = Math.round((line.availableQty + available) * 1000) / 1000;
    if (available > 0) {
      line.referenceUnitPrice = b.unitPrice.toString(); // el lote más reciente con stock manda el precio de referencia
    }
    line.batches.push({
      batchId: b.id,
      availableQty: available,
      unitPrice: b.unitPrice.toString(),
      batchDate: b.batchDate,
    });

    byProduct.set(b.productId, line);
  }

  // Solo productos con al menos un lote alguna vez entregado (aunque hoy
  // estén en 0, se muestran en gris en la UI — ver components/inventory).
  return Array.from(byProduct.values()).sort((a, b) => a.sku.localeCompare(b.sku));
}

/** Total valorizado del inventario en consignación de TODOS los clientes (dashboard, sección 16). */
export async function getTotalConsignmentValue(): Promise<string> {
  const batches = await prisma.consignmentBatch.findMany();
  const total = Money.sum(
    batches.map((b) => {
      const available = calculateCurrentInventory({
        deliveredQty: Number(b.deliveredQty),
        soldQty: Number(b.soldQty),
        returnedQty: Number(b.returnedQty),
        adjustedQty: Number(b.adjustedQty),
      });
      return Money.fromDecimal(b.unitPrice.toString()).multiplyByQuantity(Math.max(available, 0));
    })
  );
  return total.toDecimalString();
}
