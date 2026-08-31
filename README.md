# Sistema de Gestión de Consignaciones

Aplicación para administrar el ciclo completo de consignaciones: factura →
inventario del cliente → productos vendidos → monto adeudado → pagos → saldo
pendiente, con lectura automática de facturas por IA, control de inventario
por lotes (FIFO), auditoría completa y cuentas por cobrar.

Ver `ARCHITECTURE.md` (arquitectura y decisiones técnicas), `DECISIONS.md`
(bitácora de decisiones), y `VERIFICATION_LOG.md` (qué se pudo verificar
realmente durante el desarrollo y qué falta probar).

## Estado del proyecto

Construido dentro de un entorno sin acceso a `npm`/`pip`/`apt` (ver
`VERIFICATION_LOG.md`), por lo que todo el código se escribió y se verificó
estáticamente, pero **nunca se instaló ni se ejecutó como aplicación Next.js
real**. La capa de lógica financiera e inventario sí se probó de verdad (46
pruebas automatizadas), y el mecanismo de concurrencia (`SERIALIZABLE` +
reintento) se verificó con Postgres real y procesos `psql` concurrentes reales
(`npm run test:concurrency`, ver `VERIFICATION_LOG.md` sección 1.3). Antes de
usarlo en producción, sigue los pasos de la sección "Primera ejecución" y
revisa la sección 3 de `VERIFICATION_LOG.md`.

Completo (backend + UI funcional, sin placeholders ni botones sin función —
auditado explícitamente en esta revisión):
- Arquitectura, modelo de datos, autenticación y roles.
- Clientes y productos (CRUD).
- Carga de facturas con IA (Claude API) + pantalla de revisión humana
  obligatoria, con posibilidad de retomar la revisión de una factura
  pendiente más tarde y de rechazarla explícitamente con motivo.
- Inventario en consignación por lotes con FIFO.
- Realizar inventario (Modo A/B, discrepancias, ajustes, resumen, confirmar
  corte) — mobile-first, con escaneo de código de barras/QR por cámara,
  guardado inmediato en cada tap, y manejo explícito de pérdida de conexión.
- Cortes de consignación (PDF descargable, con paginación para cortes largos).
- Cuentas por cobrar y estado de cuenta (con PDF descargable).
- Registro de pagos y devoluciones (con recibo de pago en PDF).
- Historial del cliente e inventario actual (con PDF descargable de cada uno).
- Auditoría (registro de actividad).
- Búsqueda global (página `/buscar` y buscador rápido del header).
- Reportes exportables (Excel/CSV).
- Gestión de usuarios y roles.

Ver `VERIFICATION_LOG.md` sección 4 para el detalle de los problemas
encontrados y corregidos en la auditoría final (búsqueda global incompleta,
factura en revisión sin salida, navegación móvil sin `next/link`, etc.).

## Requisitos

- Node.js ≥ 20.9
- PostgreSQL ≥ 14 (local, Docker, o un proveedor como Neon/Supabase/Railway)
- Una API key de Anthropic (Claude) para la lectura automática de facturas —
  [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)

## Primera ejecución (fuera del sandbox)

Sigue estos pasos EN ORDEN. Cada uno depende del anterior.

### 1. Instalar dependencias

```bash
npm install
```

Esto es lo primero que hay que correr — nunca se ejecutó en el entorno de
desarrollo de este proyecto, así que es normal que aparezcan advertencias
menores o que alguna versión necesite un pequeño ajuste. Si algo falla,
revisa la versión exacta del paquete en `package.json` antes de cambiarla.

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env` y completa como mínimo:
- `DATABASE_URL`: tu cadena de conexión a Postgres.
- `NEXTAUTH_SECRET`: genera uno con `openssl rand -base64 32`.
- `ANTHROPIC_API_KEY`: tu clave de la API de Anthropic (sin esto, "Subir
  factura" fallará con un error explícito — no hay datos simulados).
- `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`: credenciales del primer usuario administrador.

### 3. Crear la base de datos y aplicar el modelo

```bash
npx prisma generate
npx prisma migrate dev --name init
```

`prisma migrate dev` crea las tablas a partir de `prisma/schema.prisma`
(fuente de verdad). El archivo `docs/schema.sql` que acompaña el proyecto es
solo una traducción manual usada para verificar el modelo dentro del sandbox
de desarrollo — **no lo ejecutes manualmente**, dejaría la base sin las
tablas de control de migraciones de Prisma.

### 4. Crear el primer usuario administrador

```bash
npm run db:seed
```

Sin este paso no hay forma de iniciar sesión la primera vez.

### 5. Levantar la aplicación

```bash
npm run dev
```

Abre `http://localhost:3000`, inicia sesión con `SEED_ADMIN_EMAIL` /
`SEED_ADMIN_PASSWORD`, y desde **Usuarios** crea las cuentas de tu equipo
(Vendedor, Contabilidad, Visor).

