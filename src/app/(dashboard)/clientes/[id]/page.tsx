import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ClipboardList, Upload, FileDown } from 'lucide-react';
import { getCustomerById, getCustomerDashboardSummary } from '@/services/customerService';
import { getCustomerConsignmentInventory } from '@/services/inventoryService';
import { listInvoicesByCustomer } from '@/services/invoiceService';
import { listConsignmentCutsByCustomer } from '@/services/cutService';
import { listPaymentsByCustomer } from '@/services/paymentService';
import { getAccountStatement } from '@/services/accountService';
import { listReturnsByCustomer } from '@/services/returnService';
import { getCustomerHistory } from '@/services/historyService';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { formatCurrency, formatDate, formatQuantity, MOVEMENT_TYPE_LABELS } from '@/lib/utils';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { NewPaymentDialog } from '@/components/payments/NewPaymentDialog';
import { NewReturnDialog } from '@/components/inventory/NewReturnDialog';

export default async function CustomerDetailPage({ params }: { params: { id: string } }) {
  const customer = await getCustomerById(params.id);
  if (!customer) notFound();

  const [summary, inventory, invoices, cuts, payments, statement, returns, historial] = await Promise.all([
    getCustomerDashboardSummary(params.id),
    getCustomerConsignmentInventory(params.id),
    listInvoicesByCustomer(params.id),
    listConsignmentCutsByCustomer(params.id),
    listPaymentsByCustomer(params.id),
    getAccountStatement({ customerId: params.id }),
    listReturnsByCustomer(params.id),
    getCustomerHistory(params.id),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{customer.code}</p>
          <h1 className="text-2xl font-semibold">{customer.tradeName}</h1>
          <p className="text-sm text-muted-foreground">{customer.legalName}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" className="gap-2">
            <Link href={`/clientes/${customer.id}/facturas/nueva`}>
              <Upload className="h-4 w-4" /> Subir factura
            </Link>
          </Button>
          <Button asChild size="lg" className="gap-2">
            <Link href={`/clientes/${customer.id}/inventario`}>
              <ClipboardList className="h-5 w-5" /> Realizar inventario
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="Inventario actual" value={formatCurrency(summary.inventoryValue)} />
        <SummaryCard
          label="Saldo pendiente"
          value={formatCurrency(summary.balance)}
          highlight={Number(summary.balance) > 0}
        />
        <SummaryCard label="Último inventario" value={summary.lastCountDate ? formatDate(summary.lastCountDate) : '—'} />
        <SummaryCard
          label="Último pago"
          value={summary.lastPaymentAmount ? formatCurrency(summary.lastPaymentAmount) : '—'}
        />
      </div>

      <Tabs defaultValue="inventario">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="inventario">Inventario</TabsTrigger>
          <TabsTrigger value="facturas">Facturas</TabsTrigger>
          <TabsTrigger value="cortes">Cortes</TabsTrigger>
          <TabsTrigger value="pagos">Pagos</TabsTrigger>
          <TabsTrigger value="estado-cuenta">Estado de cuenta</TabsTrigger>
          <TabsTrigger value="devoluciones">Devoluciones</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="inventario">
          <div className="mb-3 flex justify-end">
            <a
              href={`/api/documents/inventory/${customer.id}`}
              target="_blank"
              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <FileDown className="h-4 w-4" /> Descargar PDF
            </a>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ref</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Precio</TableHead>
                    <TableHead className="text-right">Disponible</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventory.map((line) => (
                    <TableRow key={line.productId}>
                      <TableCell className="font-medium">{line.sku}</TableCell>
                      <TableCell>{line.productName}</TableCell>
                      <TableCell className="text-right">{formatCurrency(line.referenceUnitPrice)}</TableCell>
                      <TableCell className="text-right">{formatQuantity(line.availableQty)}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency((Number(line.referenceUnitPrice) * line.availableQty).toFixed(2))}
                      </TableCell>
                    </TableRow>
                  ))}
                  {inventory.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        Este cliente todavía no tiene inventario en consignación. Sube una factura para comenzar.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="facturas">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>
                        <Link href={`/clientes/${customer.id}/facturas/${inv.id}`} className="text-primary font-medium">
                          {inv.invoiceNumber}
                        </Link>
                      </TableCell>
                      <TableCell>{formatDate(inv.invoiceDate)}</TableCell>
                      <TableCell>
                        <Badge variant={inv.status === 'CONFIRMADA' ? 'success' : inv.status === 'RECHAZADA' ? 'destructive' : 'warning'}>
                          {inv.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(inv.invoiceTotal.toString())}</TableCell>
                    </TableRow>
                  ))}
                  {invoices.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        Sin facturas todavía.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cortes">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Corte</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="text-right">Unidades vendidas</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cuts.map((cut) => (
                    <TableRow key={cut.id}>
                      <TableCell className="font-medium">#{String(cut.cutNumber).padStart(5, '0')}</TableCell>
                      <TableCell>{formatDate(cut.cutDate)}</TableCell>
                      <TableCell className="text-right">{formatQuantity(cut.soldUnits.toString())}</TableCell>
                      <TableCell className="text-right">{formatCurrency(cut.totalAmount.toString())}</TableCell>
                      <TableCell>
                        <a href={`/api/documents/cut/${cut.id}`} target="_blank" className="text-primary text-sm hover:underline">
                          Ver PDF
                        </a>
                      </TableCell>
                    </TableRow>
                  ))}
                  {cuts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        Sin cortes confirmados todavía.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pagos">
          <div className="mb-3 flex justify-end">
            <NewPaymentDialog customerId={customer.id} />
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Referencia</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{formatDate(p.paymentDate)}</TableCell>
                      <TableCell>{p.method}</TableCell>
                      <TableCell>{p.referenceNumber || '—'}</TableCell>
                      <TableCell className="text-right">{formatCurrency(p.amount.toString())}</TableCell>
                      <TableCell>
                        <a href={`/api/documents/payment/${p.id}`} target="_blank" className="text-primary text-sm hover:underline">
                          Ver recibo
                        </a>
                      </TableCell>
                    </TableRow>
                  ))}
                  {payments.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        Sin pagos registrados todavía.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="estado-cuenta">
          <div className="mb-3 flex justify-end">
            <a
              href={`/api/documents/statement/${customer.id}`}
              target="_blank"
              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <FileDown className="h-4 w-4" /> Descargar PDF
            </a>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Documento</TableHead>
                    <TableHead className="text-right">Débito</TableHead>
                    <TableHead className="text-right">Crédito</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statement.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{formatDate(row.date)}</TableCell>
                      <TableCell>{MOVEMENT_TYPE_LABELS[row.type] ?? row.type}</TableCell>
                      <TableCell>{row.documentRef}</TableCell>
                      <TableCell className="text-right">{Number(row.debit) > 0 ? formatCurrency(row.debit) : '—'}</TableCell>
                      <TableCell className="text-right">{Number(row.credit) > 0 ? formatCurrency(row.credit) : '—'}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(row.balance)}</TableCell>
                    </TableRow>
                  ))}
                  {statement.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        Sin movimientos todavía.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="devoluciones">
          <div className="mb-3 flex justify-end">
            <NewReturnDialog customerId={customer.id} inventory={inventory} />
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Productos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {returns.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{formatDate(r.returnDate)}</TableCell>
                      <TableCell>{r.reason}</TableCell>
                      <TableCell>
                        {r.items.map((i) => `${i.product.sku} (${formatQuantity(i.quantity.toString())})`).join(', ')}
                      </TableCell>
                    </TableRow>
                  ))}
                  {returns.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                        Sin devoluciones registradas.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historial">
          <div className="mb-3 flex justify-end">
            <a
              href={`/api/documents/customer-history/${customer.id}`}
              target="_blank"
              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <FileDown className="h-4 w-4" /> Descargar PDF
            </a>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead>Detalle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historial.map((h, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{formatDate(h.date)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{h.type}</Badge>
                      </TableCell>
                      <TableCell>{h.detail}</TableCell>
                    </TableRow>
                  ))}
                  {historial.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                        Sin actividad todavía.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`text-xl font-semibold mt-1 ${highlight ? 'text-destructive' : ''}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
