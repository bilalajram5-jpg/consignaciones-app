import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateCurrentInventory, calculateConsolidatedInventory } from '../inventory/currentInventory.ts';

test('Fórmula oficial: entregado - vendido - devuelto + ajustes', () => {
  const inv = calculateCurrentInventory({
    deliveredQty: 50,
    soldQty: 32,
    returnedQty: 5,
    adjustedQty: 0,
  });
  assert.equal(inv, 13); // ejemplo exacto de la sección 12 del prompt maestro
});

test('Ajuste negativo (producto perdido/dañado) reduce el inventario', () => {
  const inv = calculateCurrentInventory({ deliveredQty: 10, soldQty: 0, returnedQty: 0, adjustedQty: -2 });
  assert.equal(inv, 8);
});

test('Ajuste positivo (corrección a favor) aumenta el inventario', () => {
  const inv = calculateCurrentInventory({ deliveredQty: 10, soldQty: 0, returnedQty: 0, adjustedQty: 2 });
  assert.equal(inv, 12);
});

test('Sección 14: múltiples facturas del mismo producto consolidan sin sobrescribirse', () => {
  const batchFactura1001 = { deliveredQty: 10, soldQty: 0, returnedQty: 0, adjustedQty: 0 };
  const batchFactura1050 = { deliveredQty: 20, soldQty: 0, returnedQty: 0, adjustedQty: 0 };
  const consolidado = calculateConsolidatedInventory([batchFactura1001, batchFactura1050]);
  assert.equal(consolidado, 30);
  // Cada lote conserva su propia cantidad entregada intacta
  assert.equal(batchFactura1001.deliveredQty, 10);
  assert.equal(batchFactura1050.deliveredQty, 20);
});

test('Rechaza componentes negativos ilegales (delivered/sold/returned)', () => {
  assert.throws(() =>
    calculateCurrentInventory({ deliveredQty: -1, soldQty: 0, returnedQty: 0, adjustedQty: 0 })
  );
});
