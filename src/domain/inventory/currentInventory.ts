import { InvalidQuantityError } from '../errors.ts';

/**
 * Fórmula oficial de inventario actual (sección 4 del prompt maestro):
 *
 *   Inventario actual = Cantidad entregada - Cantidad vendida - Cantidad
 *                        devuelta +/- ajustes
 *
 * `deliveredQty` es inmutable por lote (nunca se modifica tras la creación
 * del lote de consignación); `soldQty`, `returnedQty` y `adjustedQty` son
 * acumuladores que solo crecen (o, en el caso de `adjustedQty`, pueden ser
 * positivos o negativos) a través de eventos explícitos (venta, devolución,
 * ajuste), cada uno con su propio registro histórico. Esta función NUNCA
 * escribe nada; solo calcula, para que tanto el lote individual como
 * cualquier agregado (por producto, por cliente) usen la misma fórmula.
 */

export interface InventoryComponents {
  deliveredQty: number;
  soldQty: number;
  returnedQty: number;
  /** Puede ser negativo (ej. producto perdido) o positivo (ej. corrección a favor) */
  adjustedQty: number;
}

export function calculateCurrentInventory(components: InventoryComponents): number {
  const { deliveredQty, soldQty, returnedQty, adjustedQty } = components;
  for (const [key, value] of Object.entries({ deliveredQty, soldQty, returnedQty, adjustedQty })) {
    if (!Number.isFinite(value)) {
      throw new InvalidQuantityError(`${key} inválido: ${value}`);
    }
  }
  if (deliveredQty < 0 || soldQty < 0 || returnedQty < 0) {
    throw new InvalidQuantityError('deliveredQty, soldQty y returnedQty no pueden ser negativos');
  }
  const result = deliveredQty - soldQty - returnedQty + adjustedQty;
  return Math.round(result * 1000) / 1000;
}

/**
 * Suma el inventario actual de varios lotes (ej. todos los lotes de un
 * producto para un cliente, entregados en distintas facturas — sección 14:
 * "No sobrescribir inventarios anteriores... mostrar inventario
 * consolidado").
 */
export function calculateConsolidatedInventory(batches: InventoryComponents[]): number {
  const total = batches.reduce((sum, b) => sum + calculateCurrentInventory(b), 0);
  return Math.round(total * 1000) / 1000;
}
