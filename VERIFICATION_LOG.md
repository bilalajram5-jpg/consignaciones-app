# Registro de verificación

Este proyecto se construyó dentro de un sandbox cloud cuyo acceso de red está
restringido a `api.anthropic.com` y GitHub — **no hay acceso a `registry.npmjs.org`,
`pypi.org` ni a los repositorios de `apt`** (se confirmó con pruebas directas de
red antes de empezar). Esto significa que **no fue posible ejecutar `npm install`,
`next dev`, `next build`, `npx prisma generate/migrate`, ni abrir la aplicación
en un navegador** dentro de este entorno.

Para no entregar código "a ciegas", se usaron todas las formas de verificación
real que SÍ eran posibles sin `npm`. Este documento lista exactamente qué se
verificó, cómo, y qué queda pendiente de probar la primera vez que el proyecto
se ejecute fuera del sandbox (ver `README.md`).

## 1. Verificado con ejecución real

### 1.1 Motor financiero e inventario (`src/domain/**`)
Node.js 22 soporta ejecutar TypeScript nativamente (`--experimental-strip-types`)
y trae un test runner incorporado (`node --test`) — ninguno de los dos requiere
`npm install`. Se usó esto para escribir **46 pruebas automatizadas reales**
(no simuladas) sobre la capa de dominio (cálculos de dinero, inventario, FIFO,
saldo de cuentas, validación matemática de facturas) y la matriz de permisos
por rol. Comando usado y resultado:

```
$ node --experimental-strip-types --test src/domain/__tests__/*.test.ts src/auth/__tests__/*.test.ts
# tests 46
# pass 46
# fail 0
```

Esto incluye, específicamente:
- El ejemplo completo de la **sección 35** del prompt maestro (factura → visita 1
  → pago → visita 2), verificando que el saldo final da exactamente **$80.00**
  y el inventario final de A da **5 unidades**, tal como especifica el prompt.
