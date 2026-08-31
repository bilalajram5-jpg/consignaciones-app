import { prisma } from '@/lib/prisma';
import { calculateCurrentInventory } from '@/domain/inventory/currentInventory';
import { calculateBalance } from '@/domain/accounts/calculateBalance';
import type { ExcelColumn } from '@/reports/excel/exportToExcel';

/**
 * Reportes exportables (sección 28). Cada función devuelve
 * `{ columns, rows }`, listo para pasar a `buildExcelWorkbook`/`buildCsv`.
 * Todos leen de la misma fuente de verdad que el resto de la app (los
 * mismos servicios/tablas), nunca datos duplicados o recalculados distinto.
 */

export async function getInventoryByCustomerReport() {
  const batches = await prisma.consignmentBatch.findMany({
    include: { customer: true, product: true },
  });

  const rows = batches
    .map((b) => {
      const available = calculateCurrentInventory({
        deliveredQty: Number(b.deliveredQty),
        soldQty: Number(b.soldQty),
        returnedQty: Number(b.returnedQty),
        adjustedQty: Number(b.adjustedQty),
      });
      return {
        cliente: b.customer.tradeName,
        codigoCliente: b.customer.code,
        referencia: b.product.sku,
        producto: b.product.name,
        entregado: Number(b.deliveredQty),
        vendido: Number(b.soldQty),
        devuelto: Number(b.returnedQty),
        disponible: available,
        precio: Number(b.unitPrice),
        valor: Number((available * Number(b.unitPrice)).toFixed(2)),
      };
    })
    .filter((r) => r.disponible > 0);

  const columns: ExcelColumn[] = [
    { header: 'Cliente', key: 'cliente', width: 25 },
    { header: 'Código', key: 'codigoCliente', width: 12 },
    { header: 'Referencia', key: 'referencia', width: 15 },
    { header: 'Producto', key: 'producto', width: 25 },
    { header: 'Entregado', key: 'entregado', width: 12 },
    { header: 'Vendido', key: 'vendido', width: 12 },
    { header: 'Devuelto', key: 'devuelto', width: 12 },
    { header: 'Disponible', key: 'disponible', width: 12 },
    { header: 'Precio', key: 'precio', width: 12, numFmt: '#,##0.00' },
    { header: 'Valor', key: 'valor', width: 14, numFmt: '#,##0.00' },
  ];

  return { columns, rows };
}

export async function getInventoryGeneralReport() {
  const { rows: byCustomerRows } = await getInventoryByCustomerReport();
  const byProduct = new Map<string, { referencia: string; producto: string; disponible: number; valor: number }>();

  for (const r of byCustomerRows) {
    const existing = byProduct.get(r.referencia);
    byProduct.set(r.referencia, {
      referencia: r.referencia,
      producto: r.producto,
      disponible: (existing?.disponible ?? 0) + r.disponible,
      valor: Number(((existing?.valor ?? 0) + r.valor).toFixed(2)),
    });
  }

  const columns: ExcelColumn[] = [
    { header: 'Referencia', key: 'referencia', width: 15 },
    { header: 'Producto', key: 'producto', width: 25 },
    { header: 'Disponible total', key: 'disponible', width: 15 },
    { header: 'Valor total', key: 'valor', width: 15, numFmt: '#,##0.00' },
  ];

  return { columns, rows: Array.from(byProduct.values()) };
}

export async function getReceivablesReport() {
  const customers = await prisma.customer.findMany({ include: { accountMovements: true } });

  const rows = customers.map((c) => {
    const balance = calculateBalance(
      c.accountMovements.map((m) => ({ type: m.type, debit: m.debit.toString(), credit: m.credit.toString() }))
    );
    return {
      codigo: c.code,
      cliente: c.tradeName,
      saldo: Number(balance),
    };
  });

  const columns: ExcelColumn[] = [
    { header: 'Código', key: 'codigo', width: 12 },
    { header: 'Cliente', key: 'cliente', width: 25 },
    { header: 'Saldo', key: 'saldo', width: 15, numFmt: '#,##0.00' },
  ];

  return { columns, rows: rows.filter((r) => r.saldo !== 0) };
}

export async function getPaymentsReport(from?: Date, to?: Date) {
  const payments = await prisma.payment.findMany({
    where: from || to ? { paymentDate: { gte: from, lte: to } } : undefined,
    include: { customer: true },
    orderBy: { paymentDate: 'desc' },
  });

  const columns: ExcelColumn[] = [
    { header: 'Fecha', key: 'fecha', width: 14 },
    { header: 'Cliente', key: 'cliente', width: 25 },
    { header: 'Método', key: 'metodo', width: 15 },
    { header: 'Referencia', key: 'referencia', width: 18 },
    { header: 'Monto', key: 'monto', width: 14, numFmt: '#,##0.00' },
  ];

  const rows = payments.map((p) => ({
    fecha: p.paymentDate.toISOString().slice(0, 10),
    cliente: p.customer.tradeName,
    metodo: p.method,
    referencia: p.referenceNumber || '',
    monto: Number(p.amount),
  }));

  return { columns, rows };
}

export async function getSalesByCustomerReport() {
  const grouped = await prisma.sale.groupBy({ by: ['customerId'], _sum: { totalAmount: true } });
  const customers = await prisma.customer.findMany({ where: { id: { in: grouped.map((g) => g.customerId) } } });
  const byId = new Map(customers.map((c) => [c.id, c]));

  const columns: ExcelColumn[] = [
    { header: 'Cliente', key: 'cliente', width: 25 },
    { header: 'Total vendido', key: 'total', width: 15, numFmt: '#,##0.00' },
  ];

  const rows = grouped.map((g) => ({
    cliente: byId.get(g.customerId)?.tradeName ?? '',
    total: Number(g._sum.totalAmount ?? 0),
  }));

  return { columns, rows };
}

export async function getSalesByProductReport() {
  const grouped = await prisma.saleItem.groupBy({ by: ['productId'], _sum: { quantity: true, lineTotal: true } });
  const products = await prisma.product.findMany({ where: { id: { in: grouped.map((g) => g.productId) } } });
  const byId = new Map(products.map((p) => [p.id, p]));

  const columns: ExcelColumn[] = [
    { header: 'Referencia', key: 'referencia', width: 15 },
    { header: 'Producto', key: 'producto', width: 25 },
    { header: 'Unidades vendidas', key: 'unidades', width: 16 },
    { header: 'Total vendido', key: 'total', width: 15, numFmt: '#,##0.00' },
  ];

  const rows = grouped.map((g) => ({
    referencia: byId.get(g.productId)?.sku ?? '',
    producto: byId.get(g.productId)?.name ?? '',
    unidades: Number(g._sum.quantity ?? 0),
    total: Number(g._sum.lineTotal ?? 0),
  }));

  return { columns, rows };
}

export const REPORT_TYPES = {
  'inventario-cliente': { label: 'Inventario por cliente', fn: getInventoryByCustomerReport },
  'inventario-general': { label: 'Inventario general', fn: getInventoryGeneralReport },
  'cuentas-por-cobrar': { label: 'Cuentas por cobrar', fn: getReceivablesReport },
  pagos: { label: 'Pagos recibidos', fn: () => getPaymentsReport() },
  'ventas-cliente': { label: 'Ventas por cliente', fn: getSalesByCustomerReport },
  'ventas-producto': { label: 'Ventas por producto', fn: getSalesByProductReport },
} as const;

export type ReportType = keyof typeof REPORT_TYPES;
