import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocateFifo } from '../inventory/fifoAllocation.ts';
import { InsufficientInventoryError } from '../errors.ts';

test('Sección 15: dos facturas del mismo producto a precios distintos, FIFO consume primero la más antigua', () => {
  const batches = [
    { batchId: 'lote_factura_200', availableQty: 15, unitPrice: '22.00', batchDate: '2026-05-01' },
    { batchId: 'lote_factura_100', availableQty: 10, unitPrice: '20.00', batchDate: '2026-01-01' },
  ];
  // Se venden 12 unidades: deben salir 10 del lote más antiguo ($20) y 2 del más nuevo ($22)
  const result = allocateFifo(batches, 12);
  assert.equal(result.allocations.length, 2);
  assert.equal(result.allocations[0].batchId, 'lote_factura_100');
  assert.equal(result.allocations[0].qty, 10);
  assert.equal(result.allocations[0].amount, '200.00');
  assert.equal(result.allocations[1].batchId, 'lote_factura_200');
  assert.equal(result.allocations[1].qty, 2);
  assert.equal(result.allocations[1].amount, '44.00');
  assert.equal(result.totalAmount, '244.00');
});

test('Un solo lote alcanza para toda la venta', () => {
  const batches = [{ batchId: 'b1', availableQty: 10, unitPrice: '20.00', batchDate: '2026-01-01' }];
  const result = allocateFifo(batches, 3);
  assert.equal(result.allocations.length, 1);
  assert.equal(result.totalAmount, '60.00');
});

test('Lanza InsufficientInventoryError si el total pedido excede el total disponible entre todos los lotes', () => {
  const batches = [
    { batchId: 'b1', availableQty: 3, unitPrice: '20.00', batchDate: '2026-01-01' },
    { batchId: 'b2', availableQty: 2, unitPrice: '22.00', batchDate: '2026-02-01' },
  ];
  assert.throws(() => allocateFifo(batches, 6), InsufficientInventoryError);
});

test('Ignora lotes sin inventario disponible', () => {
  const batches = [
    { batchId: 'agotado', availableQty: 0, unitPrice: '20.00', batchDate: '2026-01-01' },
    { batchId: 'b2', availableQty: 5, unitPrice: '22.00', batchDate: '2026-02-01' },
  ];
  const result = allocateFifo(batches, 4);
  assert.equal(result.allocations.length, 1);
  assert.equal(result.allocations[0].batchId, 'b2');
});

test('Precio histórico del lote se conserva aunque el precio "actual" del producto haya cambiado', () => {
  // El precio actual del producto podría ser $22 (ver Product.standardPrice),
  // pero la asignación FIFO SIEMPRE usa el unitPrice guardado en el lote.
  const batches = [{ batchId: 'lote_viejo', availableQty: 5, unitPrice: '20.00', batchDate: '2026-01-01' }];
  const result = allocateFifo(batches, 5);
  assert.equal(result.allocations[0].unitPrice, '20.00');
});
