'use client';

import { useEffect, useRef, useState } from 'react';
import { ScanLine, CameraOff } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const SCANNER_ELEMENT_ID = 'barcode-scanner-viewport';

/**
 * Escaneo de código de barras/QR con la cámara del dispositivo (sección 19
 * del prompt maestro). Usa `html5-qrcode` (ya declarado en package.json),
 * importado dinámicamente en el cliente porque la librería accede a `navigator`
 * y al DOM directamente — no puede cargarse en el servidor ni al momento del
 * build.
 *
 * NO EJECUTADO EN EL SANDBOX (no hay cámara ni navegador real disponibles
 * aquí, y `html5-qrcode` no se pudo instalar sin acceso a npm — ver
 * VERIFICATION_LOG.md). El código sigue la API pública documentada de la
 * librería (`Html5Qrcode.start`/`stop`), pero debe probarse en un celular o
 * navegador real antes de confiar en él en producción.
 */
export function BarcodeScannerDialog({
  open,
  onOpenChange,
  onDecode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDecode: (text: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'starting' | 'scanning' | 'stopped'>('starting');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scannerRef = useRef<any>(null);
  const hasDecodedRef = useRef(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    hasDecodedRef.current = false;
    setError(null);
    setStatus('starting');

    async function start() {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled) return;

        const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' }, // cámara trasera, mejor para escanear productos
          { fps: 10, qrbox: { width: 260, height: 180 } },
          (decodedText: string) => {
            if (hasDecodedRef.current) return; // evita disparar el callback varias veces por el mismo código
            hasDecodedRef.current = true;
            onDecode(decodedText);
          },
          () => {
            // callback de "no se detectó nada en este frame": es normal y
            // se dispara constantemente mientras la cámara busca un código,
            // no se trata como error.
          }
        );

        if (!cancelled) setStatus('scanning');
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? `No se pudo acceder a la cámara: ${err.message}`
            : 'No se pudo acceder a la cámara. Verifica los permisos del navegador.'
        );
        setStatus('stopped');
      }
    }

    start();

    return () => {
      cancelled = true;
      const scanner = scannerRef.current;
      if (scanner) {
        scanner
          .stop()
          .then(() => scanner.clear())
          .catch(() => {
            /* la cámara ya pudo haberse detenido; no es un error que el usuario necesite ver */
          });
        scannerRef.current = null;
      }
    };
  }, [open, onDecode]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5" /> Escanear producto
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {error ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
              <CameraOff className="h-8 w-8" />
              <p>{error}</p>
              <p className="text-xs">
                Puedes seguir usando el campo de conteo manual — el escaneo es solo un atajo opcional.
              </p>
            </div>
          ) : (
            <>
              <div id={SCANNER_ELEMENT_ID} className="w-full overflow-hidden rounded-md bg-black min-h-[220px]" />
              <p className="text-center text-xs text-muted-foreground">
                {status === 'starting' ? 'Activando la cámara...' : 'Apunta la cámara al código de barras o QR del producto'}
              </p>
            </>
          )}
          <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
