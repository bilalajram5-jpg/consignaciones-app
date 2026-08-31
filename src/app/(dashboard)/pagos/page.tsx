import Link from 'next/link';
import { listRecentPayments } from '@/services/paymentService';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { formatCurrency, formatDate } from '@/lib/utils';

export default async function PaymentsPage() {
  const payments = await listRecentPayments(100);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Pagos</h1>
      <p className="text-sm text-muted-foreground">
        Para registrar un nuevo pago, entra al cliente correspondiente y usa la pestaña "Pagos".
      </p>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Cliente</TableHead>
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
                  <TableCell>
                    <Link href={`/clientes/${p.customerId}`} className="text-primary font-medium">
                      {p.customer.tradeName}
                    </Link>
                  </TableCell>
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
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Sin pagos registrados todavía.
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
