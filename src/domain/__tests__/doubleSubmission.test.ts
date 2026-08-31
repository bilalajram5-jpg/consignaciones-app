import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocateFifo } from '../inventory/fifoAllocation.ts';
import { reconcileInventoryCount } from '../inventory/reconcileInventoryCount.ts';
import { calculateCurrentInventory } from '../inventory/currentInventory.ts';
import { InsufficientInventoryError } from '../errors.ts';

/**
 * "Doble registro" a nivel de dominio (complementa
 * `scripts/verify_concurrency.sh`, que prueba el mismo problema a nivel de
 * base de datos con transacciones Postgres reales y concurrentes).
 *
 * Estas pruebas SÍ corren en este sandbox con `node --test` (no dependen de
 * Postgres) y documentan una capa de defensa distinta: incluso si dos
 * peticiones lograran llegar al servicio con el MISMO estado "anterior"
 * leído (por ejemplo, un doble clic que mandó la petición dos veces antes
 * de que la primera respuesta actualizara la pantalla), las funciones
 * puras de dominio nunca permiten que la segunda aplicación "silenciosa"
 * de la misma operación exceda el inventario disponible — siempre y cuando
 * el servidor recalcule `previousQty`/`availableQty` a partir del estado
 * MÁS RECIENTE antes de cada llamada, que es exactamente lo que hacen
 * `countService.ts` y `cutService.ts` (leen el batch dentro de la misma
 * transacción `withSerializableTransaction` antes de aplicar el cambio, en
 * vez de confiar en un valor que el cliente mandó).
 */

test('Doble envío de "vender 5" contra el mismo inventario original: la segunda aplicación falla si ya no hay suficiente', () => {
  const previousQty = 5;

  // Primer envío (el que "gana la carrera"): vende las 5 unidades disponibles.
  const first = reconcileInventoryCount({ previousQty, mode: 'CANTIDAD_VENDIDA', soldQty: 5 });
  assert.equal(first.newQty, 0);

  // Segundo envío duplicado: el servidor SIEMPRE debe recalcular contra el
  // inventario que quedó después del primero (0), nunca contra el valor
  // original (5) que pudo haber traído el segundo request en su payload.
  assert.throws(
    () => reconcileInventoryCount({ previousQty: first.newQty, mode: 'CANTIDAD_VENDIDA', soldQty: 5 }),
    (err: unknown) => {
      assert.ok(err instanceof InsufficientInventoryError);
      assert.equal(
        (err as Error).message,
        'No puedes registrar 5 unidades vendidas porque solamente existen 0 unidades disponibles.'
      );
      return true;
    }
  );
});

test('Doble clic en "Confirmar corte": aplicar la misma reconciliación dos veces seguidas nunca duplica la venta silenciosamente', () => {
  // Simula un usuario que hace doble clic en el botón de confirmar: dos
  // llamadas idénticas, una inmediatamente después de la otra, cada una
  // recalculando contra el inventario ya actualizado por la anterior (tal
  // como lo haría el servidor real leyendo el batch de nuevo).
  let currentQty = 20;
  const first = reconcileInventoryCount({ previousQty: currentQty, mode: 'CONTEO_FISICO', countedQty: 15 });
  assert.equal(first.soldQty, 5);
  currentQty = first.newQty; // 15

  // El "doble clic" reenvía la misma petición (conteo físico = 15, que ya
  // es el valor actual): la segunda vez el sistema correctamente detecta 0
  // vendidos adicionales, en vez de restar 5 unidades otra vez.
  const second = reconcileInventoryCount({ previousQty: currentQty, mode: 'CONTEO_FISICO', countedQty: 15 });
  assert.equal(second.soldQty, 0, 'La segunda aplicación de la misma cuenta no debe generar una venta adicional.');
  assert.equal(second.newQty, 15);
});

test('Doble asignación FIFO sobre el mismo lote agotado: la segunda venta concurrente no puede "inventar" inventario', () => {
  const batches = [{ batchId: 'b1', availableQty: 8, unitPrice: '10.00', batchDate: '2026-01-01' }];

  // Dos peticiones de venta de 8 unidades cada una, ambas leyendo el mismo
  // estado "disponible: 8" (como si llegaran casi al mismo tiempo, antes de
  // que la primera actualizara la base de datos).
  const firstSale = allocateFifo(batches, 8);
  assert.equal(firstSale.totalAmount, '80.00');

  // El servidor, al procesar la segunda petición, SIEMPRE relee el batch
  // real (que ahora tiene 0 disponibles) en vez de reusar el arreglo
  // `batches` original — así es como se modela aquí: el batch actualizado.
  const batchesAfterFirstSale = [{ batchId: 'b1', availableQty: 0, unitPrice: '10.00', batchDate: '2026-01-01' }];
  assert.throws(() => allocateFifo(batchesAfterFirstSale, 8), InsufficientInventoryError);
});

test('El inventario disponible calculado tras dos ajustes/ventas consecutivos es exactamente aditivo (ninguna operación se pierde ni se cuenta doble)', () => {
  // delivered=50, dos ventas de 10 aplicadas en secuencia (simulando dos
  // registros consecutivos, no simultáneos) deben dejar exactamente 30
  // disponibles — ni 40 (se perdió una) ni 20 (se contó una de más).
  const afterFirstSale = calculateCurrentInventory({ deliveredQty: 50, soldQty: 10, returnedQty: 0, adjustedQty: 0 });
  assert.equal(afterFirstSale, 40);
  const afterSecondSale = calculateCurrentInventory({ deliveredQty: 50, soldQty: 20, returnedQty: 0, adjustedQty: 0 });
  assert.equal(afterSecondSale, 30);
});
