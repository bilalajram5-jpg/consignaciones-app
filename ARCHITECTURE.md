# Arquitectura — Sistema de Gestión de Consignaciones

## 1. Resumen

Aplicación web para administrar el ciclo completo de consignaciones:

```
FACTURA → PRODUCTOS ENTREGADOS → INVENTARIO DEL CLIENTE → PRODUCTOS VENDIDOS
        → MONTO ADEUDADO → PAGOS → SALDO PENDIENTE
```

Prioridad absoluta del sistema: **integridad de inventario y cuentas por cobrar**.
Ningún dato histórico se sobrescribe ni se elimina; todo cambio relevante queda
auditado. Ver `DECISIONS.md` para el razonamiento detrás de cada decisión técnica
y `VERIFICATION_LOG.md` para saber exactamente qué se pudo ejecutar/probar en este
entorno y qué queda pendiente de verificar fuera de él.

## 2. Stack tecnológico

| Capa | Tecnología | Motivo |
|---|---|---|
| Frontend | Next.js 14 (App Router) + React 18 + TypeScript | SSR/RSC, rutas protegidas server-side, un solo framework full-stack |
| Estilos/UI | Tailwind CSS + shadcn/ui (Radix primitives) | Rápido, accesible, consistente, mobile-first |
| Backend | Next.js Route Handlers + Server Actions | Evita mantener un backend separado; validación siempre server-side |
| Base de datos | PostgreSQL 16 | Transacciones ACID, tipos NUMERIC exactos, robustez para datos financieros |
| ORM | Prisma 5 | Tipado end-to-end, migraciones versionadas, `Decimal` nativo para dinero |
| Autenticación | NextAuth.js (Auth.js) v4, proveedor Credentials | Self-hosted, control total de roles, sin dependencias externas de pago |
| IA / OCR de facturas | Anthropic Claude API (modelo multimodal, `messages.create` con `document`/`image`) | Lee PDF nativamente (sin OCR intermedio) e imágenes; devuelve JSON estructurado |
| Validación | Zod (server-side, siempre) | Nunca confiar solo en el frontend |
| Dinero | Enteros en centavos (`src/lib/money.ts`) en la capa de dominio + `DECIMAL(14,2)` en Postgres | Cero errores de coma flotante, cero dependencias externas para la capa más crítica |
| Storage de archivos | Abstracción `StorageProvider`: `local` (dev) / `s3` (producción) | Facturas, comprobantes de pago; nunca en `public/` |
| PDF | `pdf-lib` / `@react-pdf/renderer` | Cortes, estados de cuenta, recibos |
| Excel/CSV | `exceljs` | Exportaciones |
| Códigos de barras/QR | `html5-qrcode` (cliente, cámara del dispositivo) | Escaneo durante inventario físico |

## 3. Principio arquitectónico central: dominio puro y aislado

La lógica financiera e inventarial vive en `src/domain/**`, **sin ninguna
dependencia de Next.js, Prisma, ni de ningún paquete externo**. Son funciones
puras (input → output, sin efectos secundarios) que:

1. Son las únicas responsables de calcular ventas, inventario, saldos y
   asignación FIFO — nunca se duplica esta lógica en la UI ni en un componente.
2. Se pueden ejecutar y probar con `node --experimental-strip-types --test`,
   **sin `npm install`**, lo cual permitió verificarlas realmente dentro de
   este sandbox restringido de red (ver `VERIFICATION_LOG.md`).
3. Son consumidas por `src/services/**` (que sí habla con Prisma/DB) y por
   los Server Actions/Route Handlers, que se encargan de I/O, permisos y
   auditoría.

Esta separación es la garantía principal de que "los cálculos de dinero se
validan también en backend" (regla del prompt maestro): el backend nunca
confía en un total calculado por el cliente; siempre recalcula con las mismas
funciones de dominio.

## 4. Estructura de carpetas

