import { notFound } from 'next/navigation';
import { getInvoiceById } from '@/services/invoiceService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { formatCurrency, formatDate, formatQuantity } from '@/lib/utils';
import { InvoiceUploadWizard } from '@/components/invoices/InvoiceUploadWizard';
import type { UploadInvoiceResultData } from '@/app/actions/invoiceActions';

export default async function InvoiceDetailPage({ params }: { params: { id: string; invoiceId: string } }) {
  const invoice = await getInvoiceById(params.invoiceId);
  if (!invoice || invoice.customerId !== params.id) notFound();

  // Una factura PENDIENTE_REVISION nunca debe ser un callejón sin salida
  // (sección 3): si el usuario subió el archivo y salió antes de terminar
  // la revisión, retoma exactamente la misma pantalla de revisión con los
  // datos ya guardados, en vez de mostrar solo una vista de solo lectura
  // sin ninguna acción posible.
  if (invoice.status === 'PENDIENTE_REVISION') {
    const initialResult: UploadInvoiceResultData = {
      invoiceId: invoice.id,
      extraction: {
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate.toISOString().slice(0, 10),
        invoiceTotal: invoice.invoiceTotal.toString(),
        customerName: invoice.customer.tradeName,
        items: invoice.items.map((i) => ({
          productId: i.productId,
          reference: i.reference,
          description: i.description,
          quantity: Number(i.quantity),
          unitPrice: i.unitPrice.toString(),
          lineTotal: i.lineTotal.toString(),
          confidence: {
            reference: i.referenceConfidence ? Number(i.referenceConfidence) : undefined,
            description: i.descriptionConfidence ? Number(i.descriptionConfidence) : undefined,
            quantity: i.quantityConfidence ? Number(i.quantityConfidence) : undefined,
            unitPrice: i.priceConfidence ? Number(i.priceConfidence) : undefined,
          },
        })),
      },
      mathValid: true,
      possibleDuplicate: invoice.possibleDuplicateOf
        ? {
            id: invoice.possibleDuplicateOf.id,
            invoiceNumber: invoice.possibleDuplicateOf.invoiceNumber,
            invoiceDate: invoice.possibleDuplicateOf.invoiceDate,
            invoiceTotal: invoice.possibleDuplicateOf.invoiceTotal,
          }
        : null,
    };

    return (
      <div className="space-y-4 max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{invoice.customer.tradeName}</p>
            <h1 className="text-2xl font-semibold">Retomar revisión — Factura {invoice.invoiceNumber}</h1>
          </div>
          <Badge variant="warning">PENDIENTE_REVISION</Badge>
        </div>
        <InvoiceUploadWizard customerId={params.id} initialResult={initialResult} />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{invoice.customer.tradeName}</p>
          <h1 className="text-2xl font-semibold">Factura {invoice.invoiceNumber}</h1>
        </div>
        <Badge variant={invoice.status === 'CONFIRMADA' ? 'success' : invoice.status === 'RECHAZADA' ? 'destructive' : 'warning'}>
          {invoice.status}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Detalle</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Fecha</p>
            <p className="font-medium">{formatDate(invoice.invoiceDate)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Total</p>
            <p className="font-medium">{formatCurrency(invoice.invoiceTotal.toString())}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Confianza IA</p>
            <p className="font-medium">
              {invoice.aiOverallConfidence ? `${Math.round(Number(invoice.aiOverallConfidence) * 100)}%` : '—'}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Productos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ref</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.reference}</TableCell>
                  <TableCell>{item.description}</TableCell>
                  <TableCell className="text-right">{formatQuantity(item.quantity.toString())}</TableCell>
                  <TableCell className="text-right">{formatCurrency(item.unitPrice.toString())}</TableCell>
                  <TableCell className="text-right">{formatCurrency(item.lineTotal.toString())}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
