import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import type { CustomerInput } from '@/lib/validators/schemas';
import type { Role } from '@/auth/permissions';
import { isScopedToOwnCustomers } from '@/auth/permissions';
import { recordAudit } from './auditService';
import { calculateBalance } from '@/domain/accounts/calculateBalance';
import { calculateConsolidatedInventory } from '@/domain/inventory/currentInventory';
import { Money } from '@/lib/money';

/** Genera el próximo código interno legible (CLI-0001, CLI-0002, ...). */
async function generateCustomerCode(tx: Prisma.TransactionClient): Promise<string> {
  const count = await tx.customer.count();
  return `CLI-${String(count + 1).padStart(4, '0')}`;
}

export interface ListCustomersParams {
  actingUserId: string;
  actingUserRole: Role;
  search?: string;
  status?: 'ACTIVO' | 'INACTIVO';
  page?: number;
  pageSize?: number;
}

export async function listCustomers(params: ListCustomersParams) {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 25;

  const where: Prisma.CustomerWhereInput = {
    status: params.status,
    // VENDEDOR solo ve sus clientes asignados (sección 20)
    vendorId: isScopedToOwnCustomers(params.actingUserRole) ? params.actingUserId : undefined,
    OR: params.search
      ? [
          { tradeName: { contains: params.search, mode: 'insensitive' } },
          { legalName: { contains: params.search, mode: 'insensitive' } },
          { code: { contains: params.search, mode: 'insensitive' } },
          { ruc: { contains: params.search, mode: 'insensitive' } },
        ]
      : undefined,
  };

  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: { vendor: { select: { id: true, name: true } } },
      orderBy: { tradeName: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.customer.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export async function getCustomerById(id: string) {
  return prisma.customer.findUnique({
    where: { id },
    include: { vendor: { select: { id: true, name: true } } },
  });
}

export async function createCustomer(input: CustomerInput, actingUserId: string) {
  const customer = await prisma.$transaction(async (tx) => {
    const code = await generateCustomerCode(tx);
    const created = await tx.customer.create({
      data: {
        code,
        tradeName: input.tradeName,
        legalName: input.legalName,
        ruc: input.ruc || null,
        dv: input.dv || null,
        address: input.address || null,
        phone: input.phone || null,
        email: input.email || null,
        contactPerson: input.contactPerson || null,
        vendorId: input.vendorId || null,
        startDate: input.startDate ?? new Date(),
        status: input.status,
        notes: input.notes || null,
        createdBy: actingUserId,
      },
    });

    await recordAudit(
      {
        userId: actingUserId,
        action: 'CUSTOMER_CREATE',
        entityType: 'Customer',
        entityId: created.id,
        newValue: created,
      },
      tx
    );

    return created;
  });

  return customer;
}

export async function updateCustomer(id: string, input: Partial<CustomerInput>, actingUserId: string) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.customer.findUniqueOrThrow({ where: { id } });

    const updated = await tx.customer.update({
      where: { id },
      data: {
        tradeName: input.tradeName,
        legalName: input.legalName,
        ruc: input.ruc,
        dv: input.dv,
        address: input.address,
        phone: input.phone,
        email: input.email,
        contactPerson: input.contactPerson,
        vendorId: input.vendorId,
        status: input.status,
        notes: input.notes,
      },
    });

    await recordAudit(
      {
        userId: actingUserId,
        action: 'CUSTOMER_UPDATE',
        entityType: 'Customer',
        entityId: id,
        previousValue: before,
        newValue: updated,
      },
      tx
    );

    return updated;
  });
}

/**
 * Resumen para el header del dashboard por cliente (sección 17):
 * inventario actual (valorizado), saldo pendiente, último inventario, último pago.
 */
export async function getCustomerDashboardSummary(customerId: string) {
  const [batches, movements, lastCount, lastPayment] = await Promise.all([
    prisma.consignmentBatch.findMany({ where: { customerId } }),
    prisma.accountMovement.findMany({ where: { customerId } }),
    prisma.inventoryCount.findFirst({
      where: { customerId, status: 'CONFIRMADO' },
      orderBy: { confirmedAt: 'desc' },
    }),
    prisma.payment.findFirst({ where: { customerId }, orderBy: { paymentDate: 'desc' } }),
  ]);

  const inventoryValue = Money.sum(
    batches.map((b) => {
      const qty = calculateConsolidatedInventory([
        {
          deliveredQty: Number(b.deliveredQty),
          soldQty: Number(b.soldQty),
          returnedQty: Number(b.returnedQty),
          adjustedQty: Number(b.adjustedQty),
        },
      ]);
      return Money.fromDecimal(b.unitPrice.toString()).multiplyByQuantity(qty);
    })
  );

  const balance = calculateBalance(
    movements.map((m) => ({ type: m.type, debit: m.debit.toString(), credit: m.credit.toString() }))
  );

  return {
    inventoryValue: inventoryValue.toDecimalString(),
    balance,
    lastCountDate: lastCount?.confirmedAt ?? null,
    lastPaymentAmount: lastPayment?.amount.toString() ?? null,
    lastPaymentDate: lastPayment?.paymentDate ?? null,
  };
}
