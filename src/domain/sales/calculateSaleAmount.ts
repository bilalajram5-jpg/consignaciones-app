import { Money } from '../../lib/money.ts';

/**
 * Cálculo del monto de una venta a partir de líneas ya asignadas por FIFO
 * (ver fifoAllocation.ts). Cada línea conserva el precio histórico exacto
 * del lote del que salió, por lo que sumar aquí es simplemente sumar los
 * montos ya calculados — nunca se recalcula usando el precio ACTUAL del
 * producto (eso violaría la sección 15: "si el precio de un producto cambia
 * posteriormente, NO cambiar retroactivamente ventas anteriores").
 */

export interface SaleLine {
  quantity: number;
  unitPrice: string;
}

export interface SaleAmountResult {
  lines: Array<SaleLine & { lineTotal: string }>;
  totalAmount: string;
  totalUnits: number;
}

export function calculateSaleAmount(lines: SaleLine[]): SaleAmountResult {
  let total = Money.zero();
  let totalUnits = 0;
  const outLines = lines.map((line) => {
    const lineTotal = Money.fromDecimal(line.unitPrice).multiplyByQuantity(line.quantity);
    total = total.add(lineTotal);
    totalUnits += line.quantity;
    return { ...line, lineTotal: lineTotal.toDecimalString() };
  });

  return {
    lines: outLines,
    totalAmount: total.toDecimalString(),
    totalUnits: Math.round(totalUnits * 1000) / 1000,
  };
}
