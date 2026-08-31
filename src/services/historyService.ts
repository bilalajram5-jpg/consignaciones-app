import { listInvoicesByCustomer } from './invoiceService';
import { listConsignmentCutsByCustomer } from './cutService';
import { listPaymentsByCustomer } from './paymentService';
import { listReturnsByCustomer } from './returnService';
import { listAdjustmentsByCustomer } from './adjustmentService';

export interface CustomerHistoryEvent {
  date: Date;
  type: string;
  detail: string;
}

/**
 * Historial completo de un cliente (sección 8): consolida facturas,
 * cortes, pagos, devoluciones y ajustes en una sola línea de tiempo,
 * ordenada del evento más reciente al más antiguo.
 *
 * Se extrajo de la página de detalle del cliente a este servicio
 * compartido para que la pestaña "Historial" en pantalla y el PDF de
 * Historial del Cliente (`/api/documents/customer-history/[customerId]`)
 * usen exactamente la misma fuente y nunca puedan mostrar eventos
 * distintos.
 */
export async function getCustomerHistory(customerId: string): Promise<CustomerHistoryEvent[]> {
  const [invoices, cuts, payments, returns, adjustments] = await Promise.all([
    listInvoicesByCustomer(customerId),
    listConsignmentCutsByCustomer(customerId),
    listPaymentsByCustomer(customerId),
    listReturnsByCustomer(customerId),
    listAdjustmentsByCustomer(customerId),
  ]);

  const events: CustomerHistoryEvent[] = [];

  for (const c of cuts) {
    events.push({ date: c.cutDate, type: 'Corte', detail: `Corte #${String(c.cutNumber).padStart(5, '0')} — ${c.totalAmount}` });
  }
  for (const p of payments) {
    events.push({ date: p.paymentDate, type: 'Pago', detail: `${p.method} — ${p.amount}` });
  }
  for (const r of returns) {
    events.push({ date: r.returnDate, type: 'Devolución', detail: r.reason });
  }
  for (const a of adjustments) {
    events.push({ date: a.createdAt, type: 'Ajuste', detail: `${a.product.sku}: ${a.quantity} — ${a.reason}` });
  }
  for (const i of invoices) {
    events.push({ date: i.invoiceDate, type: 'Factura', detail: `Factura ${i.invoiceNumber} (${i.status})` });
  }

  return events.sort((a, b) => b.date.getTime() - a.date.getTime());
}
