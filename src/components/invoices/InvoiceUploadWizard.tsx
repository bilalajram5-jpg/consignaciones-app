'use client';

import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Trash2, Plus, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { uploadInvoiceAction, confirmInvoiceAction, rejectInvoiceAction, type UploadInvoiceResultData } from '@/app/actions/invoiceActions';
import { toast } from '@/components/ui/toaster';
import { cn, formatCurrency } from '@/lib/utils';

type ReviewItem = UploadInvoiceResultData['extraction']['items'][number];

const LOW_CONFIDENCE_THRESHOLD = 0.6;

/**
 * `initialResult`: cuando se pasa, el wizard arranca directamente en la
 * pantalla de revisión con los datos YA almacenados de una factura
 * PENDIENTE_REVISION (sección 3: la revisión humana debe poder retomarse
 * más tarde, no solo justo después de subir el archivo — antes esta
 * pantalla era un callejón sin salida si el usuario navegaba fuera del
 * wizard antes de confirmar). Sin este prop, el componente funciona igual
 * que antes: arranca en el formulario de carga de un archivo nuevo.
 */
export function InvoiceUploadWizard({
  customerId,
  initialResult,
}: {
  customerId: string;
  initialResult?: UploadInvoiceResultData;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, startUpload] = useTransition();
  const [isConfirming, startConfirm] = useTransition();
  const [isRejecting, startReject] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);

  const isResuming = !!initialResult;
  const [result, setResult] = useState<UploadInvoiceResultData | null>(initialResult ?? null);
  const [invoiceNumber, setInvoiceNumber] = useState(initialResult?.extraction.invoiceNumber ?? '');
  const [invoiceDate, setInvoiceDate] = useState(initialResult?.extraction.invoiceDate ?? '');
  const [invoiceTotal, setInvoiceTotal] = useState(initialResult?.extraction.invoiceTotal ?? '');
  const [items, setItems] = useState<ReviewItem[]>(initialResult?.extraction.items ?? []);
  const [confirmDespiteDuplicate, setConfirmDespiteDuplicate] = useState(false);

  function handleUpload(formData: FormData) {
    setError(null);
    formData.set('customerId', customerId);
    startUpload(async () => {
      const res = await uploadInvoiceAction(formData);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setResult(res.data);
      setInvoiceNumber(res.data.extraction.invoiceNumber);
      setInvoiceDate(res.data.extraction.invoiceDate);
      setInvoiceTotal(res.data.extraction.invoiceTotal);
      setItems(res.data.extraction.items);
      if (!res.data.mathValid) {
        toast({
          title: 'Revisa los montos',
          description: 'Algunas líneas no cuadran (cantidad × precio ≠ total). Corrígelas antes de confirmar.',
          variant: 'destructive',
        });
      }
    });
  }

  function updateItem(index: number, patch: Partial<ReviewItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      { productId: null, reference: '', description: '', quantity: 1, unitPrice: '0.00', lineTotal: '0.00' },
    ]);
  }

  function computedTotal(): string {
    return items.reduce((sum, it) => sum + Number(it.lineTotal || 0), 0).toFixed(2);
  }

  function handleConfirm() {
    if (!result) return;
    setError(null);
    startConfirm(async () => {
      const res = await confirmInvoiceAction({
        invoiceId: result.invoiceId,
        customerId,
        invoiceNumber,
        invoiceDate: new Date(invoiceDate),
        invoiceTotal,
        items: items.map((it) => ({
          productId: it.productId,
          reference: it.reference,
          description: it.description,
          quantity: Number(it.quantity),
          unitPrice: it.unitPrice,
          lineTotal: it.lineTotal,
        })),
        confirmDespiteDuplicateWarning: confirmDespiteDuplicate,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      toast({ title: 'Factura confirmada', description: 'El inventario del cliente se actualizó automáticamente.', variant: 'success' });
      router.push(`/clientes/${customerId}`);
    });
  }

  function handleReject() {
    if (!result) return;
    if (!rejectReason.trim()) {
      setError('Indica el motivo del rechazo.');
      return;
    }
    setError(null);
    startReject(async () => {
      const res = await rejectInvoiceAction({ invoiceId: result.invoiceId, customerId, reason: rejectReason.trim() });
      if (!res.success) {
        setError(res.error);
        return;
      }
      toast({ title: 'Factura rechazada', description: 'No se creó inventario ni movimientos por esta factura.' });
      router.push(`/clientes/${customerId}`);
    });
  }

  if (!result) {
    return (
      <Card>
        <CardContent className="pt-6">
          <form action={handleUpload} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="file">Archivo de la factura (PDF, JPG o PNG) *</Label>
              <Input ref={fileInputRef} id="file" name="file" type="file" accept="application/pdf,image/jpeg,image/png" required />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={isUploading} className="gap-2">
              <Upload className="h-4 w-4" />
              {isUploading ? 'Leyendo factura con IA...' : 'Subir y leer factura'}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {result.possibleDuplicate && (
        <div className="flex items-start gap-3 rounded-md border border-warning bg-warning/10 p-4">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div className="space-y-2">
            <p className="text-sm font-medium">Esta factura posiblemente ya fue registrada.</p>
            <p className="text-sm text-muted-foreground">
              Coincide con la factura {result.possibleDuplicate.invoiceNumber} del{' '}
              {new Date(result.possibleDuplicate.invoiceDate).toLocaleDateString('es-PA')}.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={confirmDespiteDuplicate} onChange={(e) => setConfirmDespiteDuplicate(e.target.checked)} />
              Sé que es una factura distinta, confirmar de todas formas
            </label>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Número de factura</Label>
              <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Fecha</Label>
              <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Total de factura (según documento)</Label>
              <Input type="number" step="0.01" value={invoiceTotal} onChange={(e) => setInvoiceTotal(e.target.value)} />
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Referencia</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Precio unitario</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, index) => {
                const expected = Number(item.quantity) * Number(item.unitPrice);
                const mismatch = Math.abs(expected - Number(item.lineTotal)) > 0.01;
                return (
                  <TableRow key={index}>
                    <TableCell>
                      <ConfidenceInput
                        value={item.reference}
                        confidence={item.confidence?.reference}
                        onChange={(v) => updateItem(index, { reference: v })}
                      />
                    </TableCell>
                    <TableCell>
                      <ConfidenceInput
                        value={item.description}
                        confidence={item.confidence?.description}
                        onChange={(v) => updateItem(index, { description: v })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <ConfidenceInput
                        type="number"
                        className="text-right"
                        value={String(item.quantity)}
                        confidence={item.confidence?.quantity}
                        onChange={(v) => updateItem(index, { quantity: Number(v) })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <ConfidenceInput
                        type="number"
                        className="text-right"
                        value={item.unitPrice}
                        confidence={item.confidence?.unitPrice}
                        onChange={(v) => updateItem(index, { unitPrice: v })}
                      />
                    </TableCell>
                    <TableCell className={cn('text-right', mismatch && 'text-destructive font-medium')}>
                      <Input
                        type="number"
                        step="0.01"
                        className="text-right"
                        value={item.lineTotal}
                        onChange={(e) => updateItem(index, { lineTotal: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => removeItem(index)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <Button variant="outline" size="sm" onClick={addItem} className="gap-2">
            <Plus className="h-4 w-4" /> Agregar producto
          </Button>

          <div className="flex justify-end text-sm text-muted-foreground">
            Suma de líneas: <span className="font-medium ml-1">{formatCurrency(computedTotal())}</span>
          </div>

          {showRejectForm && (
            <div className="rounded-md border border-destructive bg-destructive/10 p-3 space-y-2">
              <Label>Motivo del rechazo *</Label>
              <Input
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Ej. documento duplicado, ilegible, o no corresponde a este cliente"
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowRejectForm(false)}>
                  Volver
                </Button>
                <Button variant="destructive" size="sm" onClick={handleReject} disabled={isRejecting}>
                  {isRejecting ? 'Rechazando...' : 'Confirmar rechazo'}
                </Button>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          {!showRejectForm && (
            <div className="flex justify-between gap-2">
              <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setShowRejectForm(true)}>
                Rechazar factura
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => (isResuming ? router.push(`/clientes/${customerId}`) : setResult(null))}>
                  {isResuming ? 'Volver al cliente' : 'Cancelar'}
                </Button>
                <Button onClick={handleConfirm} disabled={isConfirming}>
                  {isConfirming ? 'Confirmando...' : 'Confirmar importación'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ConfidenceInput({
  value,
  onChange,
  confidence,
  type = 'text',
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  confidence?: number;
  type?: string;
  className?: string;
}) {
  const lowConfidence = confidence !== undefined && confidence < LOW_CONFIDENCE_THRESHOLD;
  return (
    <div className="space-y-0.5">
      <Input
        type={type}
        step={type === 'number' ? '0.01' : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(className, lowConfidence && 'border-warning ring-1 ring-warning')}
      />
      {lowConfidence && <p className="text-[10px] text-warning">Confianza baja ({Math.round(confidence * 100)}%), revisa este dato</p>}
    </div>
  );
}
