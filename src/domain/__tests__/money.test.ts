import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Money } from '../../lib/money.ts';

test('Money.fromDecimal parsea strings decimales exactamente', () => {
  assert.equal(Money.fromDecimal('20.50').toDecimalString(), '20.50');
  assert.equal(Money.fromDecimal('0.01').toCents(), 1);
  assert.equal(Money.fromDecimal('-15.75').toDecimalString(), '-15.75');
  assert.equal(Money.fromDecimal('100').toDecimalString(), '100.00');
});

test('Money evita el clásico error de coma flotante 0.1 + 0.2', () => {
  const a = Money.fromDecimal('0.10');
  const b = Money.fromDecimal('0.20');
  assert.equal(a.add(b).toDecimalString(), '0.30');
  // A modo de contraste, el float nativo SÍ falla:
  assert.notEqual(0.1 + 0.2, 0.3);
});

test('Money.multiplyByQuantity redondea correctamente al centavo', () => {
  const price = Money.fromDecimal('19.99');
  assert.equal(price.multiplyByQuantity(3).toDecimalString(), '59.97');
});

test('Money.subtract y comparaciones', () => {
  const a = Money.fromDecimal('90.00');
  const b = Money.fromDecimal('50.00');
  const diff = a.subtract(b);
  assert.equal(diff.toDecimalString(), '40.00');
  assert.ok(a.greaterThan(b));
  assert.ok(b.lessThan(a));
});

test('Money.sum suma una lista de montos', () => {
  const values = [Money.fromDecimal('60.00'), Money.fromDecimal('30.00')];
  assert.equal(Money.sum(values).toDecimalString(), '90.00');
});