```
consignaciones-app/
├── prisma/
│   └── schema.prisma            # Modelo de datos completo (fuente de verdad)
├── docs/
│   ├── schema.sql                # DDL equivalente, aplicado y validado contra Postgres real
│   └── erd.md                    # Diagrama entidad-relación (texto)
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── (auth)/login/
│   │   └── (dashboard)/           # Rutas protegidas (requieren sesión)
│   │       ├── clientes/
│   │       ├── facturas/
│   │       ├── productos/
│   │       ├── cuentas-por-cobrar/
│   │       ├── pagos/
│   │       ├── reportes/
│   │       ├── auditoria/
│   │       └── buscar/
│   │   └── api/                   # Route Handlers (uploads, NextAuth, endpoints REST puntuales)
│   ├── components/                # UI, organizada por dominio + `ui/` (primitivas shadcn)
│   ├── domain/                    # Lógica pura: inventario, ventas, cuentas, FIFO (sin deps)
│   │   └── __tests__/             # Pruebas ejecutables con `node --test`
│   ├── services/                  # Capa de acceso a datos (Prisma) + orquestación + auditoría
│   ├── ai/                        # Integración con Claude API para lectura de facturas
│   ├── ocr/                       # Extracción de texto nativo de PDF (fallback/soporte a la IA)
│   ├── auth/                      # Configuración NextAuth + control de permisos por rol
│   ├── lib/                       # Prisma client, money.ts, storage, utilidades
│   │   ├── storage/                # StorageProvider (local/S3)
│   │   └── validators/             # Esquemas Zod compartidos frontend/backend
│   ├── types/                     # Tipos compartidos
│   └── reports/                   # Generación de PDF/Excel
└── storage/                        # Almacenamiento local de dev (fuera de `public/`)
```

## 5. Flujo de datos de una consignación (referencia rápida)

1. **Factura → IA/OCR** (`src/ai/invoiceExtraction.ts`): PDF/imagen → Claude API
   → JSON estructurado con `confidence` por campo → **pantalla de revisión
   humana obligatoria** (nunca se guarda automáticamente).
2. **Confirmación de factura** (`src/services/invoiceService.ts`): crea
   `Invoice` + `InvoiceItem[]` + un `ConsignmentBatch` por ítem (ver §7 de
   `DECISIONS.md` sobre lotes y FIFO). Detecta duplicados antes de guardar.
3. **Inventario en consignación**: se deriva siempre de la suma de
   movimientos (`ConsignmentBatch.deliveredQty` − ventas − devoluciones ±
   ajustes), nunca de un campo mutable "inventario actual" editado a mano.
4. **Realizar inventario** (visita): Modo A (conteo físico) y Modo B
   (cantidad vendida) pasan por la **misma** función de dominio
   `reconcileInventoryCount`, garantizando resultados idénticos.
5. **Corte de consignación**: snapshot inmutable de la visita. Genera cargos
   en `AccountMovement` (nunca modifica cortes anteriores).
6. **Pago**: crea un `Payment` + `AccountMovement` de crédito. El saldo
   pendiente de un cliente **siempre** se calcula sumando `AccountMovement`,
   nunca se guarda como campo editable.
7. **Auditoría**: todo servicio que modifica datos financieros o de
   inventario escribe una fila en `AuditLog` con usuario, acción, valor
   anterior y valor nuevo (`src/services/auditService.ts`).

## 6. Seguridad

- Autenticación obligatoria (NextAuth, sesiones JWT firmadas).
- Autorización por rol verificada en cada Server Action/Route Handler
  (`src/auth/permissions.ts`), nunca solo ocultando botones en el frontend.
- Toda validación de negocio (stock disponible, cuadre matemático de
  facturas, permisos) se repite en el servidor aunque ya exista en el
  cliente.
- Dinero: `DECIMAL(14,2)` en Postgres, enteros en centavos en dominio, nunca
  `Number`/`float` para sumas de dinero.
- Archivos subidos (facturas, comprobantes) fuera de `public/`, servidos por
  una ruta protegida que verifica sesión y pertenencia.
- Prevención de duplicados: factura duplicada (cliente + número + fecha +
  total) se marca como advertencia, no bloquea pero exige confirmación
  explícita adicional.

## 7. Roles

| Rol | Permisos |
|---|---|
| ADMINISTRADOR | Acceso completo |
| VENDEDOR | Ver sus clientes asignados, realizar inventarios, registrar ventas (vía cortes), registrar pagos |
| CONTABILIDAD | Ver cuentas por cobrar, registrar pagos, ver estados de cuenta, exportar reportes |
| VISOR | Solo lectura en todos los módulos |

Implementado como matriz `ROLE_PERMISSIONS` en `src/auth/permissions.ts`,
consultada tanto por la UI (para ocultar/mostrar) como —de forma obligatoria—
por cada Server Action/Route Handler antes de ejecutar la operación.

## 8. Qué se pudo verificar dentro de este sandbox

Ver `VERIFICATION_LOG.md` para el detalle completo. Resumen: la capa de
dominio (matemática financiera e inventario) se ejecutó y probó con datos
reales usando el test runner nativo de Node; el `schema.sql` se aplicó contra
un Postgres 16 real corriendo en este entorno. El resto del código (rutas
Next.js, componentes React, integración con Prisma Client, NextAuth, Claude
API) se escribió y se revisó estáticamente, pero **no se pudo compilar ni
ejecutar** porque este sandbox bloquea el registro de npm — ver
`README.md → "Primera ejecución fuera del sandbox"` para los pasos exactos.
