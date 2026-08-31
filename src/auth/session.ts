import { getServerSession } from 'next-auth';
import { authConfig } from './auth.config';
import { assertPermission, type Permission } from './permissions';

/**
 * Helper central usado por TODOS los Server Actions y Route Handlers que
 * tocan datos financieros o de inventario. Combina "¿hay sesión?" y "¿tiene
 * permiso?" en una sola llamada, para que sea imposible escribir un
 * endpoint que se le olvide verificar alguna de las dos cosas.
 *
 * Uso:
 *   const user = await requireUser('payments.create');
 *   // user.id, user.role ya están garantizados válidos en este punto
 */
export async function requireUser(permission?: Permission) {
  const session = await getServerSession(authConfig);
  if (!session?.user?.id) {
    throw new Error('No autenticado');
  }
  if (permission) {
    assertPermission(session.user.role, permission);
  }
  return session.user;
}

export async function getCurrentUser() {
  const session = await getServerSession(authConfig);
  return session?.user ?? null;
}
