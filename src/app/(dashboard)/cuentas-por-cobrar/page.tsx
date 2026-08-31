import Link from 'next/link';
import { listReceivablesSummary } from '@/services/accountService';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { formatCurrency, formatDate } from '@/lib/utils';

export default async function ReceivablesPage() {
  const rows = await listReceivablesSummary();
  const totalBalance = rows.reduce((sum, r) => sum + Number(r.balance), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Cuentas por cobrar</h1>
        <p className="text-lg font-semibold">{formatCurrency(totalBalance.toFixed(2))}</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Cargos</TableHead>
                <TableHead className="text-right">Pagos</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead>Última visita</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows
                .sort((a, b) => Number(b.balance) - Number(a.balance))
                .map((r) => (
                  <TableRow key={r.customerId}>
                    <TableCell>
                      <Link href={`/clientes/${r.customerId}`} className="text-primary font-medium">
                        {r.customerName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(r.totalCharges)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.totalPayments)}</TableCell>
                    <TableCell className={`text-right font-medium ${Number(r.balance) > 0 ? 'text-destructive' : ''}`}>
                      {formatCurrency(r.balance)}
                    </TableCell>
                    <TableCell>{r.lastVisit ? formatDate(r.lastVisit) : '—'}</TableCell>
                  </TableRow>
                ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Sin clientes activos todavía.
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
