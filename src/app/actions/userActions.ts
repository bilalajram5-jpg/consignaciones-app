'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/auth/session';
import { userSchema } from '@/lib/validators/schemas';
import * as userService from '@/services/userService';
import { type ActionResult, toErrorMessage } from './shared';

export async function createUserAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const actingUser = await requireUser('users.manage');
    const parsed = userSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    }
    const user = await userService.createUser(parsed.data, actingUser.id);
    revalidatePath('/usuarios');
    return { success: true, data: { id: user.id } };
  } catch (err) {
    return { success: false, error: toErrorMessage(err) };
  }
}
