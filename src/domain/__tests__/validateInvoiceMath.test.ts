import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateInvoiceLine, validateInvoiceTotal, validateInvoice } from '../invoices/validateInvoiceMath.ts';

test('Línea válida: quantity x unitPrice == lineTotal', () => {
  const r = validateInvoiceLine({ reference: 'A101', quantity: 10, unitPrice: '20.00', lineTotal: '200.00' });
  assert.equal(r.valid, true);
});

test('Línea inválida (sección 36: IA no identificó bien una columna)', () => {
  const r = validateInvoiceLine({ reference: 'A101', quantity: 10, unitPrice: '20.00', lineTotal: '250.00' });
  assert.equal(r.valid, false);
  assert.equal(r.expectedLineTotal, '200.00');
});

test('Tolerancia de 1 centavo por redondeo legítimo', () => {
  const r = validateInvoiceLine({ reference: 'A101', quantity: 3, unitPrice: '19.995', lineTotal: '59.99' });
  assert.equal(r.valid, true);
});

test('Total de factura válido cuando la suma de líneas cuadra', () => {
  const items = [
    { reference: 'A101', quantity: 10, unitPrice: '20.00', lineTotal: '200.00' },
    { reference: 'A102', quantity: 6, unitPrice: '15.00', lineTotal: '90.00' },
  ];
  const r = validateInvoiceTotal(items, '290.00');
  assert.equal(r.valid, true);
});

test('validateInvoice combina líneas + total y detecta error de columna en una sola línea', () => {
  const items = [
    { reference: 'A101', quantity: 10, unitPrice: '20.00', lineTotal: '200.00' },
    { reference: 'A102', quantity: 6, unitPrice: '15.00', lineTotal: '80.00' }, // debería ser 90.00
  ];
  const r = validateInvoice(items, '290.00');
  assert.equal(r.allValid, false);
  assert.equal(r.lines[1].valid, false);
});
