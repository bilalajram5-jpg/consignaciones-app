import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileInventoryCount } from '../inventory/reconcileInventoryCount.ts';
import { allocateFifo } from '../inventory/fifoAllocation.ts';
import { calculateBalance } from '../accounts/calculateBalance.ts';
import { calculateCurrentInventory } from '../inventory/currentInventory.ts';

/**
 * Reproduce, usando ÚNICAMENTE las funciones de dominio (sin base de
 * datos), el ejemplo completo de la sección 35 del prompt maestro, de la
 * misma forma en que docs/verify_seed.sql lo reprodujo a nivel de SQL. Que
 * ambas verificaciones —independientes— lleguen al mismo resultado ($80 de
 * saldo final, inventario de A=5) es la prueba más fuerte disponible en este
 * entorno de que el diseño es correcto de punta a punta.
 */
test('Flujo completo sección 35: factura -> visita 1 -> pago -> visita 2', () => {
  // Factura: A=10 u x $20, B=5 u x $30
  const batches = {
    A: { deliveredQty: 10, unitPrice: '20.00', batchDate: '2026-08-01' },
    B: { deliveredQty: 5, unitPrice: '30.00', batchDate: '2026-08-01' },
  };

  // --- VISITA #1: conteo físico A=7, B=4 ---
  const countA1 = reconcileInventoryCount({ previousQty: batches.A.deliveredQty, mode: 'CONTEO_FISICO', countedQty: 7 });
  const countB1 = reconcileInventoryCount({ previousQty: batches.B.deliveredQty, mode: 'CONTEO_FISICO', countedQty: 4 });
  assert.equal(countA1.soldQty, 3);
  assert.equal(countB1.soldQty, 1);

  const allocA1 = allocateFifo(
    [{ batchId: 'batch_A', availableQty: batches.A.deliveredQty, unitPrice: batches.A.unitPrice, batchDate: batches.A.batchDate }],
    countA1.soldQty
  );
  const allocB1 = allocateFifo(
    [{ batchId: 'batch_B', availableQty: batches.B.deliveredQty, unitPrice: batches.B.unitPrice, batchDate: batches.B.batchDate }],
    countB1.soldQty
  );
  assert.equal(allocA1.totalAmount, '60.00');
  assert.equal(allocB1.totalAmount, '30.00');

  const cut1Total = (
    Number(allocA1.totalAmount) + Number(allocB1.totalAmount)
  ).toFixed(2);
  assert.equal(cut1Total, '90.00'); // TOTAL DEL CORTE #1

  // Cuenta por cobrar tras corte 1
  let movements = [{ type: 'CARGO_VENTA' as const, debit: cut1Total, credit: '0.00' }];
  assert.equal(calculateBalance(movements), '90.00');

  // --- PAGO $50 ---
  movements = [...movements, { type: 'PAGO' as const, debit: '0.00', credit: '50.00' }];
  assert.equal(calculateBalance(movements), '40.00');

  // Actualizar lote A tras la venta 1 (lo haría el servicio transaccionalmente)
  const batchAAfterVisit1 = { deliveredQty: 10, soldQty: 3, returnedQty: 0, adjustedQty: 0 };
  const inventoryAAfterVisit1 = calculateCurrentInventory(batchAAfterVisit1);
  assert.equal(inventoryAAfterVisit1, 7);

  // --- VISITA #2: A anterior=7 (inventario real), cuenta 5 -> vendidos 2 ---
  const countA2 = reconcileInventoryCount({ previousQty: inventoryAAfterVisit1, mode: 'CONTEO_FISICO', countedQty: 5 });
  assert.equal(countA2.soldQty, 2);
  const allocA2 = allocateFifo(
    [{ batchId: 'batch_A', availableQty: inventoryAAfterVisit1, unitPrice: batches.A.unitPrice, batchDate: batches.A.batchDate }],
    countA2.soldQty
  );
  assert.equal(allocA2.totalAmount, '40.00'); // 2 x $20 = $40, TOTAL ADEUDADO corte 2

  movements = [...movements, { type: 'CARGO_VENTA' as const, debit: allocA2.totalAmount, credit: '0.00' }];
  const saldoFinal = calculateBalance(movements);
  assert.equal(saldoFinal, '80.00'); // EXACTAMENTE el resultado esperado por el prompt maestro

  // Inventario final de A: 10 - (3+2) - 0 + 0 = 5
  const inventoryFinalA = calculateCurrentInventory({ deliveredQty: 10, soldQty: 5, returnedQty: 0, adjustedQty: 0 });
  assert.equal(inventoryFinalA, 5);
});
