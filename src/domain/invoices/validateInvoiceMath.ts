import { Money } from '../../lib/money.ts';

/**
 * Validación matemática de una factura leída por IA (sección 3, PASO 3 del
 * prompt maestro: "quantity × unit_price debe coincidir con total"). Se usa
 * tanto para resaltar en la pantalla de revisión qué líneas no cuadran
 * (posible error de OCR/columna mal identificada, sección 36) como para
 * exigir confirmación explícita antes de guardar si algo no cuadra.
 *
 * Se permite una tolerancia de 1 centavo por línea para absorber redondeos
 * legítimos del documento original (ej. impuestos aplicados por línea que no
 * se están modelando aquí).
 */

const TOLERANCE_CENTS = 1;

export interface InvoiceItemMathInput {
  reference: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

export interface LineValidationResult {
  reference: string;
  expectedLineTotal: string;
  reportedLineTotal: string;
  differenceCents: number;
  valid: boolean;
}

export function validateInvoiceLine(item: InvoiceItemMathInput): LineValidationResult {
  const expected = Money.fromDecimal(item.unitPrice).multiplyByQuantity(item.quantity);
  const reported = Money.fromDecimal(item.lineTotal);
  const differenceCents = Math.abs(expected.toCents() - reported.toCents());
  return {
    reference: item.reference,
    expectedLineTotal: expected.toDecimalString(),
    reportedLineTotal: reported.toDecimalString(),
    differenceCents,
    valid: differenceCents <= TOLERANCE_CENTS,
  };
}

export interface InvoiceTotalValidationResult {
  expectedTotal: string;
  reportedTotal: string;
  differenceCents: number;
  valid: boolean;
}

export function validateInvoiceTotal(
  items: InvoiceItemMathInput[],
  reportedInvoiceTotal: string
): InvoiceTotalValidationResult {
  const expected = Money.sum(
    items.map((i) => Money.fromDecimal(i.unitPrice).multiplyByQuantity(i.quantity))
  );
  const reported = Money.fromDecimal(reportedInvoiceTotal);
  const differenceCents = Math.abs(expected.toCents() - reported.toCents());
  return {
    expectedTotal: expected.toDecimalString(),
    reportedTotal: reported.toDecimalString(),
    differenceCents,
    valid: differenceCents <= TOLERANCE_CENTS,
  };
}

/** Valida todas las líneas + el total de una factura de una sola vez. */
export function validateInvoice(items: InvoiceItemMathInput[], invoiceTotal: string) {
  const lineResults = items.map(validateInvoiceLine);
  const totalResult = validateInvoiceTotal(items, invoiceTotal);
  return {
    lines: lineResults,
    total: totalResult,
    allValid: lineResults.every((l) => l.valid) && totalResult.valid,
  };
}
