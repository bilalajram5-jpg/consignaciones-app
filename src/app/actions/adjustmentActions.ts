'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/auth/session';
import { adjustmentSchema, type AdjustmentInput } from '@/lib/validators/schemas';
import * as adjustmentService from '@/services/adjustmentService';
import { type ActionResult, toErrorMessage } from './shared';

/**
 * Ajuste de inventario (sección 6/34): motivo obligatorio, siempre auditado.
 * Es el flujo que se usa para resolver una discrepancia detectada durante
 * "Realizar inventario" antes de poder confirmar el corte.
 */
export async function createAdjustmentAction(input: AdjustmentInput): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser('inventory.adjust');
    const parsed = adjustmentSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    }
    const adjustment = await adjustmentService.createAdjustment(parsed.data, user.id);
    revalidatePath(`/clientes/${parsed.data.customerId}`);
    return { success: true, data: { id: adjustment.id } };
  } catch (err) {
    return { success: false, error: toErrorMessage(err) };
  }
}
