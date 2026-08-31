'use client';

import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { createReturnAction } from '@/app/actions/returnActions';
import { toast } from '@/components/ui/toaster';
import type { ProductInventoryLine } from '@/services/inventoryService';
import { formatQuantity } from '@/lib/utils';

export function NewReturnDialog({ customerId, inventory }: { customerId: string; inventory: ProductInventoryLine[] }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [productId, setProductId] = useState<string>('');
  const [batchId, setBatchId] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('');
  const [reason, setReason] = useState('');
  const [returnDate, setReturnDate] = useState(new Date().toISOString().slice(0, 10));

  const availableProducts = inventory.filter((l) => l.availableQty > 0);
  const selectedLine = availableProducts.find((l) => l.productId === productId);
  const selectedBatch = selectedLine?.batches.find((b) => b.batchId === batchId && b.availableQty > 0);

  function handleSubmit() {
    setError(null);
    if (!productId || !batchId || !quantity || !reason) {
      setError('Completa todos los campos.');
      return;
    }
    startTransition(async () => {
      const result = await createReturnAction({
        customerId,
        returnDate: new Date(returnDate),
        reason,
        items: [{ consignmentBatchId: batchId, productId, quantity }],
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast({ title: 'Devolución registrada', variant: 'success' });
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Plus className="h-4 w-4" /> Registrar devolución
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar devolución</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Producto *</Label>
            <Select value={productId} onValueChange={(v) => { setProductId(v); setBatchId(''); }}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un producto" />
              </SelectTrigger>
              <SelectContent>
                {availableProducts.map((l) => (
                  <SelectItem key={l.productId} value={l.productId}>
                    {l.sku} · {l.productName} (disp. {formatQuantity(l.availableQty)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedLine && (
            <div className="space-y-1.5">
              <Label>Lote (por fecha de entrega) *</Label>
              <Select value={batchId} onValueChange={setBatchId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un lote" />
                </SelectTrigger>
                <SelectContent>
                  {selectedLine.batches
                    .filter((b) => b.availableQty > 0)
                    .map((b) => (
                      <SelectItem key={b.batchId} value={b.batchId}>
                        {new Date(b.batchDate).toLocaleDateString('es-PA')} — disp. {formatQuantity(b.availableQty)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="return-qty">Cantidad *</Label>
              <Input
                id="return-qty"
                type="number"
                min="0.001"
                step="0.001"
                max={selectedBatch?.availableQty}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="return-date">Fecha *</Label>
              <Input id="return-date" type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="return-reason">Motivo *</Label>
            <Textarea id="return-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? 'Guardando...' : 'Registrar devolución'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
