/**
 * Errores de dominio. Se lanzan desde `src/domain/**` (lógica pura) y deben
 * ser capturados por la capa de servicios (`src/services/**`) para
 * traducirlos a respuestas HTTP/UI apropiadas. Los mensajes de
 * `InsufficientInventoryError` y `InventoryDiscrepancyError` citan
 * textualmente la redacción exigida en el prompt maestro (sección 6), para
 * que la UI pueda mostrarlos tal cual sin tener que re-redactarlos.
 */

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InsufficientInventoryError extends DomainError {
  readonly requestedQty: number;
  readonly availableQty: number;

  constructor(requestedQty: number, availableQty: number) {
    super(
      `No puedes registrar ${formatQty(requestedQty)} unidades vendidas porque solamente existen ${formatQty(
        availableQty
      )} unidades disponibles.`
    );
    this.requestedQty = requestedQty;
    this.availableQty = availableQty;
  }
}

export class InventoryDiscrepancyError extends DomainError {
  readonly systemQty: number;
  readonly countedQty: number;

  constructor(systemQty: number, countedQty: number) {
    super('El conteo físico es mayor que el inventario registrado.');
    this.systemQty = systemQty;
    this.countedQty = countedQty;
  }
}

export class InvalidQuantityError extends DomainError {}

export class InvoiceMathMismatchError extends DomainError {}

function formatQty(qty: number): string {
  return Number.isInteger(qty) ? String(qty) : qty.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}
