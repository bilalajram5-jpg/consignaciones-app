'use client';

import { useState, useTransition, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Minus, Plus, AlertTriangle, ArrowRight, ArrowLeft, CheckCircle2, ScanLine, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  saveCountItemAction,
  confirmInventoryCutAction,
  getCountSummaryAction,
  type SaveCountItemPayload,
} from '@/app/actions/countActions';
import { AdjustmentDialog } from './AdjustmentDialog';
import { BarcodeScannerDialog } from './BarcodeScannerDialog';
import { toast } from '@/components/ui/toaster';
import { cn, formatCurrency, formatQuantity } from '@/lib/utils';
import type { CountEntryMode } from '@/domain/inventory/reconcileInventoryCount';

interface ProductLine {
  productId: string;
  sku: string;
  barcode: string | null;
  name: string;
  availableQty: number;
  unitPrice: string;
  batches: Array<{ batchId: string; availableQty: number; batchDate: string | Date }>;
}

interface ExistingItem {
  productId: string;
  entryMode: CountEntryMode;
  countedQty?: number;
  soldQty: number;
  newQty: number;
  lineAmount: string;
  hasDiscrepancy: boolean;
}

interface ItemState {
  mode: CountEntryMode;
  inputValue: string;
  soldQty: number;
  newQty: number;
  lineAmount: string;
  hasDiscrepancy: boolean;
  saved: boolean;
  saving: boolean;
}

function buildInitialState(products: ProductLine[], existingByProduct: Map<string, ExistingItem>): Record<string, ItemState> {
  const initial: Record<string, ItemState> = {};
  for (const p of products) {
    const existing = existingByProduct.get(p.productId);
    initial[p.productId] = existing
      ? {
          mode: existing.entryMode,
          inputValue: String(existing.entryMode === 'CONTEO_FISICO' ? existing.countedQty ?? existing.newQty : existing.soldQty),
          soldQty: existing.soldQty,
          newQty: existing.newQty,
          lineAmount: existing.lineAmount,
          hasDiscrepancy: existing.hasDiscrepancy,
          saved: true,
          saving: false,
        }
      : {
          mode: 'CONTEO_FISICO',
          inputValue: String(p.availableQty),
          soldQty: 0,
          newQty: p.availableQty,
          lineAmount: '0.00',
          hasDiscrepancy: false,
          saved: false,
          saving: false,
        };
  }
  return initial;
}

