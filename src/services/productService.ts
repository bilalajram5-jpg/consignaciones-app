import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import type { ProductInput } from '@/lib/validators/schemas';
import { recordAudit } from './auditService';
import { calculateCurrentInventory } from '@/domain/inventory/currentInventory';

export interface ListProductsParams {
  search?: string;
  status?: 'ACTIVO' | 'INACTIVO';
  page?: number;
  pageSize?: number;
}

export async function listProducts(params: ListProductsParams = {}) {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 25;

  const where: Prisma.ProductWhereInput = {
    status: params.status,
    OR: params.search
      ? [
          { sku: { contains: params.search, mode: 'insensitive' } },
          { name: { contains: params.search, mode: 'insensitive' } },
          { barcode: { contains: params.search, mode: 'insensitive' } },
        ]
      : undefined,
  };

  const [items, total] = await Promise.all([
    prisma.product.findMany({ where, orderBy: { sku: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.product.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export async function getProductBySku(sku: string) {
  return prisma.product.findUnique({ where: { sku } });
}

export async function getProductByBarcode(barcode: string) {
  return prisma.product.findUnique({ where: { barcode } });
}

export async function createProduct(input: ProductInput, actingUserId: string) {
  return prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        sku: input.sku,
        barcode: input.barcode || null,
        name: input.name,
        description: input.description || null,
        category: input.category || null,
        imageUrl: input.imageUrl || null,
        standardPrice: input.standardPrice,
        status: input.status,
        createdBy: actingUserId,
      },
    });
    await recordAudit(
      { userId: actingUserId, action: 'PRODUCT_CREATE', entityType: 'Product', entityId: created.id, newValue: created },
      tx
    );
    return created;
  });
}

/**
 * Editar el precio estándar de un producto es una acción financiera
 * sensible (sección 21: "Registrar: Edición de precios"). Nunca afecta
 * retroactivamente lotes/ventas ya creados (esos conservan su propio
 * `unitPrice` histórico en ConsignmentBatch/SaleItem) — solo cambia el
 * precio sugerido para NUEVAS facturas.
 */
export async function updateProduct(id: string, input: Partial<ProductInput>, actingUserId: string) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.product.findUniqueOrThrow({ where: { id } });

    const updated = await tx.product.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        category: input.category,
        imageUrl: input.imageUrl,
        barcode: input.barcode,
        standardPrice: input.standardPrice,
        status: input.status,
      },
    });

    const priceChanged = input.standardPrice !== undefined && input.standardPrice !== before.standardPrice.toString();

    await recordAudit(
      {
        userId: actingUserId,
        action: priceChanged ? 'PRODUCT_PRICE_EDIT' : 'PRODUCT_UPDATE',
        entityType: 'Product',
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
 * Historial de trazabilidad de un producto (sección 12): entregado, vendido,
 * devuelto, disponible, y EXACTAMENTE dónde están las unidades disponibles
 * (cliente por cliente).
 */
export async function getProductTraceability(productId: string) {
  const batches = await prisma.consignmentBatch.findMany({
    where: { productId },
    include: { customer: { select: { id: true, tradeName: true, code: true } } },
  });

  let delivered = 0;
  let sold = 0;
  let returned = 0;
  let adjusted = 0;
  const byCustomer = new Map<string, { customerId: string; customerName: string; available: number }>();

  for (const b of batches) {
    const components = {
      deliveredQty: Number(b.deliveredQty),
      soldQty: Number(b.soldQty),
      returnedQty: Number(b.returnedQty),
      adjustedQty: Number(b.adjustedQty),
    };
    delivered += components.deliveredQty;
    sold += components.soldQty;
    returned += components.returnedQty;
    adjusted += components.adjustedQty;

    const available = calculateCurrentInventory(components);
    if (available > 0) {
      const key = b.customerId;
      const existing = byCustomer.get(key);
      byCustomer.set(key, {
        customerId: b.customerId,
        customerName: b.customer.tradeName,
        available: (existing?.available ?? 0) + available,
      });
    }
  }

  return {
    delivered,
    sold,
    returned,
    availableTotal: delivered - sold - returned + adjusted,
    byCustomer: Array.from(byCustomer.values()),
  };
}
