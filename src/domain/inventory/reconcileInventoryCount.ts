import { InsufficientInventoryError, InvalidQuantityError } from '../errors.ts';

/**
 * Núcleo del módulo "Realizar inventario" (sección 5 y 6 del prompt maestro).
 *
 * Implementa AMBOS modos de captura sobre la MISMA función, precisamente
 * para garantizar el requisito explícito: "Ambos métodos deben producir
 * exactamente el mismo resultado."
 *
 *  - MODO A (CONTEO_FISICO): el usuario cuenta físicamente cuánto queda.
 *  - MODO B (CANTIDAD_VENDIDA): el usuario introduce directamente cuánto se vendió.
 *
 * Reglas de error (sección 6, redacción EXACTA exigida por el prompt maestro):
 *  - Modo B no puede vender más de lo disponible -> InsufficientInventoryError.
 *  - Modo A: si el conteo físico es MAYOR que el inventario del sistema, no es
 *    una "venta negativa": es una discrepancia que debe resolverse con un
 *    ajuste explícito (motivo + usuario + fecha), nunca modificando el
 *    inventario en silencio. Por eso esta función NO lanza una excepción en
 *    ese caso: devuelve `hasDiscrepancy: true` y dependingQty en 0, dejando
 *    que la capa de servicio/API decida el flujo (bloquear confirmación del
 *    corte hasta que exista un InventoryAdjustment).
 */

export type CountEntryMode = 'CONTEO_FISICO' | 'CANTIDAD_VENDIDA';

export interface ReconcileInventoryCountInput {
  previousQty: number;
  mode: CountEntryMode;
  /** Requerido si mode === 'CONTEO_FISICO' */
  countedQty?: number;
  /** Requerido si mode === 'CANTIDAD_VENDIDA' */
  soldQty?: number;
}

export interface ReconcileInventoryCountResult {
  mode: CountEntryMode;
  previousQty: number;
  /** Cantidad física resultante (igual en ambos modos para el mismo escenario real) */
  countedQty: number;
  soldQty: number;
  newQty: number;
  hasDiscrepancy: boolean;
}

export function reconcileInventoryCount(
  input: ReconcileInventoryCountInput
): ReconcileInventoryCountResult {
  const { previousQty, mode } = input;

  if (!Number.isFinite(previousQty) || previousQty < 0) {
    throw new InvalidQuantityError(`previousQty inválido: ${previousQty}`);
  }

  if (mode === 'CANTIDAD_VENDIDA') {
    const soldQty = input.soldQty;
    if (soldQty === undefined || !Number.isFinite(soldQty) || soldQty < 0) {
      throw new InvalidQuantityError(`soldQty inválido: ${soldQty}`);
    }
    if (soldQty > previousQty) {
      throw new InsufficientInventoryError(soldQty, previousQty);
    }
    const newQty = round3(previousQty - soldQty);
    return {
      mode,
      previousQty,
      countedQty: newQty,
      soldQty: round3(soldQty),
      newQty,
      hasDiscrepancy: false,
    };
  }

  // mode === 'CONTEO_FISICO'
  const countedQty = input.countedQty;
  if (countedQty === undefined || !Number.isFinite(countedQty) || countedQty < 0) {
    throw new InvalidQuantityError(`countedQty inválido: ${countedQty}`);
  }

  if (countedQty > previousQty) {
    // Discrepancia: el conteo físico es MAYOR que el sistema. No se asume
    // una venta negativa ni se ajusta el inventario silenciosamente.
    return {
      mode,
      previousQty,
      countedQty: round3(countedQty),
      soldQty: 0,
      newQty: previousQty,
      hasDiscrepancy: true,
    };
  }

  const soldQty = round3(previousQty - countedQty);
  return {
    mode,
    previousQty,
    countedQty: round3(countedQty),
    soldQty,
    newQty: round3(countedQty),
    hasDiscrepancy: false,
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
