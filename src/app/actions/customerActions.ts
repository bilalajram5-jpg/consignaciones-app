'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/auth/session';
import { customerSchema } from '@/lib/validators/schemas';
import * as customerService from '@/services/customerService';
import { type ActionResult, toErrorMessage } from './shared';

export async function createCustomerAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser('customers.create');
    const parsed = customerSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    }
    const customer = await customerService.createCustomer(parsed.data, user.id);
    revalidatePath('/clientes');
    return { success: true, data: { id: customer.id } };
  } catch (err) {
    return { success: false, error: toErrorMessage(err) };
  }
}

export async function updateCustomerAction(id: string, formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser('customers.edit');
    const parsed = customerSchema.partial().safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    }
    await customerService.updateCustomer(id, parsed.data, user.id);
    revalidatePath(`/clientes/${id}`);
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: toErrorMessage(err) };
  }
}
