import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { getStorageProvider } from '@/lib/storage';
import { extractInvoiceData } from '@/ai/invoiceExtraction';
import { validateInvoice } from '@/domain/invoices/validateInvoiceMath';
import type { InvoiceConfirmInput } from '@/lib/validators/schemas';
import { recordAudit } from './auditService';
import { withSerializableTransaction } from '@/lib/db/transaction';

/**
 * PASO 1-2 del flujo de carga de facturas (sección 3): sube el archivo,
 * lo envía a la IA, valida matemáticamente los datos, detecta posibles
 * duplicados, y crea la factura en estado PENDIENTE_REVISION —
 * NUNCA CONFIRMADA automáticamente (sección 3: "Nunca guardar
 * automáticamente información detectada por IA sin permitir revisión
 * humana").
 */
export async function uploadAndExtractInvoice(params: {
  customerId: string;
  file: Buffer;
  filename: string;
  contentType: string;
  sourceType: 'PDF' | 'IMAGE';
  uploadedById: string;
}) {
  const storage = getStorageProvider();
  const stored = await storage.save({
    folder: 'invoices',
    filename: params.filename,
    data: params.file,
    contentType: params.contentType,
  });

  const extraction = await extractInvoiceData({
    fileBuffer: params.file,
    contentType: params.contentType,
    sourceType: params.sourceType,
  });

  const mathValidation = validateInvoice(
    extraction.items.map((i) => ({
      reference: i.reference,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      lineTotal: i.total,
    })),
    extraction.invoiceTotal
  );

  const duplicate = await findPossibleDuplicateInvoice({
    customerId: params.customerId,
    invoiceNumber: extraction.invoiceNumber,
    invoiceDate: new Date(extraction.invoiceDate),
    invoiceTotal: extraction.invoiceTotal,
  });

  const invoice = await prisma.invoice.create({
    data: {
      customerId: params.customerId,
      invoiceNumber: extraction.invoiceNumber || `SIN-NUMERO-${Date.now()}`,
      invoiceDate: new Date(extraction.invoiceDate || Date.now()),
      sourceType: params.sourceType,
      sourceFileUrl: stored.key,
      status: 'PENDIENTE_REVISION',
      invoiceTotal: extraction.invoiceTotal,
      aiRawResponse: extraction.raw as Prisma.InputJsonValue,
      aiModel: extraction.model,
      aiOverallConfidence: extraction.overallConfidence,
      possibleDuplicateOfId: duplicate?.id,
      uploadedById: params.uploadedById,
      items: {
        create: extraction.items.map((item) => ({
          reference: item.reference,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.total,
          referenceConfidence: item.confidence?.reference,
          descriptionConfidence: item.confidence?.description,
          quantityConfidence: item.confidence?.quantity,
          priceConfidence: item.confidence?.unitPrice,
        })),
      },
    },
    include: { items: true },
  });

  await recordAudit({
    userId: params.uploadedById,
    action: 'INVOICE_UPLOAD',
    entityType: 'Invoice',
    entityId: invoice.id,
    newValue: { invoiceNumber: invoice.invoiceNumber, invoiceTotal: invoice.invoiceTotal.toString() },
  });

  return { invoice, mathValidation, possibleDuplicate: duplicate };
}

/**
 * Detección de facturas duplicadas (sección 29). Coincidencia por
 * cliente + número de factura (coincidencia fuerte) o cliente + total +
 * fecha cercana (coincidencia posible, ej. la IA leyó mal el número).
 * NUNCA bloquea automáticamente: solo se usa para mostrar la advertencia
 * "Esta factura posiblemente ya fue registrada." en la pantalla de revisión.
 */
