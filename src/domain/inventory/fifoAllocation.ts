import { Money } from '../../lib/money.ts';
import { InsufficientInventoryError, InvalidQuantityError } from '../errors.ts';

/**
 * Asignación FIFO de una venta a través de los lotes de consignación de un
 * producto (sección 15 del prompt maestro: "El precio debe quedar asociado
 * al lote/factura original... Implementar una estrategia de asignación de
 * inventario como FIFO por defecto").
 *
 * Por qué FIFO por defecto: cuando un cliente tiene el mismo producto
 * entregado en varias facturas a precios distintos (ej. Factura 100: A=$20,
 * Factura 200: A=$22), al registrarse una venta hay que decidir de qué
 * lote(s) sale esa unidad para saber a qué precio histórico se factura. FIFO
 * (se agota primero el lote más antiguo) es el estándar contable más común
 * para inventario y el más predecible/auditable para el cliente y el
 * vendedor. Queda documentado aquí y en ARCHITECTURE.md/DECISIONS.md.
 *
 * Esta función es pura: no consulta la base de datos. La capa de servicios
 * (`src/services/inventoryService.ts`) es responsable de traer los lotes con
 * inventario disponible > 0 de un producto+cliente, ordenados, y de
 * persistir el resultado (actualizar `soldQty` de cada lote afectado dentro
 * de una transacción).
 */

export interface FifoBatchInput {
  batchId: string;
  /** Inventario disponible de ESTE lote (delivered - sold - returned + adjusted) */
  availableQty: number;
  /** Precio histórico de este lote, como string decimal (ej. "20.00") */
  unitPrice: string;
  /** Fecha del lote (= fecha de la factura de origen), usada para ordenar FIFO */
  batchDate: string | Date;
}

export interface FifoAllocationLine {
  batchId: string;
  qty: number;
  unitPrice: string;
  amount: string;
}

export interface FifoAllocationResult {
  allocations: FifoAllocationLine[];
  totalAmount: string;
  allocatedQty: number;
}

export function allocateFifo(batches: FifoBatchInput[], requestedQty: number): FifoAllocationResult {
  if (!Number.isFinite(requestedQty) || requestedQty < 0) {
    throw new InvalidQuantityError(`requestedQty inválido: ${requestedQty}`);
  }

  const totalAvailable = batches.reduce((sum, b) => sum + b.availableQty, 0);
  if (requestedQty > totalAvailable) {
    throw new InsufficientInventoryError(requestedQty, Math.round(totalAvailable * 1000) / 1000);
  }

  const sorted = [...batches].sort(
    (a, b) => new Date(a.batchDate).getTime() - new Date(b.batchDate).getTime()
  );

  let remaining = requestedQty;
  const allocations: FifoAllocationLine[] = [];
  let total = Money.zero();

  for (const batch of sorted) {
    if (remaining <= 0) break;
    if (batch.availableQty <= 0) continue;

    const qty = Math.min(remaining, batch.availableQty);
    const amount = Money.fromDecimal(batch.unitPrice).multiplyByQuantity(qty);
    allocations.push({
      batchId: batch.batchId,
      qty: Math.round(qty * 1000) / 1000,
      unitPrice: batch.unitPrice,
      amount: amount.toDecimalString(),
    });
    total = total.add(amount);
    remaining = Math.round((remaining - qty) * 1000) / 1000;
  }

  return {
    allocations,
    totalAmount: total.toDecimalString(),
    allocatedQty: Math.round((requestedQty - remaining) * 1000) / 1000,
  };
}
