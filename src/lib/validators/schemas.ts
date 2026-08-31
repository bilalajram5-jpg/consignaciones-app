import { z } from 'zod';

/**
 * Esquemas Zod compartidos por formularios (cliente) y Server
 * Actions/Route Handlers (servidor). Sección 22: "Nunca confiar únicamente
 * en validaciones del frontend" — estos MISMOS esquemas se re-ejecutan en el
 * servidor, nunca solo en el formulario.
 */

const decimalString = z
  .string()
  .regex(/^-?\d+(\.\d{1,3})?$/, 'Debe ser un número decimal válido (hasta 3 decimales)');

const money2String = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, 'Debe ser un monto válido (hasta 2 decimales)');

export const customerSchema = z.object({
  tradeName: z.string().min(1, 'El nombre comercial es obligatorio').max(200),
  legalName: z.string().min(1, 'La razón social es obligatoria').max(200),
  ruc: z.string().max(50).optional().nullable(),
  dv: z.string().max(10).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().email('Email inválido').optional().nullable().or(z.literal('')),
  contactPerson: z.string().max(200).optional().nullable(),
  vendorId: z.string().optional().nullable(),
  startDate: z.coerce.date().optional(),
  status: z.enum(['ACTIVO', 'INACTIVO']).default('ACTIVO'),
  notes: z.string().max(5000).optional().nullable(),
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const productSchema = z.object({
  sku: z.string().min(1, 'La referencia/SKU es obligatoria').max(100),
  barcode: z.string().max(100).optional().nullable(),
  name: z.string().min(1, 'El nombre es obligatorio').max(300),
  description: z.string().max(3000).optional().nullable(),
  category: z.string().max(150).optional().nullable(),
  imageUrl: z.string().url().optional().nullable().or(z.literal('')),
  standardPrice: money2String,
  status: z.enum(['ACTIVO', 'INACTIVO']).default('ACTIVO'),
});
export type ProductInput = z.infer<typeof productSchema>;

/** Ítem de factura tal como sale de la pantalla de revisión (sección 3). */
export const invoiceItemReviewSchema = z.object({
  productId: z.string().optional().nullable(), // null si es un producto nuevo, se crea al confirmar
  reference: z.string().min(1, 'La referencia es obligatoria').max(100),
  description: z.string().min(1, 'La descripción es obligatoria').max(500),
  quantity: z.coerce.number().positive('La cantidad debe ser mayor a 0'),
  unitPrice: money2String,
  lineTotal: money2String,
});
export type InvoiceItemReviewInput = z.infer<typeof invoiceItemReviewSchema>;

export const invoiceConfirmSchema = z.object({
  invoiceId: z.string(),
  customerId: z.string(),
  invoiceNumber: z.string().min(1, 'El número de factura es obligatorio'),
  invoiceDate: z.coerce.date(),
  invoiceTotal: money2String,
  items: z.array(invoiceItemReviewSchema).min(1, 'La factura debe tener al menos un producto'),
  confirmDespiteDuplicateWarning: z.boolean().optional().default(false),
});
export type InvoiceConfirmInput = z.infer<typeof invoiceConfirmSchema>;

/** Rechazo de una factura en revisión (sección 3: la revisión humana también puede terminar en "no, esto no es válido"). */
export const rejectInvoiceSchema = z.object({
  invoiceId: z.string(),
  reason: z.string().min(3, 'Indica el motivo del rechazo').max(1000),
});
export type RejectInvoiceInput = z.infer<typeof rejectInvoiceSchema>;

export const inventoryCountItemInputSchema = z.discriminatedUnion('entryMode', [
  z.object({
    productId: z.string(),
    entryMode: z.literal('CONTEO_FISICO'),
    countedQty: decimalString,
  }),
  z.object({
    productId: z.string(),
    entryMode: z.literal('CANTIDAD_VENDIDA'),
    soldQty: decimalString,
  }),
]);
export type InventoryCountItemInput = z.infer<typeof inventoryCountItemInputSchema>;

export const confirmInventoryCountSchema = z.object({
  inventoryCountId: z.string(),
});

export const paymentSchema = z.object({
  customerId: z.string(),
  paymentDate: z.coerce.date(),
  amount: money2String.refine((v) => Number(v) > 0, 'El monto debe ser mayor a 0'),
  method: z.enum(['EFECTIVO', 'ACH', 'TRANSFERENCIA', 'CHEQUE', 'TARJETA', 'OTRO']),
  referenceNumber: z.string().max(100).optional().nullable(),
  bank: z.string().max(150).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});
export type PaymentInput = z.infer<typeof paymentSchema>;

export const returnItemSchema = z.object({
  consignmentBatchId: z.string(),
  productId: z.string(),
  quantity: decimalString.refine((v) => Number(v) > 0, 'La cantidad debe ser mayor a 0'),
});

export const returnSchema = z.object({
  customerId: z.string(),
  returnDate: z.coerce.date(),
  reason: z.string().min(1, 'El motivo es obligatorio').max(2000),
  items: z.array(returnItemSchema).min(1, 'Debe incluir al menos un producto'),
});
export type ReturnInput = z.infer<typeof returnSchema>;

export const adjustmentCategoryEnum = z.enum([
  'PRODUCTO_PERDIDO',
  'PRODUCTO_DAÑADO',
  'DIFERENCIA_CONTEO',
  'CORRECCION',
  'OTRO',
]);

export const adjustmentSchema = z.object({
  customerId: z.string(),
  consignmentBatchId: z.string(),
  productId: z.string(),
  quantity: decimalString.refine((v) => Number(v) !== 0, 'La cantidad del ajuste no puede ser 0'),
  reason: z.string().min(1, 'El motivo es obligatorio (sección 6/34: los ajustes siempre requieren motivo)').max(2000),
  category: adjustmentCategoryEnum,
});
export type AdjustmentInput = z.infer<typeof adjustmentSchema>;

export const userSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').optional(),
  role: z.enum(['ADMINISTRADOR', 'VENDEDOR', 'CONTABILIDAD', 'VISOR']),
  status: z.enum(['ACTIVO', 'INACTIVO']).default('ACTIVO'),
});
export type UserInput = z.infer<typeof userSchema>;
