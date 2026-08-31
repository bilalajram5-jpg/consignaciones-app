import Link from 'next/link';
import { globalSearch } from '@/services/searchService';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate } from '@/lib/utils';

export default async function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  const q = searchParams.q || '';
  const results = q ? await globalSearch(q) : { customers: [], products: [], invoices: [], cuts: [] };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Buscar{q ? `: "${q}"` : ''}</h1>

      {results.products.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Productos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {results.products.map((p) => (
              <div key={p.id} className="flex justify-between text-sm py-1 border-b last:border-0">
                <span>{p.sku} · {p.name}</span>
                <span>{formatCurrency(p.standardPrice.toString())}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {results.customers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Clientes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {results.customers.map((c) => (
              <Link key={c.id} href={`/clientes/${c.id}`} className="block text-sm py-1 border-b last:border-0 text-primary">
                {c.code} · {c.tradeName}
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {results.invoices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Facturas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {results.invoices.map((inv) => (
              <Link
                key={inv.id}
                href={`/clientes/${inv.customerId}/facturas/${inv.id}`}
                className="flex justify-between items-center text-sm py-1 border-b last:border-0 text-primary"
              >
                <span>
                  Factura {inv.invoiceNumber} · {inv.customer.tradeName}
                </span>
                <span className="flex items-center gap-2">
                  <Badge variant={inv.status === 'CONFIRMADA' ? 'success' : inv.status === 'RECHAZADA' ? 'destructive' : 'warning'}>
                    {inv.status}
                  </Badge>
                  <span className="text-muted-foreground">{formatCurrency(inv.invoiceTotal.toString())}</span>
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {results.cuts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Cortes de consignación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {results.cuts.map((cut) => (
              <Link
                key={cut.id}
                href={`/clientes/${cut.customerId}`}
                className="flex justify-between items-center text-sm py-1 border-b last:border-0 text-primary"
              >
                <span>
                  Corte #{String(cut.cutNumber).padStart(5, '0')} · {cut.customer.tradeName}
                </span>
                <span className="text-muted-foreground">
                  {formatDate(cut.cutDate)} · {formatCurrency(cut.totalAmount.toString())}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {q && !results.products.length && !results.customers.length && !results.invoices.length && !results.cuts.length && (
        <p className="text-muted-foreground text-sm">Sin resultados para "{q}".</p>
      )}
    </div>
  );
}
