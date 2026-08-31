import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateBalance, calculateRunningBalance, calculateNewTotalOwed } from '../accounts/calculateBalance.ts';

test('Sección 35: recorre el ejemplo completo del prompt maestro y llega a $80', () => {
  const movements = [
    { type: 'CARGO_VENTA' as const, debit: '90.00', credit: '0.00' }, // Corte #1
    { type: 'PAGO' as const, debit: '0.00', credit: '50.00' }, // Pago
    { type: 'CARGO_VENTA' as const, debit: '40.00', credit: '0.00' }, // Corte #2
  ];
  assert.equal(calculateBalance(movements), '80.00');
});

test('Sección 9: ejemplo de saldo anterior + corte - pago', () => {
  const movements = [
    { type: 'CARGO_VENTA' as const, debit: '150.00', credit: '0.00' }, // saldo anterior
    { type: 'CARGO_VENTA' as const, debit: '90.00', credit: '0.00' }, // nuevo corte
    { type: 'PAGO' as const, debit: '0.00', credit: '100.00' },
  ];
  assert.equal(calculateBalance(movements), '140.00');
});

test('Notas de crédito reducen el saldo igual que un pago', () => {
  const movements = [
    { type: 'CARGO_VENTA' as const, debit: '100.00', credit: '0.00' },
    { type: 'NOTA_CREDITO' as const, debit: '0.00', credit: '20.00' },
  ];
  assert.equal(calculateBalance(movements), '80.00');
});

test('calculateRunningBalance produce saldo corrido correcto (estilo estado de cuenta)', () => {
  const movements = [
    { type: 'CARGO_VENTA' as const, debit: '200.00', credit: '0.00' },
    { type: 'PAGO' as const, debit: '0.00', credit: '100.00' },
    { type: 'CARGO_VENTA' as const, debit: '150.00', credit: '0.00' },
    { type: 'PAGO' as const, debit: '0.00', credit: '200.00' },
  ];
  const running = calculateRunningBalance(movements);
  assert.deepEqual(
    running.map((r) => r.balance),
    ['200.00', '100.00', '250.00', '50.00']
  );
});

test('calculateNewTotalOwed: saldo anterior + nuevo cargo', () => {
  assert.equal(calculateNewTotalOwed('150.00', '90.00'), '240.00');
});

test('Pago adelantado produce saldo negativo (a favor del cliente), no un error', () => {
  const movements = [{ type: 'PAGO' as const, debit: '0.00', credit: '100.00' }];
  assert.equal(calculateBalance(movements), '-100.00');
});
