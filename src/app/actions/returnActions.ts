'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/auth/session';
import { returnSchema, type ReturnInput } from '@/lib/validators/schemas';
import * as returnService from '@/services/returnService';
import { type ActionResult, toErrorMessage } from './shared';

export async function createReturnAction(input: ReturnInput): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser('returns.create');
    const parsed = returnSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    }
    const ret = await returnService.createReturn(parsed.data, user.id);
    revalidatePath(`/clientes/${parsed.data.customerId}`);
    return { success: true, data: { id: ret.id } };
  } catch (err) {
    return { success: false, error: toErrorMessage(err) };
  }
}
