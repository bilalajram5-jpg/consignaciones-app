# Bitácora de decisiones técnicas

Registro de las decisiones de diseño más importantes, por qué se tomaron, y
qué alternativas se descartaron. El prompt maestro pide explícitamente
explicar brevemente cada decisión técnica relevante (sección 39) — este
archivo es ese registro centralizado.

## 1. El saldo de un cliente nunca es un campo, siempre es una suma

**Decisión**: no existe ningún campo `customer.balance`. El saldo pendiente
SIEMPRE se calcula sumando `account_movements.debit - account_movements.credit`
(`src/domain/accounts/calculateBalance.ts`).

**Por qué**: un campo mutable puede desincronizarse (un pago que actualiza el
saldo pero falla a mitad de camino, un bug que resta dos veces, etc.). Con un
libro de movimientos append-only, el saldo es, por construcción, siempre
correcto — es una consulta, no un estado que se pueda corromper. Es también
literalmente la misma fuente de datos que alimenta el Estado de Cuenta
(sección 11), así que ambas pantallas NUNCA pueden mostrar cifras distintas.

**Alternativa descartada**: mantener un campo `balance` actualizado con cada
transacción (más rápido de leer, pero introduce una segunda fuente de verdad
que puede desincronizarse). Se prefirió correctitud sobre micro-performance;
si en producción la agregación se vuelve lenta con miles de movimientos por
cliente, la solución es un índice (`@@index([customerId, date])`, ya
incluido) o una vista materializada — no volver a un campo mutable.

## 2. Dinero: enteros en centavos en el dominio, `DECIMAL` en la base de datos

**Decisión**: `src/lib/money.ts` opera siempre en centavos (enteros). Postgres
guarda `DECIMAL(14,2)`/`DECIMAL(14,3)`. Nunca se usa `Number`/`float` para
sumar o multiplicar dinero.

**Por qué**: los floats binarios no pueden representar exactamente la mayoría
de los decimales (`0.1 + 0.2 !== 0.3`), lo cual es inaceptable para dinero que
un cliente debe. Enteros son exactos. Se descartó `decimal.js` (una librería
de terceros) porque el objetivo secundario era que la capa de dominio pudiera
ejecutarse sin `npm install` en este sandbox (ver `VERIFICATION_LOG.md`) — un
beneficio inesperado de mantener cero dependencias ahí.

## 3. Inventario: nunca se sobrescribe, siempre se deriva de una fórmula

**Decisión**: `ConsignmentBatch.deliveredQty` es inmutable. `soldQty`,
`returnedQty`, `adjustedQty` son acumuladores que solo se modifican dentro de
la transacción del evento correspondiente (venta, devolución, ajuste). El
inventario disponible siempre es `delivered - sold - returned + adjusted`
(`src/domain/inventory/currentInventory.ts`).

**Por qué**: es la regla #2 del prompt maestro y la única forma de que el
historial completo de un producto (sección 12) se pueda reconstruir en
cualquier momento.

## 4. FIFO por lote, con precio histórico fijo

**Decisión**: cada línea de factura confirmada crea un `ConsignmentBatch` con
su propio `unitPrice`, que nunca cambia. Cuando se vende, `allocateFifo`
(`src/domain/inventory/fifoAllocation.ts`) consume primero el lote más
antiguo con inventario disponible.

