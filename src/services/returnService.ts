import { withSerializableTransaction } from '@/lib/db/transaction';
import { prisma } from '@/lib/prisma';
import type { ReturnInput } from '@/lib/validators/schemas';
import { recordAudit } from './auditService';

/**
 * Devoluciones (sección 13 y regla #4 de la sección 34): reducen el
 * inventario consignado, pero NUNCA generan cargo en cuentas por cobrar —
 * a diferencia de una venta. Se registra contra lotes específicos (para
 * conservar trazabilidad de cuál factura originó el producto devuelto).
 */
export async function createReturn(input: ReturnInput, actingUserId: string) {
  return withSerializableTransaction(async (tx) => {
    for (const item of input.items) {
      const batch = await tx.consignmentBatch.findUniqueOrThrow({ where: { id: item.consignmentBatchId } });
      const available =
        Number(batch.deliveredQty) - Number(batch.soldQty) - Number(batch.returnedQty) + Number(batch.adjustedQty);
      if (Number(item.quantity) > available) {
        throw new Error(
          `No se puede devolver ${item.quantity} unidades del lote ${batch.id}: solo hay ${available} disponibles en ese lote.`
        );
      }
    }

    const ret = await tx.return.create({
      data: {
        customerId: input.customerId,
        returnDate: input.returnDate,
        reason: input.reason,
        registeredById: actingUserId,
        items: {
          create: input.items.map((i) => ({
            consignmentBatchId: i.consignmentBatchId,
            productId: i.productId,
            quantity: i.quantity,
          })),
        },
      },
      include: { items: true },
    });

    for (const item of input.items) {
      await tx.consignmentBatch.update({
        where: { id: item.consignmentBatchId },
        data: { returnedQty: { increment: item.quantity } },
      });
    }

    await recordAudit(
      {
        userId: actingUserId,
        action: 'RETURN_CREATE',
        entityType: 'Return',
        entityId: ret.id,
        newValue: { customerId: input.customerId, items: input.items, reason: input.reason },
      },
      tx
    );

    return ret;
  });
}

export async function listReturnsByCustomer(customerId: string) {
  return prisma.return.findMany({
    where: { customerId },
    include: { items: { include: { product: true } } },
    orderBy: { returnDate: 'desc' },
  });
}
