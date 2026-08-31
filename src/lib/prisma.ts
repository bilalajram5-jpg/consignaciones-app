import { PrismaClient } from '@prisma/client';

/**
 * Cliente único de Prisma (patrón estándar para Next.js con hot-reload en
 * desarrollo: evita crear una nueva conexión en cada recarga del módulo).
 *
 * NOTA PARA VERIFICACIÓN: este archivo importa `@prisma/client`, que se
 * genera con `npx prisma generate` a partir de `prisma/schema.prisma`. No se
 * pudo ejecutar en este sandbox (sin acceso a npm) — es el primer comando a
 * correr según README.md → "Primera ejecución fuera del sandbox".
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