- El mensaje de error EXACTO exigido en la sección 6 ("No puedes registrar 7
  unidades vendidas porque solamente existen 5 unidades disponibles.").
- Que Modo A y Modo B del inventario físico producen resultados idénticos.
- FIFO entre lotes de distinto precio, conservando el precio histórico.
- Que `0.1 + 0.2` en `Money` da `0.30` exacto (a diferencia del float nativo).
- **Nuevo (`doubleSubmission.test.ts`, 4 pruebas):** escenarios explícitos de
  "doble registro" a nivel de dominio — doble envío de la misma venta contra
  el mismo inventario original, doble clic en "Confirmar corte" reenviando la
  misma reconciliación, doble asignación FIFO sobre un lote ya agotado por una
  venta anterior, y que aplicar dos operaciones consecutivas es exactamente
  aditivo (ninguna se pierde ni se cuenta doble). Complementan la prueba de
  concurrencia real de la sección 1.3 — esta capa prueba la lógica pura;
  la sección 1.3 prueba el mecanismo de la base de datos del que depende
  cuando dos peticiones sí llegan literalmente al mismo tiempo.

### 1.2 Modelo de base de datos (`prisma/schema.prisma` / `docs/schema.sql`)
Se instaló y arrancó un PostgreSQL 16 real dentro del sandbox (el binario ya
estaba disponible localmente, no requirió red). Se tradujo `schema.prisma` a
SQL DDL puro a mano (`docs/schema.sql`, documentado como tal — NO es la
migración oficial de Prisma) y se aplicó contra esa base real:

```
$ psql -d consignaciones_dev -f docs/schema.sql
# 34 sentencias CREATE TABLE/TYPE/INDEX ejecutadas sin error
```

Esto confirma que todas las foreign keys, tipos, `UNIQUE`, `CHECK` y el orden
de dependencias entre las 19 tablas son válidos contra un motor Postgres real
— no solo "se ve bien".

Además, se escribió `docs/verify_seed.sql`, que reproduce el flujo COMPLETO
del ejemplo de la sección 35 (factura → corte 1 → pago → corte 2) usando SQL
puro dentro de una transacción con `ROLLBACK` al final (no deja datos de
prueba), y verifica con `RAISE EXCEPTION` si el saldo o el inventario
calculado no coinciden con los valores exactos del prompt maestro. Resultado:

```
NOTICE: OK: saldo tras corte 1 = 90.00
NOTICE: OK: saldo tras pago = 40.00
NOTICE: OK: saldo final = 80.00 (coincide con el ejemplo del prompt maestro)
NOTICE: OK: inventario actual de A = 5.000
```

Que la verificación a nivel de SQL puro (`verify_seed.sql`) y la verificación a
nivel de dominio TypeScript (`fullFlow.test.ts`) lleguen exactamente al mismo
resultado, de forma completamente independiente, es la evidencia más fuerte
disponible en este entorno de que el diseño relacional y la lógica de negocio
son consistentes entre sí.

### 1.3 Concurrencia y doble registro — verificado con Postgres real y procesos concurrentes reales

A diferencia de la fase anterior de este proyecto (donde este punto quedaba
como "no se pudo simular sin `npm install`"), en esta revisión SÍ fue posible
construir una prueba real: `scripts/verify_concurrency.sh` lanza dos procesos
`psql` de verdad, en paralelo, contra el Postgres local del sandbox, y
verifica el comportamiento real de Postgres — no una simulación.

```
$ npm run test:concurrency
# (ver docs/concurrency_verification_output.log para la corrida completa)
[PASS] T1 confirmó su transacción normalmente.
[PASS] T2 fue rechazada por Postgres con error de serialización (40001) — exactamente
       el código que withSerializableTransaction reintenta automáticamente.
[PASS] sold_qty quedó en 10 (una sola venta aplicada, no se perdió ni se duplicó).
[PASS] El reintento (igual al que hace withSerializableTransaction) aplicó limpiamente.
[PASS] Ambos pagos concurrentes confirmaron sin conflicto (INSERTs independientes).
[PASS] Los dos pagos existen en la tabla (ninguno se perdió).
[PASS] El saldo derivado del libro de movimientos suma los dos pagos correctamente.
RESULTADO: TODAS LAS VERIFICACIONES DE CONCURRENCIA PASARON
```

Qué prueba cada escenario:
1. **Doble registro de venta/inventario sobre el mismo lote**: dos
   transacciones `SERIALIZABLE` intentan `UPDATE consignment_batches SET
   sold_qty = sold_qty + 10` sobre la MISMA fila. Postgres bloquea la segunda
   hasta que la primera confirma, y al confirmar la primera, rechaza la
   segunda con SQLSTATE `40001` ("could not serialize access due to
   concurrent update") — el código exacto que Prisma mapea a `P2034` y que
   `withSerializableTransaction` (`src/lib/db/transaction.ts`) reintenta
   automáticamente. Se verificó además que reintentar esa misma operación
   (tal como lo hace el wrapper) aplica limpiamente después, sin duplicar ni
   perder la venta.
2. **Doble pago concurrente**: dos `INSERT` simultáneos en `payments` +
   `account_movements` para el mismo cliente se aplican los dos sin
   conflicto (son filas nuevas, no compiten), y el saldo derivado con la
   misma fórmula que `calculateBalance.ts` (`debit - credit`) refleja
   correctamente ambos pagos. Esto confirma en la práctica la decisión de
   diseño #1 de `DECISIONS.md`: con un campo `customers.balance` mutable,
   dos `UPDATE balance = balance - monto` concurrentes bajo el nivel de
   aislamiento por defecto sí arriesgarían perder una actualización; con el
   libro de movimientos append-only no hay nada que perder.

**Limitación que sigue vigente** (documentada también en el script): esto
prueba el mecanismo de Postgres del que depende `withSerializableTransaction`,
ejecutando SQL directamente y en paralelo. No reemplaza una prueba de extremo
a extremo con dos clientes Prisma/Next.js reales golpeando los Server Actions
al mismo tiempo, porque este sandbox no tiene acceso a `npm install` para
levantar el servidor Next.js real. Esa prueba de extremo a extremo (ver más
abajo, "qué queda pendiente de probar fuera del sandbox") es la que debe
correrse antes de confiar el sistema a producción con múltiples vendedores
trabajando al mismo tiempo — aunque, dado que usa exactamente el mismo motor
y el mismo código de error que aquí se demostró funcionando, el riesgo de que
se comporte distinto es bajo.

El script es reutilizable fuera de este sandbox: corre
`DATABASE_URL="postgresql://..." ./scripts/verify_concurrency.sh` contra
cualquier Postgres (local, Docker, Neon, Supabase, RDS) con el schema ya
migrado, y limpia sus propios datos de prueba al terminar (cliente/producto/
factura/lote/pagos con prefijo `TEST-CONC-`/`SKU-CONC-`, borrados en un
`trap cleanup EXIT`, incluso si alguna aserción falla).

## 2. Verificado con análisis estático automatizado (sin ejecutar)

Sin `tsc` disponible, se construyeron verificaciones estáticas específicas
(scripts de una sola vez, no parte del proyecto) para detectar las clases de
error más comunes que rompen un build de Next.js/TypeScript:

| Verificación | Alcance | Resultado |
|---|---|---|
| Sintaxis válida (`node --check` con type-stripping) | 74 archivos `.ts` (todo el backend: servicios, dominio, auth, acciones, IA, generadores de PDF) | 0 errores |
| Balance de llaves/paréntesis/corchetes (heurística) | 41 archivos `.tsx` (todos los componentes/páginas) | 0 problemas |
| Todo import `@/...` resuelve a un archivo existente | 115 archivos | 0 problemas |
| Todo import relativo (`./`, `../`) resuelve a un archivo existente | 115 archivos | 0 problemas |
| Todo nombre importado (`import { X }`) existe como export en el archivo destino | 324 declaraciones `import` revisadas | 0 problemas reales (algunos falsos positivos del script por `import { type X }` en línea, verificados a mano) |
| Todo `prisma.modelo.` / `tx.modelo.` usado en servicios/rutas corresponde a un modelo real de `schema.prisma` | todos los servicios y route handlers | 0 problemas |

Esta tabla se volvió a correr completa sobre los ~115 archivos del proyecto
(no solo los tocados en esta revisión) para confirmar que ningún cambio
reciente rompió algo en otra parte del código.

Estas verificaciones NO reemplazan a `tsc --noEmit` (no revisan tipos, solo
existencia/sintaxis), pero eliminan la clase de error más común y más
silenciosa: rutas de importación equivocadas o nombres mal escritos, que en un
proyecto de este tamaño (≈100 archivos) son el error más probable.

## 3. Revisado únicamente por lectura (no se pudo ejecutar ni verificar estáticamente)

Estos puntos se escribieron con cuidado contra la documentación pública de
cada API/librería, pero **deben probarse explícitamente la primera vez que el
proyecto corra fuera del sandbox**:

- **Integración con la API de Claude** (`src/ai/invoiceExtraction.ts`): la
  forma exacta del bloque `document`/`image` en el SDK `@anthropic-ai/sdk`
  puede requerir ajustes menores según la versión instalada. Probar con una
  factura real (PDF e imagen) y revisar que el JSON devuelto siga el esquema
  esperado.
- **NextAuth v4 con App Router** (`src/auth/auth.config.ts`,
  `src/middleware.ts`, `src/app/api/auth/[...nextauth]/route.ts`): el flujo de
  login, la protección de rutas por middleware, y el refresco de rol en cada
  request deben probarse manualmente.
- **Generación de PDF** (los 5 generadores en `src/reports/pdf/`: Corte de
  Consignación, Estado de Cuenta, Recibo de Pago, Historial del Cliente,
  Inventario Actual) y **Excel** (`src/reports/excel/exportToExcel.ts`): la
  lógica de posicionamiento/columnas/paginación se escribió y se revisó
  contra la API de `pdf-lib`/`exceljs`, y todos comparten ahora el mismo
  helper de layout con paginación (`src/reports/pdf/pdfHelpers.ts`), pero
  nunca se generó un archivo real en este sandbox (no hay forma de abrir un
  visor de PDF aquí) — abrir cada PDF/XLSX resultante la primera vez que
  corra fuera del sandbox y ajustar el layout si hace falta.
- **Escaneo de código de barras/QR con cámara** (`BarcodeScannerDialog.tsx`,
  sección 19): el componente se conectó al flujo de "Realizar inventario"
  (botón "Escanear código", integrado con `productByCode` para saltar al
  producto correcto) usando la API pública documentada de `html5-qrcode`
  (`Html5Qrcode.start`/`stop`), pero la librería nunca se pudo instalar ni
  probar contra una cámara real en este sandbox. Probar en un celular real
  (permisos de cámara, cámara trasera, lectura de códigos reales de
  producto) antes de confiar en este atajo — el conteo manual sigue
  funcionando igual si el escaneo falla.
- **`pdf-parse`** para extracción nativa de texto de PDF
  (`src/ocr/pdfTextExtraction.ts`): no se pudo instalar ni probar.
- **Componentes de UI con Radix** (`src/components/ui/*`): siguen el patrón
  estándar de shadcn/ui al pie de la letra, pero nunca se renderizaron en un
  navegador real dentro de este entorno.
- **Prueba de concurrencia de extremo a extremo con Prisma/Next.js real**
  (dos Server Actions reales golpeados al mismo tiempo, en vez de SQL directo
  como en la sección 1.3): sigue pendiente porque requiere `npm install` para
  levantar el servidor. El mecanismo subyacente (Postgres `SERIALIZABLE`) SÍ
  se verificó de verdad — ver sección 1.3.

## 4. Revisión final de esta iteración: botones, pantallas y flujos completados

Como parte de esta revisión se auditó cada botón/pantalla visible en busca de
placeholders, mocks o callejones sin salida, y se corrigieron los siguientes
problemas reales encontrados (no eran features nuevas, eran piezas del propio
prompt maestro que quedaban incompletas):

- **Escaneo de código de barras/QR**: integrado end-to-end en "Realizar
  inventario" (antes solo existía el modelo de datos y la dependencia).
- **4 PDFs faltantes construidos y conectados a la UI**: Estado de Cuenta,
  Recibo de Pago, Historial del Cliente e Inventario Actual, con enlaces
  "Descargar PDF"/"Ver recibo" en las pestañas correspondientes de la ficha
  del cliente y en la lista global de Pagos. El PDF de Corte de Consignación
  (ya existente) se corrigió para paginar en vez de truncar cortes largos.
- **Búsqueda global (`/buscar`) no mostraba resultados de Facturas ni
  Cortes**: `globalSearch()` ya los devolvía, pero la página nunca los
  renderizaba (sí funcionaba correctamente en el buscador del header). Corregido.
- **Una factura en revisión (`PENDIENTE_REVISION`) era un callejón sin
  salida** si el usuario salía del asistente de carga antes de confirmar: su
  pantalla de detalle era de solo lectura, sin ninguna acción posible, y el
  estado `RECHAZADA` del modelo de datos nunca era alcanzable desde ningún
  botón. Se agregó la posibilidad de retomar la revisión (reabre el mismo
  asistente con los datos ya guardados) y de rechazar explícitamente la
  factura con motivo obligatorio (`rejectInvoiceAction`, nuevo).
- **Navegación inferior móvil usaba `<a href>` planas**: cada tap recargaba
  la página completa (más lento y más costoso en datos, justo en el
  dispositivo/red donde menos conviene) y nunca resaltaba la sección activa.
  Se extrajo a `MobileBottomNav.tsx` usando `next/link` + `usePathname`,
  igual que ya hacía la barra lateral de escritorio.
- **`InventoryCountWizard` (Realizar inventario, revisión especial pedida)**:
  se agregó una guarda contra respuestas del servidor que llegan
  desordenadas (varios taps rápidos en los botones [-]/[+], que ahora
  guardan de inmediato), y manejo explícito de pérdida de conexión en los
  tres puntos de red de la pantalla (guardar conteo, ver resumen, confirmar
  corte) — antes un fallo de red ahí dejaba la pantalla trabada sin
  indicación de qué pasó, particularmente riesgoso en la confirmación del
  corte, donde ahora se le pide explícitamente al usuario verificar en la
  ficha del cliente antes de reintentar (para no arriesgar un doble corte).
- **4 pruebas de dominio nuevas** (`doubleSubmission.test.ts`) y el script
  `scripts/verify_concurrency.sh` (sección 1.3) — ver detalle arriba.

## 5. Qué falta por construir (ver README.md → "Estado del proyecto")

Con esta revisión, todas las funciones descritas en el prompt maestro tienen
lógica de negocio, servicios y UI conectados de punta a punta (sin
placeholders ni botones sin función). Lo que queda son puntos que, por
naturaleza, solo se pueden confirmar ejecutando el proyecto fuera de este
sandbox — ver README.md → "Estado del proyecto" y las secciones 1.3 y 3 de
este documento para el detalle exacto de cada uno.
