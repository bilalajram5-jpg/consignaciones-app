'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { createAdjustmentAction } from '@/app/actions/adjustmentActions';
import { toast } from '@/components/ui/toaster';
import { formatQuantity } from '@/lib/utils';

const CATEGORIES = [
  { value: 'DIFERENCIA_CONTEO', label: 'Diferencia de conteo' },
  { value: 'PRODUCTO_PERDIDO', label: 'Producto perdido' },
  { value: 'PRODUCTO_DAÑADO', label: 'Producto dañado' },
  { value: 'CORRECCION', label: 'Corrección' },
  { value: 'OTRO', label: 'Otro' },
];

export interface AdjustmentTargetBatch {
  batchId: string;
  availableQty: number;
  batchDate: string | Date;
}

export function AdjustmentDialog({
  open,
  onOpenChange,
  customerId,
  productId,
  productLabel,
  batches,
  suggestedQuantity,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  productId: string;
  productLabel: string;
  batches: AdjustmentTargetBatch[];
  suggestedQuantity?: number;
  onSaved?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [batchId, setBatchId] = useState(batches[0]?.batchId ?? '');
  const [quantity, setQuantity] = useState(suggestedQuantity !== undefined ? String(suggestedQuantity) : '');
  const [category, setCategory] = useState('DIFERENCIA_CONTEO');
  const [reason, setReason] = useState('');

  function handleSubmit() {
    setError(null);
    if (!batchId || !quantity || !reason.trim()) {
      setError('Completa el lote, la cantidad y el motivo.');
      return;
    }
    startTransition(async () => {
      const result = await createAdjustmentAction({
        customerId,
        consignmentBatchId: batchId,
        productId,
        quantity,
        reason,
        category: category as never,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast({ title: 'Ajuste registrado', variant: 'success' });
      onOpenChange(false);
      onSaved?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajuste de inventario — {productLabel}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Lote afectado *</Label>
            <Select value={batchId} onValueChange={setBatchId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {batches.map((b) => (
                  <SelectItem key={b.batchId} value={b.batchId}>
                    {new Date(b.batchDate).toLocaleDateString('es-PA')} — disponible {formatQuantity(b.availableQty)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="adj-qty">Cantidad (+ o -) *</Label>
              <Input id="adj-qty" type="number" step="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              <p className="text-xs text-muted-foreground">Usa negativo para reducir (ej. -2), positivo para aumentar.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Categoría *</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adj-reason">Motivo *</Label>
            <Textarea id="adj-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? 'Guardando...' : 'Guardar ajuste'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
