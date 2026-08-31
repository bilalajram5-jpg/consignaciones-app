import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasPermission, assertPermission, ForbiddenError, isScopedToOwnCustomers } from '../permissions.ts';

test('ADMINISTRADOR tiene acceso completo (sección 20)', () => {
  assert.ok(hasPermission('ADMINISTRADOR', 'users.manage'));
  assert.ok(hasPermission('ADMINISTRADOR', 'inventory.adjust'));
  assert.ok(hasPermission('ADMINISTRADOR', 'audit.view'));
});

test('VENDEDOR puede realizar inventario, registrar pagos, pero NO ver cuentas por cobrar ni auditoría', () => {
  assert.ok(hasPermission('VENDEDOR', 'inventory.count'));
  assert.ok(hasPermission('VENDEDOR', 'payments.create'));
  assert.equal(hasPermission('VENDEDOR', 'receivables.view'), false);
  assert.equal(hasPermission('VENDEDOR', 'audit.view'), false);
  assert.equal(hasPermission('VENDEDOR', 'users.manage'), false);
});

test('CONTABILIDAD puede ver cuentas por cobrar, registrar pagos y exportar, pero NO realizar inventario', () => {
  assert.ok(hasPermission('CONTABILIDAD', 'receivables.view'));
  assert.ok(hasPermission('CONTABILIDAD', 'payments.create'));
  assert.ok(hasPermission('CONTABILIDAD', 'reports.export'));
  assert.equal(hasPermission('CONTABILIDAD', 'inventory.count'), false);
});

test('VISOR solo tiene permisos de lectura', () => {
  assert.ok(hasPermission('VISOR', 'customers.view'));
  assert.ok(hasPermission('VISOR', 'payments.view'));
  assert.equal(hasPermission('VISOR', 'payments.create'), false);
  assert.equal(hasPermission('VISOR', 'invoices.upload'), false);
  assert.equal(hasPermission('VISOR', 'inventory.adjust'), false);
});

test('assertPermission lanza ForbiddenError cuando el rol no tiene el permiso', () => {
  assert.throws(() => assertPermission('VISOR', 'payments.create'), ForbiddenError);
});

test('assertPermission lanza ForbiddenError cuando no hay rol (sin sesión)', () => {
  assert.throws(() => assertPermission(undefined, 'customers.view'), ForbiddenError);
});

test('Solo VENDEDOR está restringido a sus propios clientes', () => {
  assert.equal(isScopedToOwnCustomers('VENDEDOR'), true);
  assert.equal(isScopedToOwnCustomers('ADMINISTRADOR'), false);
  assert.equal(isScopedToOwnCustomers('CONTABILIDAD'), false);
  assert.equal(isScopedToOwnCustomers('VISOR'), false);
});