**Por qué**: cuando un cliente tiene el mismo producto entregado en varias
facturas a precios distintos, hay que decidir de qué lote sale cada unidad
vendida para facturarla al precio correcto. FIFO es el estándar contable más
predecible y auditable (fácil de explicar: "se vende lo más viejo primero").
Se descartó promediar precios entre lotes porque eso perdería la trazabilidad
exacta que pide la sección 15 ("las ventas correspondientes deben conservar
el precio correcto").

## 5. Concurrencia: transacciones `SERIALIZABLE` con reintento, no locks manuales

**Decisión**: toda operación que lee y luego escribe cantidades de un lote
(confirmar corte, devolución, ajuste) pasa por
`withSerializableTransaction` (`src/lib/db/transaction.ts`), que usa
aislamiento `SERIALIZABLE` de Postgres y reintenta automáticamente ante un
conflicto de serialización (código `P2034`).

**Por qué**: es la forma más segura de evitar "lost updates" (dos vendedores
confirmando cortes del mismo cliente casi al mismo tiempo) sin tener que
escribir `SELECT ... FOR UPDATE` a mano en cada servicio. Postgres garantiza
que el resultado es equivalente a ejecutar las transacciones una tras otra.
Se descartó optimistic locking con columna `version` porque hubiera requerido
tocar todos los modelos del schema y el caso de uso (pocos escritores
concurrentes por cliente) no lo justifica.

## 6. Discrepancias de inventario nunca se resuelven en silencio

**Decisión**: si el conteo físico es MAYOR que el inventario del sistema,
`reconcileInventoryCount` no lanza una venta negativa ni ajusta nada — marca
`hasDiscrepancy: true` y bloquea la confirmación del corte hasta que exista
un `InventoryAdjustment` explícito con motivo.

**Por qué**: es la regla #34.5 ("los ajustes requieren motivo") y evita que
un error de conteo se traduzca silenciosamente en una corrección de
inventario sin rastro de auditoría.

## 7. Cortes de consignación: inmutables, corrección solo vía ajuste

**Decisión**: `ConsignmentCut` nunca se actualiza ni se borra después de
creado. Una corrección se hace con un nuevo `InventoryAdjustment` que
referencia el corte en sus notas — nunca editando el corte original.

**Por qué**: regla #34.13 ("los documentos confirmados no deben editarse
silenciosamente"). Mantiene el historial fiel a lo que realmente ocurrió en
cada visita, incluso si después se descubre un error.

## 8. Autenticación: NextAuth (Auth.js) v4 self-hosted, no un proveedor externo

**Decisión**: `next-auth` v4 con `CredentialsProvider` (email + contraseña
con `bcryptjs`), sesión JWT.

**Por qué**: decisión explícita del usuario en la fase de scoping de este
proyecto — control total de roles sin depender de un servicio de terceros de
pago (Clerk/Auth0/Supabase Auth). v4 (en vez de la v5 beta) se eligió por
estabilidad: es la versión con más tiempo en producción y documentación más
madura para App Router vía Route Handler.

## 9. Almacenamiento de archivos detrás de una interfaz, nunca en `public/`

**Decisión**: `StorageProvider` (`src/lib/storage/`) abstrae dónde viven las
facturas y comprobantes; la implementación por defecto (`local`) escribe
fuera de `public/` y se sirve por una ruta protegida
(`/api/uploads/[...path]`) que exige sesión.

**Por qué**: un archivo en `public/` es accesible por cualquiera con el link,
sin autenticación — inaceptable para facturas y comprobantes de pago. La
interfaz permite cambiar a S3/R2 en producción sin tocar el resto del código
(sección 32: "Sistema compatible con almacenamiento de PDFs, imágenes...").

## 10. Confirmación de facturas: siempre requiere revisión humana

**Decisión**: `uploadAndExtractInvoice` NUNCA crea inventario. Solo crea una
`Invoice` en estado `PENDIENTE_REVISION`. `confirmInvoice` (acción separada,
explícita del usuario) es lo único que crea `ConsignmentBatch`, y revalida
matemáticamente los datos en el servidor sin importar lo que haya mandado el
cliente.

**Por qué**: regla explícita del prompt maestro (sección 3): "Nunca guardar
automáticamente información detectada por IA sin permitir revisión humana." Y
regla #22: los cálculos de dinero se validan también en backend.

## 11. Detección de duplicados: advertencia, nunca bloqueo automático

**Decisión**: `findPossibleDuplicateInvoice` compara cliente + número de
factura (coincidencia exacta) o cliente + total + fecha ±3 días (coincidencia
posible). Si hay match, se muestra la advertencia pero el usuario puede
confirmar explícitamente que es una factura distinta.

**Por qué**: la sección 29 pide mostrar la advertencia, no impedir el
registro — un falso positivo (dos facturas legítimas con el mismo total en
fechas cercanas) no debe bloquear al usuario.
