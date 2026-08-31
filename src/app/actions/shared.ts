import { ForbiddenError } from '@/auth/permissions';

/**
 * NOTA: este archivo NO lleva 'use server' porque Next.js exige que TODO
 * export de un archivo 'use server' sea una función async (server action).
 * Este helper es código compartido normal, importado por los archivos de
 * acciones (customerActions.ts, invoiceActions.ts, etc.).
 */
export type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

export function toErrorMessage(err: unknown): string {
  if (err instanceof ForbiddenError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Ocurrió un error inesperado.';
}