### 6. Antes de dar por buena cualquier función

Este proyecto se escribió sin poder ejecutarlo ni una sola vez de punta a
punta. Antes de confiar en producción, verifica manualmente al menos el
flujo completo de la sección 40 del prompt original:

1. Crear un cliente.
2. Subir una factura real (PDF o foto) y confirmar que la IA la lee razonablemente bien.
3. Revisar/corregir los datos y confirmar la importación.
4. Verificar que el inventario del cliente aparece correcto.
5. Ir a "Realizar inventario" **desde un celular real**: probar el escaneo de
   código de barras/QR, contar productos, generar y resolver una discrepancia
   a propósito, y confirmar el corte.
6. Verificar que el monto aparece en "Cuentas por cobrar".
7. Registrar un pago y verificar que el saldo baja.
8. Descargar y abrir los 5 PDFs (Corte, Estado de Cuenta, Recibo de Pago,
   Historial del Cliente, Inventario Actual) y revisar que el formato se vea
   bien — nunca se generó un archivo real dentro del sandbox.
9. Subir una factura, salir del asistente ANTES de confirmarla, y volver a
   entrar desde la pestaña "Facturas" del cliente: debe retomar la misma
   pantalla de revisión (no quedar en un callejón sin salida). Probar también
   el botón "Rechazar factura".
10. Con dos usuarios/pestañas, intentar confirmar dos cortes del mismo
    cliente casi al mismo tiempo (o correr `npm run test:concurrency`, que
    prueba el mecanismo subyacente contra Postgres real) — ver
    `VERIFICATION_LOG.md` sección 1.3 para lo que ya se verificó y lo que
    falta probar de extremo a extremo.

## Pruebas

La capa de dominio (motor financiero e inventario) tiene pruebas reales que
NO requieren base de datos ni `npm install` — corren con el Node.js del
sistema:

```bash
npm run test:domain
# o directamente:
node --experimental-strip-types --test src/domain/__tests__/*.test.ts src/auth/__tests__/*.test.ts
```

Deberían pasar las 46 pruebas (ver `VERIFICATION_LOG.md` para el detalle de
qué cubre cada una).

Además, `npm run test:concurrency` corre una prueba real de concurrencia
contra Postgres (dos procesos `psql` simultáneos demostrando que Postgres
rechaza el "doble registro" de una venta sobre el mismo lote, y que dos pagos
concurrentes se registran ambos correctamente). Requiere una base de datos
accesible — usa `DATABASE_URL` si está definida, o el fallback del sandbox de
desarrollo si no. Ver `scripts/verify_concurrency.sh` y `VERIFICATION_LOG.md`
sección 1.3 para el detalle completo.

## Scripts disponibles

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run start` | Sirve el build de producción |
| `npm run typecheck` | `tsc --noEmit` (nunca se corrió en el sandbox — probablemente revele detalles menores a ajustar) |
| `npm run test:domain` | Pruebas del motor financiero/inventario (sin DB) |
| `npm run test:concurrency` | Prueba real de concurrencia/doble registro contra Postgres (`scripts/verify_concurrency.sh`) |
| `npm run prisma:studio` | Explorador visual de la base de datos |
| `npm run db:seed` | Crea el primer usuario administrador |

## Estructura del proyecto

Ver `ARCHITECTURE.md` sección 4 para el árbol de carpetas completo y el
razonamiento de cada capa (dominio puro vs. servicios vs. UI).

## Despliegue en producción — recomendaciones

- **Hosting de la app**: Vercel (ideal para Next.js) o cualquier plataforma
  Node.js. Configura las mismas variables de `.env.example`.
- **Base de datos**: Neon, Supabase o RDS — cualquier Postgres administrado.
  Recuerda correr `npx prisma migrate deploy` (no `migrate dev`) en producción.
- **Almacenamiento de archivos**: cambia `STORAGE_PROVIDER=s3` y configura un
  bucket (S3, R2, Supabase Storage). Instala además
  `@aws-sdk/client-s3` y `@aws-sdk/s3-request-presigner`
  (`npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`) — se
  dejaron fuera de las dependencias por defecto porque el proveedor local
  basta para desarrollo.
- **Backups**: configura backups automáticos de Postgres — este sistema es la
  fuente de verdad del inventario y las cuentas por cobrar del negocio.
