'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/auth/session';
import { invoiceConfirmSchema, rejectInvoiceSchema, type InvoiceConfirmInput, type RejectInvoiceInput } from '@/lib/validators/schemas';
import * as invoiceService from '@/services/invoiceService';
import { type ActionResult, toErrorMessage } from './shared';

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']);

export interface UploadInvoiceResultData {
  invoiceId: string;
  extraction: {
    invoiceNumber: string;
    invoiceDate: string;
    invoiceTotal: string;
    customerName: string;
    items: Array<{
      productId: string | null;
      reference: string;
      description: string;
      quantity: number;
      unitPrice: string;
      lineTotal: string;
      confidence?: { reference?: number; description?: number; quantity?: number; unitPrice?: number };
    }>;
  };
  mathValid: boolean;
  possibleDuplicate: { id: string; invoiceNumber: string; invoiceDate: Date; invoiceTotal: unknown } | null;
}

/** Sección 3, PASO 1-2: sube el archivo y dispara la extracción por IA. */
export async function uploadInvoiceAction(formData: FormData): Promise<ActionResult<UploadInvoiceResultData>> {
  try {
    const user = await requireUser('invoices.upload');
    const customerId = String(formData.get('customerId') || '');
    const file = formData.get('file') as File | null;

    if (!customerId) return { success: false, error: 'Selecciona un cliente.' };
    if (!file || file.size === 0) return { success: false, error: 'Selecciona un archivo (PDF, JPG o PNG).' };
    if (file.size > MAX_FILE_SIZE_BYTES) return { success: false, error: 'El archivo supera el límite de 15 MB.' };
    if (!ALLOWED_TYPES.has(file.type)) {
      return { success: false, error: 'Formato no soportado. Sube un PDF, JPG o PNG.' };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const sourceType = file.type === 'application/pdf' ? 'PDF' : 'IMAGE';

    const { invoice, mathValidation, possibleDuplicate } = await invoiceService.uploadAndExtractInvoice({
      customerId,
      file: buffer,
      filename: file.name,
      contentType: file.type,
      sourceType,
      uploadedById: user.id,
    });

    return {
      success: true,
      data: {
        invoiceId: invoice.id,
        extraction: {
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate: invoice.invoiceDate.toISOString().slice(0, 10),
          invoiceTotal: invoice.invoiceTotal.toString(),
          customerName: '',
          items: invoice.items.map((i) => ({
            productId: i.productId,
            reference: i.reference,
            description: i.description,
            quantity: Number(i.quantity),
            unitPrice: i.unitPrice.toString(),
            lineTotal: i.lineTotal.toString(),
            confidence: {
              reference: i.referenceConfidence ? Number(i.referenceConfidence) : undefined,
              description: i.descriptionConfidence ? Number(i.descriptionConfidence) : undefined,
              quantity: i.quantityConfidence ? Number(i.quantityConfidence) : undefined,
              unitPrice: i.priceConfidence ? Number(i.priceConfidence) : undefined,
            },
          })),
        },
        mathValid: mathValidation.allValid,
        possibleDuplicate: possibleDuplicate
          ? {
              id: possibleDuplicate.id,
              invoiceNumber: possibleDuplicate.invoiceNumber,
              invoiceDate: possibleDuplicate.invoiceDate,
              invoiceTotal: possibleDuplicate.invoiceTotal,
            }
          : null,
      },
    };
  } catch (err) {
    return { success: false, error: toErrorMessage(err) };
  }
}

/** Sección 3, PASO 4: confirma la factura después de la revisión humana. */
export async function confirmInvoiceAction(input: InvoiceConfirmInput): Promise<ActionResult<{ invoiceId: string }>> {
  try {
    const user = await requireUser('invoices.confirm');
    const parsed = invoiceConfirmSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    }
    const invoice = await invoiceService.confirmInvoice(parsed.data, user.id);
    revalidatePath(`/clientes/${parsed.data.customerId}`);
    return { success: true, data: { invoiceId: invoice.id } };
  } catch (err) {
    return { success: false, error: toErrorMessage(err) };
  }
}

/**
 * Sección 3: la revisión humana también puede terminar en un rechazo (ej.
 * documento ilegible, duplicado real, factura de otro cliente). Requiere
 * el mismo permiso que confirmar — es la otra salida de la misma pantalla
 * de revisión — y un motivo explícito, igual que los ajustes de inventario.
 */
export async function rejectInvoiceAction(
  input: RejectInvoiceInput & { customerId: string }
): Promise<ActionResult<{ invoiceId: string }>> {
  try {
    const user = await requireUser('invoices.confirm');
    const parsed = rejectInvoiceSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    }
    const invoice = await invoiceService.rejectInvoice(parsed.data.invoiceId, parsed.data.reason, user.id);
    revalidatePath(`/clientes/${input.customerId}`);
    return { success: true, data: { invoiceId: invoice.id } };
  } catch (err) {
    return { success: false, error: toErrorMessage(err) };
  }
}
