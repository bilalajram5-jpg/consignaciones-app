import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Combina clases de Tailwind sin colisiones (convención shadcn/ui estándar). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formatea un string/Decimal de dinero como moneda para mostrar en la UI. */
export function formatCurrency(value: string | number, currency = 'USD'): string {
  const numeric = typeof value === 'string' ? Number(value) : value;
  return new Intl.NumberFormat('es-PA', { style: 'currency', currency }).format(numeric);
}

export function formatDate(value: string | Date, opts?: Intl.DateTimeFormatOptions): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('es-PA', opts ?? { day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    date
  );
}

export function formatQuantity(value: string | number): string {
  const numeric = typeof value === 'string' ? Number(value) : value;
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(3).replace(/\.?0+$/, '');
}

/**
 * Etiquetas en español de `AccountMovementType` (sección 11: Estado de
 * Cuenta). Se centraliza aquí porque tanto la pestaña "Estado de cuenta" en
 * pantalla como el PDF (`/api/documents/statement/[customerId]`) deben
 * mostrar exactamente el mismo texto para el mismo tipo de movimiento.
 */
export const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  CARGO_VENTA: 'Consignación vendida',
  PAGO: 'Pago',
  NOTA_CREDITO: 'Nota de crédito',
  OTRO_CARGO: 'Otro cargo',
};
