import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { calculateBalance, calculateRunningBalance } from '@/domain/accounts/calculateBalance';

/**
 * Módulo de Cuentas por Cobrar y Estado de Cuenta (secciones 9 y 11). Ambas
 * pantallas leen exactamente la misma fuente de verdad (`account_movements`)
 * a través de las mismas funciones de dominio, por lo que NUNCA pueden
 * mostrar un saldo distinto entre sí.
 */

export interface StatementFilter {
  customerId: string;
  from?: Date;
  to?: Date;
  documentType?: string;
  movementType?: 'CARGO_VENTA' | 'PAGO' | 'NOTA_CREDITO' | 'OTRO_CARGO';
}

/** Estado de cuenta estilo bancario (sección 11), con saldo corrido. */
export async function getAccountStatement(filter: StatementFilter) {
  const where: Prisma.AccountMovementWhereInput = {
    customerId: filter.customerId,
    date: filter.from || filter.to ? { gte: filter.from, lte: filter.to } : undefined,
    documentType: filter.documentType,
    type: filter.movementType,
  };

  const movements = await prisma.accountMovement.findMany({ where, orderBy: { date: 'asc' } });

  const withRunningBalance = calculateRunningBalance(
    movements.map((m) => ({ type: m.type, debit: m.debit.toString(), credit: m.credit.toString(), date: m.date }))
  );

  return movements.map((m, idx) => ({
    id: m.id,
    date: m.date,
    type: m.type,
    documentType: m.documentType,
    documentRef: m.documentRef,
    debit: m.debit.toString(),
    credit: m.credit.toString(),
    balance: withRunningBalance[idx]!.balance,
    notes: m.notes,
  }));
}

export async function getCustomerBalance(customerId: string): Promise<string> {
  const movements = await prisma.accountMovement.findMany({ where: { customerId } });
  return calculateBalance(movements.map((m) => ({ type: m.type, debit: m.debit.toString(), credit: m.credit.toString() })));
}

/** Módulo "Cuentas por cobrar" (sección 9): un renglón por cliente con saldo > 0 (o todos, según filtro). */
export async function listReceivablesSummary(params: { onlyWithBalance?: boolean } = {}) {
  const customers = await prisma.customer.findMany({
    where: { status: 'ACTIVO' },
    include: {
      accountMovements: true,
      inventoryCounts: { where: { status: 'CONFIRMADO' }, orderBy: { confirmedAt: 'desc' }, take: 1 },
    },
  });

  const rows = customers.map((c) => {
    const balance = calculateBalance(
      c.accountMovements.map((m) => ({ type: m.type, debit: m.debit.toString(), credit: m.credit.toString() }))
    );
    const charges = c.accountMovements
      .filter((m) => m.type === 'CARGO_VENTA' || m.type === 'OTRO_CARGO')
      .reduce((sum, m) => sum + Number(m.debit), 0);
    const payments = c.accountMovements
      .filter((m) => m.type === 'PAGO' || m.type === 'NOTA_CREDITO')
      .reduce((sum, m) => sum + Number(m.credit), 0);

    return {
      customerId: c.id,
      customerCode: c.code,
      customerName: c.tradeName,
      totalCharges: charges.toFixed(2),
      totalPayments: payments.toFixed(2),
      balance,
      lastVisit: c.inventoryCounts[0]?.confirmedAt ?? null,
    };
  });

  return params.onlyWithBalance ? rows.filter((r) => Number(r.balance) !== 0) : rows;
}

/** Tarjeta "TOTAL POR COBRAR" del dashboard principal (sección 16). */
export async function getTotalReceivable(): Promise<string> {
  const movements = await prisma.accountMovement.findMany();
  return calculateBalance(movements.map((m) => ({ type: m.type, debit: m.debit.toString(), credit: m.credit.toString() })));
}

/** "Clientes con mayor saldo" (sección 16). */
export async function getTopCustomersByBalance(limit = 5) {
  const rows = await listReceivablesSummary();
  return rows
    .filter((r) => Number(r.balance) > 0)
    .sort((a, b) => Number(b.balance) - Number(a.balance))
    .slice(0, limit);
}