async function findPossibleDuplicateInvoice(params: {
  customerId: string;
  invoiceNumber: string;
  invoiceDate: Date;
  invoiceTotal: string;
}) {
  const windowStart = new Date(params.invoiceDate);
  windowStart.setDate(windowStart.getDate() - 3);
  const windowEnd = new Date(params.invoiceDate);
  windowEnd.setDate(windowEnd.getDate() + 3);

  return prisma.invoice.findFirst({
    where: {
      customerId: params.customerId,
      status: { not: 'RECHAZADA' },
      OR: [
        { invoiceNumber: params.invoiceNumber },
        {
          invoiceTotal: params.invoiceTotal,
          invoiceDate: { gte: windowStart, lte: windowEnd },
        },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * PASO 4 (sección 3): confirma la factura DESPUÉS de la revisión humana.
 * Revalida matemáticamente en el servidor (nunca confía en los totales que
 * mande el cliente), crea/enlaza productos nuevos detectados (sección 36),
 * y crea un ConsignmentBatch por cada línea — el paso que efectivamente
 * "convierte" la factura en inventario en consignación (sección 4).
 */
export async function confirmInvoice(input: InvoiceConfirmInput, actingUserId: string) {
  // Revalidación server-side de la matemática, usando los valores YA
  // corregidos por el usuario en la pantalla de revisión.
  const mathCheck = validateInvoice(
    input.items.map((i) => ({ reference: i.reference, quantity: i.quantity, unitPrice: i.unitPrice, lineTotal: i.lineTotal })),
    input.invoiceTotal
  );
  if (!mathCheck.allValid) {
    throw new Error(
      'La factura no cuadra matemáticamente (cantidad × precio ≠ total en al menos una línea). Corrige los valores antes de confirmar.'
    );
  }

  return withSerializableTransaction(async (tx) => {
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: input.invoiceId }, include: { items: true } });

    if (invoice.status === 'CONFIRMADA') {
      throw new Error('Esta factura ya fue confirmada anteriormente. No se puede confirmar dos veces.');
    }
    if (invoice.status === 'RECHAZADA') {
      throw new Error('Esta factura fue rechazada y no se puede confirmar. Sube una nueva factura si corresponde.');
    }

    const duplicate = invoice.possibleDuplicateOfId
      ? await tx.invoice.findUnique({ where: { id: invoice.possibleDuplicateOfId } })
      : null;
    if (duplicate && !input.confirmDespiteDuplicateWarning) {
      throw new Error(
        'Esta factura posiblemente ya fue registrada. Confirma explícitamente si deseas continuar de todas formas.'
      );
    }

    const batchDate = input.invoiceDate;
    const createdBatchIds: string[] = [];

    for (const itemInput of input.items) {
      // Producto nuevo detectado en factura (sección 36): se crea en el
      // catálogo si no existe, usando la referencia como SKU.
      let productId = itemInput.productId ?? null;
      if (!productId) {
        const existing = await tx.product.findUnique({ where: { sku: itemInput.reference } });
        if (existing) {
          productId = existing.id;
        } else {
          const created = await tx.product.create({
            data: {
              sku: itemInput.reference,
              name: itemInput.description,
              standardPrice: itemInput.unitPrice,
              status: 'ACTIVO',
              createdBy: actingUserId,
            },
          });
          productId = created.id;
        }
      }

      // Encuentra la línea original (si ya existía) o crea una nueva línea
      // manual agregada en la revisión ("Agregar producto", sección 3).
      const existingItem = invoice.items.find(
        (i) => i.reference === itemInput.reference && i.description === itemInput.description
      );

      const wasEdited =
        !existingItem ||
        existingItem.quantity.toString() !== String(itemInput.quantity) ||
        existingItem.unitPrice.toString() !== itemInput.unitPrice ||
        existingItem.description !== itemInput.description;

      const invoiceItem = existingItem
        ? await tx.invoiceItem.update({
            where: { id: existingItem.id },
            data: {
              productId,
              reference: itemInput.reference,
              description: itemInput.description,
              quantity: String(itemInput.quantity),
              unitPrice: itemInput.unitPrice,
              lineTotal: itemInput.lineTotal,
              wasEditedManually: wasEdited,
            },
          })
        : await tx.invoiceItem.create({
            data: {
              invoiceId: invoice.id,
              productId,
              reference: itemInput.reference,
              description: itemInput.description,
              quantity: String(itemInput.quantity),
              unitPrice: itemInput.unitPrice,
              lineTotal: itemInput.lineTotal,
              wasEditedManually: true,
            },
          });

      const batch = await tx.consignmentBatch.create({
        data: {
          customerId: input.customerId,
          productId,
          invoiceId: invoiceItem.id,
          deliveredQty: String(itemInput.quantity),
          unitPrice: itemInput.unitPrice,
          batchDate,
        },
      });
      createdBatchIds.push(batch.id);
    }

    const updatedInvoice = await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        customerId: input.customerId,
        invoiceNumber: input.invoiceNumber,
        invoiceDate: input.invoiceDate,
        invoiceTotal: input.invoiceTotal,
        status: 'CONFIRMADA',
        confirmedById: actingUserId,
        confirmedAt: new Date(),
      },
    });

    await recordAudit(
      {
        userId: actingUserId,
        action: 'INVOICE_CONFIRM',
        entityType: 'Invoice',
        entityId: invoice.id,
        previousValue: { status: invoice.status },
        newValue: { status: 'CONFIRMADA', batchesCreated: createdBatchIds },
      },
      tx
    );

    return updatedInvoice;
  });
}

/**
 * Rechaza una factura que está en revisión (sección 3: la revisión humana
 * también puede concluir en "esto no es válido", ej. un duplicado real, un
 * documento ilegible, o una factura que no corresponde a este cliente).
 * NUNCA crea inventario ni movimientos — es la contraparte de
 * `confirmInvoice`, y al igual que ese, requiere un motivo explícito para
 * quedar en la auditoría (mismo principio que los ajustes de inventario,
 * sección 34 regla #5).
 */
export async function rejectInvoice(invoiceId: string, reason: string, actingUserId: string) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });

    if (invoice.status === 'CONFIRMADA') {
      throw new Error('Esta factura ya fue confirmada y generó inventario. No se puede rechazar una factura confirmada.');
    }
    if (invoice.status === 'RECHAZADA') {
      throw new Error('Esta factura ya había sido rechazada anteriormente.');
    }

    const updated = await tx.invoice.update({
      where: { id: invoiceId },
      data: { status: 'RECHAZADA', confirmedById: actingUserId, confirmedAt: new Date() },
    });

    await recordAudit(
      {
        userId: actingUserId,
        action: 'INVOICE_REJECT',
        entityType: 'Invoice',
        entityId: invoiceId,
        previousValue: { status: invoice.status },
        newValue: { status: 'RECHAZADA', reason },
      },
      tx
    );

    return updated;
  });
}

export async function getInvoiceById(id: string) {
  return prisma.invoice.findUnique({
    where: { id },
    include: { items: { include: { product: true } }, customer: true, possibleDuplicateOf: true },
  });
}

export async function listInvoicesByCustomer(customerId: string) {
  return prisma.invoice.findMany({
    where: { customerId },
    include: { items: true },
    orderBy: { invoiceDate: 'desc' },
  });
}
