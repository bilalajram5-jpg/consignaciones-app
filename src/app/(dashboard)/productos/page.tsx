import { listProducts } from '@/services/productService';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { NewProductDialog } from '@/components/products/NewProductDialog';
import { formatCurrency } from '@/lib/utils';

export default async function ProductsPage({ searchParams }: { searchParams: { sku?: string } }) {
  const { items } = await listProducts({ search: searchParams.sku });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Productos</h1>
        <NewProductDialog />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead className="text-right">Precio estándar</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.sku}</TableCell>
                  <TableCell>{p.name}</TableCell>
                  <TableCell>{p.category || '—'}</TableCell>
                  <TableCell className="text-right">{formatCurrency(p.standardPrice.toString())}</TableCell>
                  <TableCell>
                    <Badge variant={p.status === 'ACTIVO' ? 'success' : 'secondary'}>{p.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No hay productos todavía. Se crean automáticamente al confirmar facturas, o puedes agregarlos aquí.
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
