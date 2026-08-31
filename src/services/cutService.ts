import { prisma } from '@/lib/prisma';
import { withSerializableTransaction } from '@/lib/db/transaction';
import { InventoryDiscrepancyError } from '@/domain/errors';
import { recordAudit } from './auditService';

/**
 * Confirma un "Corte de Consignación" (secciones 8 y 26 del prompt maestro).
 * Este es el paso más sensible de todo el sistema: a partir de aquí, la
 * visita queda INMUTABLE y genera automáticamente el cargo correspondiente
 * en cuentas por cobrar (sección 34, regla #6: "Cada venta genera una
 * obligación de pago").
 *
 * Se ejecuta dentro de una transacción SERIALIZABLE (ver
 * src/lib/db/transaction.ts) porque lee y escribe `ConsignmentBatch.soldQty`
 * — si dos cortes para el mismo lote se confirmaran concurrentemente, un
 * aislamiento más débil podría permitir vender el mismo inventario dos
 * veces ("lost update"). Con SERIALIZABLE, Postgres garantiza que uno de
 * los dos se reintente/rechace en vez de corromper el inventario.
 */
export async function confirmInventoryCut(inventoryCountId: string, actingUserId: string) {
  return withSerializableTransaction(async (tx) => {
    const count = await tx.inventoryCount.findUniqueOrThrow({
      where: { id: inventoryCountId },
      include: { items: { include: { product: true } }, customer: true },
    });

    if (count.status === 'CONFIRMADO') {
      throw new Error('Este inventario ya fue confirmado anteriormente.');
    }
    if (count.items.length === 0) {
      throw new Error('No se puede confirmar un inventario sin productos revisados.');
    }

    // Regla dura (sección 6): ninguna discrepancia sin resolver puede
    // colarse en un corte confirmado. Debe resolverse con un ajuste
    // explícito ANTES de poder confirmar.
    const unresolved = count.items.filter((i) => i.hasDiscrepancy);
    if (unresolved.length > 0) {
      throw new InventoryDiscrepancyError(0, 0);
    }

    let soldUnits = 0;
    let totalAmountCents = 0;
    let adjustmentsCount = 0;

    const saleItemsToCreate: Array<{
      consignmentBatchId: string;
      productId: string;
      quantity: string;
      unitPrice: string;
      lineTotal: string;
    }> = [];

    for (const item of count.items) {
      soldUnits += Number(item.soldQty);
      totalAmountCents += Math.round(Number(item.lineAmount) * 100);

      const allocations = item.batchAllocations as Array<{
        batchId: string;
        qty: number;
        unitPrice: string;
        amount: string;
      }>;

      for (const alloc of allocations) {
        // Vuelve a leer el lote DENTRO de la transacción serializable (no
        // confía en el snapshot que se guardó al capturar la línea del
        // borrador, que pudo quedar desactualizado si hubo otra operación
        // concurrente sobre el mismo lote).
        const batch = await tx.consignmentBatch.findUniqueOrThrow({ where: { id: alloc.batchId } });
        const available =
          Number(batch.deliveredQty) - Number(batch.soldQty) - Number(batch.returnedQty) + Number(batch.adjustedQty);

        if (alloc.qty > available) {
          throw new Error(
            `Conflicto de inventario detectado al confirmar: el lote ${batch.id} ya no tiene ${alloc.qty} unidades disponibles (quedan ${available}). Vuelve a abrir el conteo de este producto.`
          );
        }

        await tx.consignmentBatch.update({
          where: { id: batch.id },
          data: { soldQty: { increment: alloc.qty } },
        });

        saleItemsToCreate.push({
          consignmentBatchId: batch.id,
          productId: item.productId,
          quantity: String(alloc.qty),
          unitPrice: alloc.unitPrice,
          lineTotal: alloc.amount,
        });
      }
    }

    const totalAmount = (totalAmountCents / 100).toFixed(2);

    // Snapshot inmutable para impresión/PDF (sección 8)
    const snapshot = {
      customer: { id: count.customer.id, tradeName: count.customer.tradeName, code: count.customer.code },
      visitDate: count.visitDate,
      items: count.items.map((i) => ({
        productSku: i.product.sku,
        productName: i.product.name,
        previousQty: i.previousQty.toString(),
        countedQty: i.countedQty?.toString() ?? null,
        soldQty: i.soldQty.toString(),
        unitPrice: i.unitPrice.toString(),
        lineAmount: i.lineAmount.toString(),
      })),
      totalAmount,
    };

    const cut = await tx.consignmentCut.create({
      data: {
        customerId: count.customerId,
        inventoryCountId: count.id,
        itemsCount: count.items.length,
        soldUnits: String(soldUnits),
        totalAmount,
        adjustmentsCount,
        returnsCount: 0,
        snapshot,
        createdBy: actingUserId,
      },
    });

    const sale = await tx.sale.create({
      data: {
        customerId: count.customerId,
        cutId: cut.id,
        totalAmount,
        items: { create: saleItemsToCreate },
      },
    });

    // Cargo automático en cuentas por cobrar (sección 34, regla #6)
    await tx.accountMovement.create({
      data: {
        customerId: count.customerId,
        type: 'CARGO_VENTA',
        debit: totalAmount,
        credit: '0.00',
        documentType: 'Corte',
        documentRef: `Corte #${String(cut.cutNumber).padStart(5, '0')}`,
        consignmentCutId: cut.id,
        createdById: actingUserId,
      },
    });

    const confirmedCount = await tx.inventoryCount.update({
      where: { id: count.id },
      data: { status: 'CONFIRMADO', confirmedAt: new Date() },
    });

    await recordAudit(
      {
        userId: actingUserId,
        action: 'CONSIGNMENT_CUT_CONFIRM',
        entityType: 'ConsignmentCut',
        entityId: cut.id,
        newValue: { cutNumber: cut.cutNumber, totalAmount, customerId: count.customerId },
      },
      tx
    );

    return { cut, sale, inventoryCount: confirmedCount };
  });
}

export async function getConsignmentCutById(id: string) {
  return prisma.consignmentCut.findUnique({
    where: { id },
    include: { customer: true, sale: { include: { items: { include: { product: true } } } } },
  });
}

export async function listConsignmentCutsByCustomer(customerId: string) {
  return prisma.consignmentCut.findMany({
    where: { customerId },
    orderBy: { cutDate: 'desc' },
  });
}

/**
 * Corrección de un corte ya confirmado (sección 26): NUNCA se edita el
 * corte. Se debe crear un InventoryAdjustment sobre el lote afectado, con
 * motivo obligatorio, que queda auditado y visible en el historial —
 * ver adjustmentService.ts.
 */
export const CORRECTION_POLICY_NOTE =
  'Los cortes confirmados son inmutables. Para corregir un error, registra un ajuste de inventario (con motivo) referenciando este corte en las notas.';
