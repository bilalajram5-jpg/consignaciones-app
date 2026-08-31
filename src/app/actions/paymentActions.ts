'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/auth/session';
import { paymentSchema } from '@/lib/validators/schemas';
import * as paymentService from '@/services/paymentService';
import { type ActionResult, toErrorMessage } from './shared';

export async function createPaymentAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser('payments.create');
    const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    }

    const receiptFile = formData.get('receipt') as File | null;
    const receipt =
      receiptFile && receiptFile.size > 0
        ? { buffer: Buffer.from(await receiptFile.arrayBuffer()), filename: receiptFile.name, contentType: receiptFile.type }
        : undefined;

    const { payment } = await paymentService.createPayment(parsed.data, user.id, receipt);
    revalidatePath(`/clientes/${parsed.data.customerId}`);
    revalidatePath('/cuentas-por-cobrar');
    revalidatePath('/pagos');
    return { success: true, data: { id: payment.id } };
  } catch (err) {
    return { success: false, error: toErrorMessage(err) };
  }
}