/** Convierte texto de entrada a un número seguro (nunca NaN, nunca negativo). */
function safeNumber(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function InventoryCountWizard({
  customerId,
  customerName,
  inventoryCountId,
  products,
  existingItems,
}: {
  customerId: string;
  customerName: string;
  inventoryCountId: string;
  products: ProductLine[];
  existingItems: ExistingItem[];
}) {
  const router = useRouter();
  const existingByProduct = useMemo(() => new Map(existingItems.map((i) => [i.productId, i])), [existingItems]);

  const [states, setStates] = useState<Record<string, ItemState>>(() => buildInitialState(products, existingByProduct));

  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<'counting' | 'summary'>('counting');
  const [adjustmentTarget, setAdjustmentTarget] = useState<ProductLine | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof getCountSummaryAction>> | null>(null);
  const [isConfirming, startConfirm] = useTransition();
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const productByCode = useMemo(() => {
    const map = new Map<string, ProductLine>();
    for (const p of products) {
      map.set(p.sku.trim().toLowerCase(), p);
      if (p.barcode) map.set(p.barcode.trim().toLowerCase(), p);
    }
    return map;
  }, [products]);

  // Contador de peticiones por producto: los botones [-]/[+] guardan de
  // inmediato en cada tap (sección de mobile UX), así que un usuario puede
  // disparar varias peticiones al servidor para el MISMO producto antes de
  // que la primera responda. En una red móvil lenta las respuestas pueden
  // llegar en un orden distinto al que se enviaron; sin esta guarda, una
  // respuesta "vieja" que llega tarde podría sobrescribir en pantalla el
  // resultado de un tap más reciente. Cada respuesta solo se aplica si
  // sigue siendo la más reciente para ese producto.
  const requestSeqRef = useRef<Record<string, number>>({});

  const persist = useCallback((payload: SaveCountItemPayload) => {
    const seq = (requestSeqRef.current[payload.productId] ?? 0) + 1;
    requestSeqRef.current[payload.productId] = seq;

    setStates((prev) => ({ ...prev, [payload.productId]: { ...prev[payload.productId]!, saving: true } }));
    startTransition(async () => {
      // Try/catch explícito: en una visita a un cliente el celular puede
      // perder señal a mitad de un guardado. Sin esto, un `fetch` que falla
      // por falta de red lanza una excepción que este `await` no atraparía,
      // dejando la fila trabada en "Guardando..." para siempre y sin
      // ninguna indicación de que hay que reintentar (sección de mobile UX:
      // este es el flujo más usado y el que más probablemente se use con
      // conectividad inestable).
      let result: Awaited<ReturnType<typeof saveCountItemAction>>;
      try {
        result = await saveCountItemAction(payload);
      } catch {
        const isStillLatest = requestSeqRef.current[payload.productId] === seq;
        toast({
          title: 'Sin conexión',
          description: 'No se pudo guardar por un problema de red. Revisa tu señal e inténtalo de nuevo.',
          variant: 'destructive',
        });
        if (isStillLatest) {
          setStates((prev) => ({ ...prev, [payload.productId]: { ...prev[payload.productId]!, saving: false } }));
        }
        return;
      }

      const isStillLatest = requestSeqRef.current[payload.productId] === seq;
      if (!result.success) {
        toast({ title: 'No se pudo guardar', description: result.error, variant: 'destructive' });
        if (isStillLatest) {
          setStates((prev) => ({ ...prev, [payload.productId]: { ...prev[payload.productId]!, saving: false } }));
        }
        return;
      }
      if (!isStillLatest) {
        // Ya se disparó un tap más nuevo para este producto (ej. varios
        // toques rápidos en +/-): esta respuesta quedó desactualizada,
        // se descarta para no pisar en pantalla el resultado del tap más
        // reciente. El valor final en la base de datos siempre corresponde
        // a la última petición procesada por el servidor.
        return;
      }
      setStates((prev) => ({
        ...prev,
        [payload.productId]: {
          ...prev[payload.productId]!,
          soldQty: result.data.soldQty,
          newQty: result.data.newQty,
          lineAmount: result.data.lineAmount,
          hasDiscrepancy: result.data.hasDiscrepancy,
          saved: true,
          saving: false,
        },
      }));
      if (result.data.hasDiscrepancy) {
        toast({
          title: 'El conteo físico es mayor que el inventario registrado.',
          description: 'Resuelve esta discrepancia con un ajuste antes de confirmar el corte.',
          variant: 'destructive',
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (products.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground space-y-3">
        <p>{customerName} no tiene inventario en consignación todavía. Sube una factura primero.</p>
        <Button asChild variant="outline">
          <Link href={`/clientes/${customerId}`}>Volver al cliente</Link>
        </Button>
      </div>
    );
  }

  const product = products[index]!;
  const state = states[product.productId]!;

  function commitForProduct(p: ProductLine, mode: CountEntryMode, rawValue: string) {
    const numeric = safeNumber(rawValue);
    const payload: SaveCountItemPayload =
      mode === 'CONTEO_FISICO'
        ? { inventoryCountId, productId: p.productId, entryMode: 'CONTEO_FISICO', countedQty: numeric }
        : { inventoryCountId, productId: p.productId, entryMode: 'CANTIDAD_VENDIDA', soldQty: numeric };
    persist(payload);
  }

  function updateValue(newValue: string) {
    setStates((prev) => ({ ...prev, [product.productId]: { ...prev[product.productId]!, inputValue: newValue, saved: false } }));
  }

  /** Usado por los botones [-]/[+]: actualiza y guarda de inmediato con el valor calculado, sin esperar a un blur. */
  function adjustAndCommit(delta: number) {
    const next = Math.max(0, safeNumber(state.inputValue) + delta);
    updateValue(String(next));
    commitForProduct(product, state.mode, String(next));
  }

  function commitValue() {
    commitForProduct(product, state.mode, state.inputValue);
  }

  function switchMode(mode: CountEntryMode) {
    const nextValue = mode === 'CONTEO_FISICO' ? String(product.availableQty) : '0';
    setStates((prev) => ({
      ...prev,
      [product.productId]: { ...prev[product.productId]!, mode, inputValue: nextValue, saved: false },
    }));
  }

  /** Garantiza que un cambio sin guardar no se pierda al cambiar de producto (sección 25). */
  function ensureSaved() {
    if (!state.saved && !state.saving) {
      commitValue();
    }
  }

  function goNext() {
    ensureSaved();
    if (index < products.length - 1) setIndex(index + 1);
    else openSummary();
  }
  function goPrev() {
    ensureSaved();
    if (index > 0) setIndex(index - 1);
  }

  function goToProductIndex(i: number) {
    ensureSaved();
    setIndex(i);
  }

  function openSummary() {
    startTransition(async () => {
      try {
        const res = await getCountSummaryAction(inventoryCountId);
        setSummary(res);
        setStep('summary');
      } catch {
        toast({
          title: 'Sin conexión',
          description: 'No se pudo cargar el resumen por un problema de red. Inténtalo de nuevo.',
          variant: 'destructive',
        });
      }
    });
  }

  function confirmCut() {
    setConfirmError(null);
    startConfirm(async () => {
      try {
        const res = await confirmInventoryCutAction(inventoryCountId);
        if (!res.success) {
          setConfirmError(res.error);
          return;
        }
        toast({
          title: `Corte #${String(res.data.cutNumber).padStart(5, '0')} confirmado`,
          description: `Total: ${formatCurrency(res.data.totalAmount)}`,
          variant: 'success',
        });
        router.push(`/clientes/${customerId}`);
      } catch {
        // Un corte confirmado es la operación más importante de esta
        // pantalla: si la red falla justo aquí, el usuario NUNCA debe
        // quedarse sin saber si se confirmó o no. Se le pide explícitamente
        // que verifique la pestaña "Cortes" del cliente antes de reintentar,
        // en vez de arriesgarse a un doble corte por reintentar a ciegas.
        setConfirmError(
          'No se pudo confirmar el corte por un problema de red. Antes de reintentar, verifica en la ficha del cliente si el corte ya quedó registrado.'
        );
      }
    });
  }

  function handleScanDecode(text: string) {
    const match = productByCode.get(text.trim().toLowerCase());
    setScannerOpen(false);
    if (!match) {
      toast({
        title: 'Producto no encontrado',
        description: `El código "${text}" no coincide con ningún producto en consignación de este cliente.`,
        variant: 'destructive',
      });
      return;
    }
    const foundIndex = products.findIndex((p) => p.productId === match.productId);
    if (foundIndex >= 0) {
      goToProductIndex(foundIndex);
      toast({ title: 'Producto encontrado', description: `${match.sku} · ${match.name}`, variant: 'success' });
    }
  }

  if (step === 'summary') {
    const hasDiscrepancies = Object.values(states).some((s) => s.hasDiscrepancy);
    return (
      <div className="max-w-lg mx-auto space-y-4">
        <h1 className="text-2xl font-semibold">Resumen de inventario</h1>
        <p className="text-muted-foreground">{customerName}</p>

        {summary?.success && (
          <Card>
            <CardContent className="pt-6 space-y-3">
              <SummaryRow label="Productos revisados" value={String(summary.data.itemsReviewed)} />
              <SummaryRow label="Unidades vendidas" value={formatQuantity(summary.data.soldUnits)} />
              <SummaryRow label="Monto vendido" value={formatCurrency(summary.data.totalAmount)} bold />
              <SummaryRow label="Discrepancias sin resolver" value={String(summary.data.discrepanciesCount)} warn={summary.data.discrepanciesCount > 0} />
            </CardContent>
          </Card>
        )}

        {hasDiscrepancies && (
          <div className="flex items-start gap-2 rounded-md border border-destructive bg-destructive/10 p-4 text-sm">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <p>Hay discrepancias sin resolver. Vuelve atrás y registra un ajuste antes de confirmar el corte.</p>
          </div>
        )}

        {confirmError && <p className="text-sm text-destructive">{confirmError}</p>}

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setStep('counting')}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Volver
          </Button>
          <Button className="flex-1" size="lg" disabled={isConfirming || hasDiscrepancies} onClick={confirmCut}>
            {isConfirming ? 'Confirmando...' : 'CONFIRMAR CORTE'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{customerName}</p>
          <h1 className="text-xl font-semibold">Realizar inventario</h1>
        </div>
        <Badge variant="outline">
          {index + 1} / {products.length}
        </Badge>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="gap-2 flex-1" onClick={() => setScannerOpen(true)}>
          <ScanLine className="h-4 w-4" /> Escanear código
        </Button>
        <Button variant="ghost" size="sm" className="gap-2" asChild>
          <Link href={`/clientes/${customerId}`}>
            <Save className="h-4 w-4" /> Guardar borrador y salir
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">{product.sku}</p>
            <p className="text-xl font-bold uppercase">{product.name}</p>
            <p className="text-sm text-muted-foreground mt-1">
              Anterior: {formatQuantity(product.availableQty)} · Precio: {formatCurrency(product.unitPrice)}
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant={state.mode === 'CONTEO_FISICO' ? 'default' : 'outline'}
              size="sm"
              onClick={() => switchMode('CONTEO_FISICO')}
              className="flex-1"
            >
              Contar inventario
            </Button>
            <Button
              variant={state.mode === 'CANTIDAD_VENDIDA' ? 'default' : 'outline'}
              size="sm"
              onClick={() => switchMode('CANTIDAD_VENDIDA')}
              className="flex-1"
            >
              Ingresar vendidos
            </Button>
          </div>

          {state.mode === 'CONTEO_FISICO' ? (
            <div>
              <p className="text-sm text-muted-foreground mb-2">Conteo actual</p>
              <div className="flex items-center gap-3">
                <Button variant="outline" size="lg" className="tap-target-lg" onClick={() => adjustAndCommit(-1)}>
                  <Minus className="h-5 w-5" />
                </Button>
                <Input
                  type="number"
                  inputMode="decimal"
                  className="text-center text-2xl h-14"
                  value={state.inputValue}
                  onChange={(e) => updateValue(e.target.value)}
                  onBlur={commitValue}
                  onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
                />
                <Button variant="outline" size="lg" className="tap-target-lg" onClick={() => adjustAndCommit(1)}>
                  <Plus className="h-5 w-5" />
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm text-muted-foreground mb-2">Cantidad vendida</p>
              <Input
                type="number"
                inputMode="decimal"
                className="text-center text-2xl h-14"
                value={state.inputValue}
                onChange={(e) => updateValue(e.target.value)}
                onBlur={commitValue}
                onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
              />
            </div>
          )}

          {!state.saved && !state.saving && (
            <Button className="w-full" onClick={commitValue}>
              Guardar
            </Button>
          )}
          {state.saving && (
            <p className="text-center text-sm text-muted-foreground">Guardando...</p>
          )}

          {state.hasDiscrepancy && (
            <div className="rounded-md border border-destructive bg-destructive/10 p-3 space-y-2">
              <p className="text-sm font-medium text-destructive flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> El conteo físico es mayor que el inventario registrado.
              </p>
              <Button size="sm" variant="destructive" onClick={() => setAdjustmentTarget(product)}>
                Resolver con ajuste
              </Button>
            </div>
          )}

          {state.saved && !state.hasDiscrepancy && !state.saving && (
            <div className="grid grid-cols-2 gap-3 pt-2 border-t">
              <div>
                <p className="text-xs text-muted-foreground">Vendidos</p>
                <p className="text-lg font-semibold flex items-center gap-1">
                  {formatQuantity(state.soldQty)} <CheckCircle2 className="h-4 w-4 text-success" />
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Monto</p>
                <p className="text-lg font-semibold">{formatCurrency(state.lineAmount)}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="fixed bottom-16 md:bottom-4 left-0 right-0 px-4">
        <div className="max-w-lg mx-auto flex gap-2">
          <Button variant="outline" size="lg" onClick={goPrev} disabled={index === 0} className="tap-target-lg">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Button size="lg" onClick={goNext} disabled={isPending} className="flex-1 tap-target-lg gap-2">
            {index < products.length - 1 ? 'Siguiente producto' : 'Ver resumen'} <ArrowRight className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <BarcodeScannerDialog open={scannerOpen} onOpenChange={setScannerOpen} onDecode={handleScanDecode} />

      {adjustmentTarget && (
        <AdjustmentDialog
          open={!!adjustmentTarget}
          onOpenChange={(open) => !open && setAdjustmentTarget(null)}
          customerId={customerId}
          productId={adjustmentTarget.productId}
          productLabel={`${adjustmentTarget.sku} · ${adjustmentTarget.name}`}
          batches={adjustmentTarget.batches}
          onSaved={() => {
            // Tras el ajuste, el inventario disponible de ESTE producto
            // cambió. En vez de dejar la línea marcada como "guardada con
            // discrepancia" (lo que bloquearía el corte indefinidamente),
            // se limpia localmente para que el usuario vuelva a capturar el
            // conteo — sección 6: una discrepancia nunca se resuelve en
            // silencio, siempre requiere volver a contar contra el nuevo
            // inventario ya ajustado.
            const targetId = adjustmentTarget.productId;
            setStates((prev) => ({
              ...prev,
              [targetId]: {
                ...prev[targetId]!,
                hasDiscrepancy: false,
                saved: false,
              },
            }));
            setAdjustmentTarget(null);
            router.refresh();
            toast({
              title: 'Ajuste registrado',
              description: 'Vuelve a introducir el conteo de este producto para confirmar el corte.',
            });
          }}
        />
      )}
    </div>
  );
}

function SummaryRow({ label, value, bold, warn }: { label: string; value: string; bold?: boolean; warn?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn(bold && 'font-semibold text-base', warn && 'text-destructive font-medium')}>{value}</span>
    </div>
  );
}
