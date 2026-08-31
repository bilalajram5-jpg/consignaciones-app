'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/auth/session';
import { productSchema } from '@/lib/validators/schemas';
import * as productService from '@/services/productService';
import { type ActionResult, toErrorMessage } from './shared';

export async function createProductAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser('products.create');
    const parsed = productSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    }
    const product = await productService.createProduct(parsed.data, user.id);
    revalidatePath('/productos');
    return { success: true, data: { id: product.id } };
  } catch (err) {
    return { success: false, error: toErrorMessage(err) };
  }
}

export async function updateProductAction(id: string, formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser('products.edit');
    const parsed = productSchema.partial().safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    }
    await productService.updateProduct(id, parsed.data, user.id);
    revalidatePath('/productos');
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: toErrorMessage(err) };
  }
}
