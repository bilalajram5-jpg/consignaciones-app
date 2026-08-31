'use client';

import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { createPaymentAction } from '@/app/actions/paymentActions';
import { toast } from '@/components/ui/toaster';

const METHODS = [
  { value: 'EFECTIVO', label: 'Efectivo' },
  { value: 'ACH', label: 'ACH' },
  { value: 'TRANSFERENCIA', label: 'Transferencia' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'TARJETA', label: 'Tarjeta' },
  { value: 'OTRO', label: 'Otro' },
];

export function NewPaymentDialog({ customerId }: { customerId: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState('EFECTIVO');

  function handleSubmit(formData: FormData) {
    setError(null);
    formData.set('customerId', customerId);
    formData.set('method', method);
    startTransition(async () => {
      const result = await createPaymentAction(formData);
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast({ title: 'Pago registrado', variant: 'success' });
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> Registrar pago
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="paymentDate">Fecha *</Label>
              <Input id="paymentDate" name="paymentDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amount">Monto *</Label>
              <Input id="amount" name="amount" type="number" step="0.01" min="0.01" required />
            </div>
            <div className="space-y-1.5">
              <Label>Método *</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="referenceNumber">Número de referencia</Label>
              <Input id="referenceNumber" name="referenceNumber" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bank">Banco</Label>
              <Input id="bank" name="bank" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="receipt">Comprobante (opcional)</Label>
              <Input id="receipt" name="receipt" type="file" accept="image/*,application/pdf" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Observaciones</Label>
            <Textarea id="notes" name="notes" rows={2} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Guardando...' : 'Registrar pago'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
