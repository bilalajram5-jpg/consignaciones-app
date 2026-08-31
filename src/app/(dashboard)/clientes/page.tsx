import Link from 'next/link';
import { getCurrentUser } from '@/auth/session';
import { listCustomers } from '@/services/customerService';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { NewCustomerDialog } from '@/components/customers/NewCustomerDialog';

export default async function CustomersPage({ searchParams }: { searchParams: { q?: string } }) {
  const user = await getCurrentUser();
  if (!user) return null;

  const { items } = await listCustomers({
    actingUserId: user.id,
    actingUserRole: user.role,
    search: searchParams.q,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Clientes</h1>
        <NewCustomerDialog />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre comercial</TableHead>
                <TableHead>RUC</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((c) => (
                <TableRow key={c.id} className="cursor-pointer">
                  <TableCell>
                    <Link href={`/clientes/${c.id}`} className="text-primary font-medium">
                      {c.code}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/clientes/${c.id}`}>{c.tradeName}</Link>
                  </TableCell>
                  <TableCell>{c.ruc || '—'}</TableCell>
                  <TableCell>{c.vendor?.name || '—'}</TableCell>
                  <TableCell>
                    <Badge variant={c.status === 'ACTIVO' ? 'success' : 'secondary'}>{c.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No hay clientes todavía.
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
