import { prisma } from '@/lib/prisma';
import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Servicio de auditoría (sección 21 del prompt maestro). Todo servicio que
 * modifica precios, inventario, ajustes, pagos, o hace correcciones DEBE
 * llamar a `recordAudit` dentro de la MISMA transacción de Prisma que
 * realiza el cambio (por eso acepta un `tx` opcional: un PrismaClient o un
 * cliente transaccional `Prisma.TransactionClient`), para que sea imposible
 * que el cambio se guarde sin su registro de auditoría correspondiente.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export interface RecordAuditParams {
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  previousValue?: unknown;
  newValue?: unknown;
  ipAddress?: string | null;
}

export async function recordAudit(params: RecordAuditParams, db: Db = prisma) {
  await db.auditLog.create({
    data: {
      userId: params.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      previousValue: params.previousValue === undefined ? undefined : (params.previousValue as Prisma.InputJsonValue),
      newValue: params.newValue === undefined ? undefined : (params.newValue as Prisma.InputJsonValue),
      ipAddress: params.ipAddress ?? null,
    },
  });
}

export interface ListAuditParams {
  entityType?: string;
  entityId?: string;
  userId?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}

/** Alimenta la pantalla "Registro de actividad" (sección 21). */
export async function listAuditLogs(params: ListAuditParams = {}) {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 50;

  const where: Prisma.AuditLogWhereInput = {
    entityType: params.entityType,
    entityId: params.entityId,
    userId: params.userId,
    createdAt:
      params.from || params.to
        ? { gte: params.from, lte: params.to }
        : undefined,
  };

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { name: true, email: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { items, total, page, pageSize };
}
