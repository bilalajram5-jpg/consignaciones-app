import { prisma } from '@/lib/prisma';

/**
 * Búsqueda global (sección 18): referencia/SKU, producto, cliente, número
 * de factura, número de corte. Devuelve resultados agrupados por tipo para
 * que la UI pueda mostrar secciones separadas.
 */
export async function globalSearch(query: string) {
  const q = query.trim();
  if (q.length < 2) {
    return { customers: [], products: [], invoices: [], cuts: [] };
  }

  const cutNumber = /^\d+$/.test(q) ? Number(q) : undefined;

  const [customers, products, invoices, cuts] = await Promise.all([
    prisma.customer.findMany({
      where: {
        OR: [
          { tradeName: { contains: q, mode: 'insensitive' } },
          { legalName: { contains: q, mode: 'insensitive' } },
          { code: { contains: q, mode: 'insensitive' } },
          { ruc: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: 10,
    }),
    prisma.product.findMany({
      where: {
        OR: [
          { sku: { contains: q, mode: 'insensitive' } },
          { name: { contains: q, mode: 'insensitive' } },
          { barcode: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: 10,
    }),
    prisma.invoice.findMany({
      where: { invoiceNumber: { contains: q, mode: 'insensitive' } },
      include: { customer: { select: { tradeName: true } } },
      take: 10,
    }),
    cutNumber
      ? prisma.consignmentCut.findMany({
          where: { cutNumber },
          include: { customer: { select: { tradeName: true } } },
          take: 10,
        })
      : Promise.resolve([]),
  ]);

  return { customers, products, invoices, cuts };
}

/**
 * Ejemplo de la sección 18: al buscar una referencia, mostrar el producto,
 * qué clientes lo tienen, cuánto, cuánto se ha vendido y el precio. Reusa
 * `getProductTraceability` (sección 12) que ya calcula exactamente esto.
 */
export async function searchProductDetail(productId: string) {
  const { getProductTraceability } = await import('./productService');
  return getProductTraceability(productId);
}
