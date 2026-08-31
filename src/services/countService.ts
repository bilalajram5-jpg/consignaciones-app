import { prisma } from '@/lib/prisma';
import { reconcileInventoryCount, type CountEntryMode } from '@/domain/inventory/reconcileInventoryCount';
import { allocateFifo } from '@/domain/inventory/fifoAllocation';
import { getCustomerConsignmentInventory } from './inventoryService';
import { InventoryDiscrepancyError } from '@/domain/errors';

/**
 * Servicio del módulo "Realizar inventario" (sección 5): maneja el
 * borrador de una visita, permitiendo guardar y continuar después (sección
 * 25: "Guardar borrador"). La confirmación final (que genera el corte
 * inmutable) vive en `cutService.ts`.
 */

export async function getOrCreateDraftCount(customerId: string, actingUserId: string) {
  const existingDraft = await prisma.inventoryCount.findFirst({
    where: { customerId, status: 'BORRADOR' },
    include: { items: true },
  });
  if (existingDraft) return existingDraft;

  return prisma.inventoryCount.create({
    data: { customerId, status: 'BORRADOR', countedById: actingUserId },
    include: { items: true },
  });
}

export async function getDraftCount(inventoryCountId: string) {
  return prisma.inventoryCount.findUniqueOrThrow({
    where: { id: inventoryCountId },
    include: { items: { include: { product: true } }, customer: true },
  });
}

export interface SaveCountItemInput {
  inventoryCountId: string;
  productId: string;
  entryMode: CountEntryMode;
  countedQty?: number;
  soldQty?: number;
}

export interface SaveCountItemResult {
  item: Awaited<ReturnType<typeof prisma.inventoryCountItem.upsert>>;
  hasDiscrepancy: boolean;
}

/**
 * Guarda (o actualiza) la línea de un producto dentro del borrador de
 * inventario. Modo A y Modo B pasan por la MISMA función de dominio
 * `reconcileInventoryCount`, garantizando resultados idénticos (sección 5).
 *
 * Si hay discrepancia (conteo físico > inventario del sistema), la línea
 * se guarda igual mostrando la alerta, PERO queda marcada
 * `hasDiscrepancy: true` y el corte no podrá confirmarse hasta que se
 * resuelva con un ajuste explícito (ver adjustmentService.ts + sección 6).
 */
export async function saveCountItem(input: SaveCountItemInput): Promise<SaveCountItemResult> {
  const count = await prisma.inventoryCount.findUniqueOrThrow({ where: { id: input.inventoryCountId } });
  if (count.status !== 'BORRADOR') {
    throw new Error('Este inventario ya fue confirmado y no se puede modificar. Usa un ajuste para corregirlo.');
  }

  const inventoryLines = await getCustomerConsignmentInventory(count.customerId);
  const line = inventoryLines.find((l) => l.productId === input.productId);
  if (!line) {
    throw new Error('Este producto no tiene lotes de consignación registrados para este cliente.');
  }

  const reconciled = reconcileInventoryCount({
    previousQty: line.availableQty,
    mode: input.entryMode,
    countedQty: input.countedQty,
    soldQty: input.soldQty,
  });

  let batchAllocations: unknown[] = [];
  let lineAmount = '0.00';

  if (!reconciled.hasDiscrepancy && reconciled.soldQty > 0) {
    const allocation = allocateFifo(
      line.batches.map((b) => ({
        batchId: b.batchId,
        availableQty: b.availableQty,
        unitPrice: b.unitPrice,
        batchDate: b.batchDate,
      })),
      reconciled.soldQty
    );
    batchAllocations = allocation.allocations;
    lineAmount = allocation.totalAmount;
  }

  // Upsert atómico por la clave compuesta única (inventoryCountId, productId)
  // — ver @@unique en prisma/schema.prisma. Esto evita una condición de
  // carrera si, por algún motivo, se guardara la misma línea dos veces casi
  // simultáneamente (ej. doble tap en un botón desde el móvil).
  const item = await prisma.inventoryCountItem.upsert({
    where: {
      inventoryCountId_productId: {
        inventoryCountId: input.inventoryCountId,
        productId: input.productId,
      },
    },
    create: {
      inventoryCountId: input.inventoryCountId,
      productId: input.productId,
      entryMode: input.entryMode,
      previousQty: String(reconciled.previousQty),
      countedQty: String(reconciled.countedQty),
      soldQty: String(reconciled.soldQty),
      newQty: String(reconciled.newQty),
      unitPrice: line.referenceUnitPrice,
      lineAmount,
      hasDiscrepancy: reconciled.hasDiscrepancy,
      batchAllocations: batchAllocations as object,
    },
    update: {
      entryMode: input.entryMode,
      previousQty: String(reconciled.previousQty),
      countedQty: String(reconciled.countedQty),
      soldQty: String(reconciled.soldQty),
      newQty: String(reconciled.newQty),
      unitPrice: line.referenceUnitPrice,
      lineAmount,
      hasDiscrepancy: reconciled.hasDiscrepancy,
      batchAllocations: batchAllocations as object,
    },
  });

  return { item, hasDiscrepancy: reconciled.hasDiscrepancy };
}

/** Resumen antes de finalizar (sección 26). */
export async function getCountSummary(inventoryCountId: string) {
  const count = await prisma.inventoryCount.findUniqueOrThrow({
    where: { id: inventoryCountId },
    include: { items: true },
  });

  const soldUnits = count.items.reduce((sum, i) => sum + Number(i.soldQty), 0);
  const totalAmount = count.items.reduce((sum, i) => sum + Number(i.lineAmount), 0);
  const discrepancies = count.items.filter((i) => i.hasDiscrepancy);

  return {
    itemsReviewed: count.items.length,
    soldUnits,
    totalAmount: totalAmount.toFixed(2),
    discrepanciesCount: discrepancies.length,
    hasUnresolvedDiscrepancies: discrepancies.length > 0,
  };
}

export function assertNoUnresolvedDiscrepancies(items: { hasDiscrepancy: boolean }[]): void {
  if (items.some((i) => i.hasDiscrepancy)) {
    throw new InventoryDiscrepancyError(0, 0);
  }
}
