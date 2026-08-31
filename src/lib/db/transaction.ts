import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * Envoltorio de transacción SERIALIZABLE con reintento automático.
 *
 * Por qué (sección 38 del prompt maestro: "Probar concurrencia para evitar
 * que dos usuarios modifiquen el mismo inventario simultáneamente"): dos
 * vendedores podrían confirmar un corte para el mismo cliente/producto casi
 * al mismo tiempo (poco común pero posible con conexión intermitente y
 * reintentos del cliente). Con aislamiento SERIALIZABLE, Postgres garantiza
 * que el resultado final es equivalente a que esas transacciones se
 * hubieran ejecutado una después de la otra — nunca se pierde una
 * actualización (el clásico "lost update"). Si Postgres detecta un
 * conflicto de serialización, lanza el error P2034 y reintentamos
 * automáticamente unas pocas veces con backoff corto.
 *
 * TODA operación que lea `ConsignmentBatch.soldQty/returnedQty/adjustedQty`
 * y luego los actualice (confirmar corte, registrar devolución, registrar
 * ajuste) DEBE pasar por este wrapper, nunca por `prisma.$transaction`
 * directo con aislamiento por defecto (Read Committed), que sí permite
 * lost updates entre dos transacciones concurrentes.
 */
export async function withSerializableTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options: { maxRetries?: number; client?: PrismaClient } = {}
): Promise<T> {
  const { maxRetries = 3, client = prisma } = options;

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt += 1;
    try {
      return await client.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 15000,
      });
    } catch (err) {
      const isSerializationConflict =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034';
      if (isSerializationConflict && attempt <= maxRetries) {
        await sleep(50 * attempt * attempt); // backoff corto: 50ms, 200ms, 450ms...
        continue;
      }
      throw err;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
