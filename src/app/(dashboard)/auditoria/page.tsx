import { listAuditLogs } from '@/services/auditService';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';

const ACTION_LABELS: Record<string, string> = {
  CUSTOMER_CREATE: 'Cliente creado',
  CUSTOMER_UPDATE: 'Cliente editado',
  PRODUCT_CREATE: 'Producto creado',
  PRODUCT_UPDATE: 'Producto editado',
  PRODUCT_PRICE_EDIT: 'Precio editado',
  INVOICE_UPLOAD: 'Factura subida',
  INVOICE_CONFIRM: 'Factura confirmada',
  INVOICE_REJECT: 'Factura rechazada',
  CONSIGNMENT_CUT_CONFIRM: 'Corte confirmado',
  PAYMENT_CREATE: 'Pago registrado',
  RETURN_CREATE: 'Devolución registrada',
  INVENTORY_ADJUSTMENT: 'Ajuste de inventario',
};

/** Registro de actividad (sección 21): quién hizo qué, cuándo, y valores antes/después. */
export default async function AuditPage() {
  const { items } = await listAuditLogs({ pageSize: 100 });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Registro de actividad</h1>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Entidad</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap">{formatDate(log.createdAt, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</TableCell>
                  <TableCell>{log.user?.name ?? 'Sistema'}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{ACTION_LABELS[log.action] ?? log.action}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {log.entityType} · {log.entityId.slice(0, 8)}
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    Sin actividad registrada todavía.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
