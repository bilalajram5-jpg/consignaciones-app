import { prisma } from '@/lib/prisma';
import type { PaymentInput } from '@/lib/validators/schemas';
import { getStorageProvider } from '@/lib/storage';
import { recordAudit } from './auditService';
import { calculateBalance, calculateRunningBalance } from '@/domain/accounts/calculateBalance';

/**
 * Registro de pagos (sección 10). Regla dura (sección 34, #7 y #8): un pago
 * SOLO crea un AccountMovement de crédito nuevo — nunca modifica ni elimina
 * cortes anteriores, y el saldo se recalcula automáticamente porque siempre
 * se deriva de la suma de account_movements (ver domain/accounts/calculateBalance.ts).
 */
export async function createPayment(
  input: PaymentInput,
  actingUserId: string,
  receipt?: { buffer: Buffer; filename: string; contentType: string }
) {
  let receiptFileUrl: string | null = null;
  if (receipt) {
    const storage = getStorageProvider();
    const stored = await storage.save({
      folder: 'payments',
      filename: receipt.filename,
      data: receipt.buffer,
      contentType: receipt.contentType,
    });
    receiptFileUrl = stored.key;
  }

  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        customerId: input.customerId,
        paymentDate: input.paymentDate,
        amount: input.amount,
        method: input.method,
        referenceNumber: input.referenceNumber || null,
        bank: input.bank || null,
        notes: input.notes || null,
        receiptFileUrl,
        registeredById: actingUserId,
      },
    });

    const movement = await tx.accountMovement.create({
      data: {
        customerId: input.customerId,
        type: 'PAGO',
        debit: '0.00',
        credit: input.amount,
        documentType: 'Pago',
        documentRef: input.referenceNumber || `PAGO-${payment.id.slice(-8).toUpperCase()}`,
        paymentId: payment.id,
        createdById: actingUserId,
      },
    });

    await recordAudit(
      {
        userId: actingUserId,
        action: 'PAYMENT_CREATE',
        entityType: 'Payment',
        entityId: payment.id,
        newValue: { customerId: input.customerId, amount: input.amount, method: input.method },
      },
      tx
    );

    return { payment, movement };
  });
}

/**
 * Un pago con todo lo necesario para imprimir el Recibo de Pago (sección
 * 10): cliente, quién lo registró, y el saldo pendiente inmediatamente
 * DESPUÉS de aplicar este pago — calculado con el mismo saldo corrido que
 * usa el Estado de Cuenta (`calculateRunningBalance`), nunca un campo
 * aparte que se pueda desincronizar.
 */
export async function getPaymentById(paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { customer: true, registeredBy: { select: { name: true } } },
  });
  if (!payment) return null;

  const allMovements = await prisma.accountMovement.findMany({
    where: { customerId: payment.customerId },
    orderBy: { date: 'asc' },
  });

  const withRunningBalance = calculateRunningBalance(
    allMovements.map((m) => ({ type: m.type, debit: m.debit.toString(), credit: m.credit.toString(), date: m.date }))
  );

  const movementIndex = allMovements.findIndex((m) => m.paymentId === payment.id);
  // Si por alguna razón no hay un AccountMovement ligado (no debería pasar:
  // createPayment siempre crea ambos en la misma transacción), se usa el
  // saldo total actual como respaldo en vez de fallar el PDF.
  const balanceAfter =
    movementIndex >= 0
      ? withRunningBalance[movementIndex]!.balance
      : calculateBalance(allMovements.map((m) => ({ type: m.type, debit: m.debit.toString(), credit: m.credit.toString() })));

  return { payment, balanceAfter };
}

export async function listPaymentsByCustomer(customerId: string) {
  return prisma.payment.findMany({ where: { customerId }, orderBy: { paymentDate: 'desc' } });
}

export async function listRecentPayments(limit = 10) {
  return prisma.payment.findMany({
    orderBy: { paymentDate: 'desc' },
    take: limit,
    include: { customer: { select: { tradeName: true } } },
  });
}
