/**
 * Matriz de permisos por rol (sección 20 del prompt maestro). Se usa en DOS
 * lugares:
 *
 *  1. En la UI (`src/components/**`) para ocultar/mostrar botones y enlaces.
 *  2. OBLIGATORIAMENTE en cada Server Action / Route Handler
 *     (`src/services/**`, `src/app/api/**`), llamando a `assertPermission`
 *     ANTES de ejecutar cualquier operación. La UI nunca es la única línea
 *     de defensa (sección 22: "Nunca confiar únicamente en validaciones del
 *     frontend").
 */

export type Role = 'ADMINISTRADOR' | 'VENDEDOR' | 'CONTABILIDAD' | 'VISOR';

export type Permission =
  | 'customers.view'
  | 'customers.viewAll' // ver todos los clientes, no solo los propios (VENDEDOR ve solo los suyos)
  | 'customers.create'
  | 'customers.edit'
  | 'products.view'
  | 'products.create'
  | 'products.edit'
  | 'invoices.upload'
  | 'invoices.confirm'
  | 'inventory.count' // realizar inventario / registrar ventas
  | 'inventory.adjust'
  | 'returns.create'
  | 'receivables.view'
  | 'payments.create'
  | 'payments.view'
  | 'reports.export'
  | 'audit.view'
  | 'users.manage';

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMINISTRADOR: [
    'customers.view',
    'customers.viewAll',
    'customers.create',
    'customers.edit',
    'products.view',
    'products.create',
    'products.edit',
    'invoices.upload',
    'invoices.confirm',
    'inventory.count',
    'inventory.adjust',
    'returns.create',
    'receivables.view',
    'payments.create',
    'payments.view',
    'reports.export',
    'audit.view',
    'users.manage',
  ],
  VENDEDOR: [
    'customers.view', // solo sus clientes asignados, filtrado a nivel de query (ver services/customerService.ts)
    'products.view',
    'invoices.upload',
    'inventory.count',
    // El VENDEDOR SÍ puede crear ajustes: es quien está físicamente frente
    // a la discrepancia durante la visita (sección 6/7) y no siempre es
    // razonable esperar a que un ADMINISTRADOR lo haga por él. El ajuste de
    // todas formas queda auditado con su usuario, motivo y fecha (sección
    // 34, regla #5), así que el control real no es "quién puede" sino que
    // "nunca se hace sin motivo ni sin dejar rastro".
    'inventory.adjust',
    'returns.create',
    'payments.create',
    'payments.view',
  ],
  CONTABILIDAD: [
    'customers.view',
    'customers.viewAll',
    'products.view',
    'receivables.view',
    'payments.create',
    'payments.view',
    'reports.export',
  ],
  VISOR: [
    'customers.view',
    'customers.viewAll',
    'products.view',
    'receivables.view',
    'payments.view',
    'reports.export',
  ],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export class ForbiddenError extends Error {
  constructor(permission: Permission) {
    super(`No tienes permiso para: ${permission}`);
    this.name = 'ForbiddenError';
  }
}

/** Lanza ForbiddenError si el rol no tiene el permiso. Usar en TODO Server Action/Route Handler. */
export function assertPermission(role: Role | undefined | null, permission: Permission): void {
  if (!role || !hasPermission(role, permission)) {
    throw new ForbiddenError(permission);
  }
}

/** true si el VENDEDOR debe restringirse a solo sus clientes asignados (vendorId). */
export function isScopedToOwnCustomers(role: Role): boolean {
  return role === 'VENDEDOR';
}
