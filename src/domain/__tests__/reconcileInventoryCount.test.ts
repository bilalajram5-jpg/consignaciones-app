import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileInventoryCount } from '../inventory/reconcileInventoryCount.ts';
import { InsufficientInventoryError } from '../errors.ts';

test('Modo A (conteo físico): 10 anterior, cuenta 7 -> vendidos 3', () => {
  const r = reconcileInventoryCount({ previousQty: 10, mode: 'CONTEO_FISICO', countedQty: 7 });
  assert.equal(r.soldQty, 3);
  assert.equal(r.newQty, 7);
  assert.equal(r.hasDiscrepancy, false);
});

test('Modo B (cantidad vendida): 10 anterior, vendidos 3 -> nuevo inventario 7', () => {
  const r = reconcileInventoryCount({ previousQty: 10, mode: 'CANTIDAD_VENDIDA', soldQty: 3 });
  assert.equal(r.newQty, 7);
  assert.equal(r.soldQty, 3);
  assert.equal(r.hasDiscrepancy, false);
});

test('Modo A y Modo B producen EXACTAMENTE el mismo resultado para el mismo escenario', () => {
  const modoA = reconcileInventoryCount({ previousQty: 10, mode: 'CONTEO_FISICO', countedQty: 7 });
  const modoB = reconcileInventoryCount({ previousQty: 10, mode: 'CANTIDAD_VENDIDA', soldQty: 3 });
  assert.equal(modoA.soldQty, modoB.soldQty);
  assert.equal(modoA.newQty, modoB.newQty);
});

test('Error exacto de sección 6: no se puede vender más de lo disponible (Modo B)', () => {
  assert.throws(
    () => reconcileInventoryCount({ previousQty: 5, mode: 'CANTIDAD_VENDIDA', soldQty: 7 }),
    (err: unknown) => {
      assert.ok(err instanceof InsufficientInventoryError);
      assert.equal(
        (err as Error).message,
        'No puedes registrar 7 unidades vendidas porque solamente existen 5 unidades disponibles.'
      );
      return true;
    }
  );
});

test('Discrepancia (sección 6): conteo físico mayor que el inventario del sistema', () => {
  const r = reconcileInventoryCount({ previousQty: 10, mode: 'CONTEO_FISICO', countedQty: 11 });
  assert.equal(r.hasDiscrepancy, true);
  assert.equal(r.soldQty, 0);
  assert.equal(r.newQty, 10); // no se modifica el inventario silenciosamente
});

test('Conteo físico igual al inventario anterior: 0 vendidos, sin discrepancia', () => {
  const r = reconcileInventoryCount({ previousQty: 10, mode: 'CONTEO_FISICO', countedQty: 10 });
  assert.equal(r.soldQty, 0);
  assert.equal(r.newQty, 10);
  assert.equal(r.hasDiscrepancy, false);
});

test('Vender exactamente todo el inventario disponible es válido (límite exacto)', () => {
  const r = reconcileInventoryCount({ previousQty: 5, mode: 'CANTIDAD_VENDIDA', soldQty: 5 });
  assert.equal(r.newQty, 0);
});

test('Rechaza cantidades negativas o inválidas', () => {
  assert.throws(() => reconcileInventoryCount({ previousQty: -1, mode: 'CONTEO_FISICO', countedQty: 1 }));
  assert.throws(() => reconcileInventoryCount({ previousQty: 10, mode: 'CANTIDAD_VENDIDA', soldQty: -3 }));
  assert.throws(() => reconcileInventoryCount({ previousQty: 10, mode: 'CONTEO_FISICO' }));
});
