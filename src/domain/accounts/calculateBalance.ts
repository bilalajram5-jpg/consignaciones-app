import { Money } from '../../lib/money.ts';

/**
 * Saldo pendiente de un cliente (sección 9 del prompt maestro):
 *
 *   Saldo pendiente = Cargos por ventas - Pagos - Notas de crédito + otros cargos
 *
 * DECISIÓN DE DISEÑO IMPORTANTE (ver DECISIONS.md): el saldo NUNCA se
 * guarda como un campo mutable en la tabla `customers`. Se calcula SIEMPRE
 * sumando la tabla `account_movements` (debit - credit), que es un libro de
 * movimientos append-only. Esto hace imposible que un pago "se pierda" o que
 * el saldo se desincronice de la suma real de cargos y pagos, y es
 * exactamente la misma tabla que alimenta el "Estado de cuenta" (sección 11)
 * — ambas pantallas leen la misma fuente de verdad.
 *
 * Esta función es la usada tanto por el módulo de Cuentas por Cobrar como
 * por el Estado de Cuenta, para que nunca puedan mostrar cifras distintas.
 */

export type AccountMovementType = 'CARGO_VENTA' | 'PAGO' | 'NOTA_CREDITO' | 'OTRO_CARGO';

export interface AccountMovementInput {
  type: AccountMovementType;
  debit: string; // "0.00" si es un movimiento de crédito
  credit: string; // "0.00" si es un movimiento de débito
  date?: string | Date;
}

export interface RunningBalanceLine extends AccountMovementInput {
  balance: string;
}

/** Saldo final (para tarjetas de resumen, ej. dashboard, cuentas por cobrar). */
export function calculateBalance(movements: AccountMovementInput[]): string {
  const totalDebit = Money.sum(movements.map((m) => Money.fromDecimal(m.debit)));
  const totalCredit = Money.sum(movements.map((m) => Money.fromDecimal(m.credit)));
  return totalDebit.subtract(totalCredit).toDecimalString();
}

/**
 * Saldo corrido (running balance) para el Estado de Cuenta estilo bancario
 * (sección 11): cada fila muestra el saldo acumulado hasta esa fecha.
 * Requiere que `movements` venga ordenado cronológicamente ascendente.
 */
export function calculateRunningBalance(movements: AccountMovementInput[]): RunningBalanceLine[] {
  let running = Money.zero();
  return movements.map((m) => {
    running = running.add(Money.fromDecimal(m.debit)).subtract(Money.fromDecimal(m.credit));
    return { ...m, balance: running.toDecimalString() };
  });
}

/**
 * Resumen de un corte de consignación (sección 7):
 *   Total adeudado = Saldo anterior + Nuevo cargo
 */
export function calculateNewTotalOwed(previousBalance: string, newCharge: string): string {
  return Money.fromDecimal(previousBalance).add(Money.fromDecimal(newCharge)).toDecimalString();
}
