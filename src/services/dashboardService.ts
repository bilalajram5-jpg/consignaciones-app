import { prisma } from '@/lib/prisma';
import { getTotalConsignmentValue } from './inventoryService';
import { getTotalReceivable, getTopCustomersByBalance } from './accountService';

/** Alimenta el Dashboard Principal (sección 16). */
export async function getDashboardData() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalConsignmentValue,
    totalReceivable,
    salesThisMonth,
    paymentsThisMonth,
    activeCustomersCount,
    productsInConsignmentCount,
    topCustomersByBalance,
    topSellingProducts,
    lastCounts,
    lastPayments,
  ] = await Promise.all([
    getTotalConsignmentValue(),
    getTotalReceivable(),
    prisma.sale.aggregate({ _sum: { totalAmount: true }, where: { saleDate: { gte: monthStart } } }),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { paymentDate: { gte: monthStart } } }),
    prisma.customer.count({ where: { status: 'ACTIVO' } }),
    prisma.consignmentBatch
      .groupBy({ by: ['productId'] })
      .then((rows) => rows.length),
    getTopCustomersByBalance(5),
    getTopSellingProducts(5),
    prisma.inventoryCount.findMany({
      where: { status: 'CONFIRMADO' },
      orderBy: { confirmedAt: 'desc' },
      take: 5,
      include: { customer: { select: { tradeName: true } } },
    }),
    prisma.payment.findMany({
      orderBy: { paymentDate: 'desc' },
      take: 5,
      include: { customer: { select: { tradeName: true } } },
    }),
  ]);

  return {
    totalConsignmentValue,
    totalReceivable,
    salesThisMonth: (salesThisMonth._sum.totalAmount ?? 0).toString(),
    paymentsThisMonth: (paymentsThisMonth._sum.amount ?? 0).toString(),
    activeCustomersCount,
    productsInConsignmentCount,
    topCustomersByBalance,
    topSellingProducts,
    lastCounts,
    lastPayments,
  };
}

async function getTopSellingProducts(limit: number) {
  const grouped = await prisma.saleItem.groupBy({
    by: ['productId'],
    _sum: { quantity: true, lineTotal: true },
    orderBy: { _sum: { quantity: 'desc' } },
    take: limit,
  });

  const products = await prisma.product.findMany({ where: { id: { in: grouped.map((g) => g.productId) } } });
  const byId = new Map(products.map((p) => [p.id, p]));

  return grouped.map((g) => ({
    productId: g.productId,
    sku: byId.get(g.productId)?.sku ?? '',
    name: byId.get(g.productId)?.name ?? '',
    unitsSold: Number(g._sum.quantity ?? 0),
    totalSold: (g._sum.lineTotal ?? 0).toString(),
  }));
}
