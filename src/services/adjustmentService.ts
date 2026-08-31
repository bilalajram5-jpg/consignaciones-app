import { withSerializableTransaction } from '@/lib/db/transaction';
import { prisma } from '@/lib/prisma';
import type { AdjustmentInput } from '@/lib/validators/schemas';
import { recordAudit } from './auditService';

/**
 * Ajustes de inventario (sección 6 y regla #5 de la sección 34: "Los
 * ajustes requieren motivo"). Es el ÚNICO mecanismo permitido para
 * modificar el inventario fuera de una venta, devolución o entrega —
 * nunca se edita `deliveredQty`/`soldQty` directamente desde ningún otro
 * flujo. Siempre queda auditado con usuario, fecha, motivo y cantidad.
 */
export async function createAdjustment(input: AdjustmentInput, actingUserId: string) {
  return withSerializableTransaction(async (tx) => {
    const batch = await tx.consignmentBatch.findUniqueOrThrow({ where: { id: input.consignmentBatchId } });
    const availableBefore =
      Number(batch.deliveredQty) - Number(batch.soldQty) - Number(batch.returnedQty) + Number(batch.adjustedQty);
    const availableAfter = availableBefore + Number(input.quantity);

    if (availableAfter < 0) {
      throw new Error(
        `Este ajuste dejaría el inventario del lote en ${availableAfter} unidades (negativo), lo cual no es válido. Disponible actual: ${availableBefore}.`
      );
    }

    const adjustment = await tx.inventoryAdjustment.create({
      data: {
        customerId: input.customerId,
        consignmentBatchId: input.consignmentBatchId,
        productId: input.productId,
        quantity: input.quantity,
        reason: input.reason,
        category: input.category,
        createdById: actingUserId,
      },
    });

    await tx.consignmentBatch.update({
      where: { id: input.consignmentBatchId },
      data: { adjustedQty: { increment: input.quantity } },
    });

    await recordAudit(
      {
        userId: actingUserId,
        action: 'INVENTORY_ADJUSTMENT',
        entityType: 'InventoryAdjustment',
        entityId: adjustment.id,
        previousValue: { availableBefore },
        newValue: { availableAfter, quantity: input.quantity, reason: input.reason, category: input.category },
      },
      tx
    );

    return adjustment;
  });
}

export async function listAdjustmentsByCustomer(customerId: string) {
  return prisma.inventoryAdjustment.findMany({
    where: { customerId },
    include: { product: true },
    orderBy: { createdAt: 'desc' },
  });
}
