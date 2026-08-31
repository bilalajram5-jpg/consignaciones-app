#!/usr/bin/env bash
# ============================================================================
# Verificación de concurrencia (sección "pruebas para concurrencia y doble
# registro de inventario/pagos" del prompt maestro).
#
# QUÉ HACE: usa dos procesos `psql` REALES y concurrentes contra una
# instancia de Postgres para demostrar, con una corrida real (no una
# simulación ni un mock), que:
#
#   1. Dos "ventas"/conteos concurrentes sobre el MISMO lote de consignación
#      (consignment_batches.sold_qty) NUNCA pueden aplicarse las dos sin que
#      Postgres detecte el conflicto — exactamente el mecanismo del que
#      depende `withSerializableTransaction` (src/lib/db/transaction.ts) y
#      su reintento automático ante el código P2034 de Prisma (que mapea el
#      SQLSTATE 40001 de Postgres, "could not serialize access due to
#      concurrent update"). Esto es lo que impide el doble registro de
#      inventario/ventas descrito en la sección 34, reglas de concurrencia.
#
#   2. Dos pagos concurrentes de un mismo cliente SIEMPRE se registran los
#      dos (no se pisan entre sí, porque cada uno es un INSERT nuevo en
#      `account_movements`, nunca un UPDATE de un campo de saldo) y el saldo
#      derivado de la suma de movimientos refleja ambos correctamente. Esto
#      valida en la práctica la decisión de diseño #1 de DECISIONS.md: un
#      saldo mutable (`UPDATE customers SET balance = balance - monto`)
#      SÍ tendría riesgo de "lost update" bajo concurrencia; el libro de
#      movimientos append-only no lo tiene.
#
# LIMITACIÓN CONOCIDA (documentada en VERIFICATION_LOG.md): esto prueba el
# mecanismo de Postgres del que depende la app, ejecutando SQL directamente.
# No reemplaza una prueba de extremo a extremo con dos clientes Prisma/Next.js
# reales golpeando los Server Actions al mismo tiempo, porque este sandbox no
# tiene acceso a `npm install` para levantar el servidor Next.js. Esa prueba
# de extremo a extremo queda pendiente de ejecutarse fuera del sandbox (ver
# VERIFICATION_LOG.md). `withSerializableTransaction` usa exactamente el
# mismo nivel de aislamiento y el mismo código de error que se demuestra
# aquí, así que este resultado sí es evidencia real del comportamiento
# subyacente, no una suposición.
#
# USO: ./scripts/verify_concurrency.sh
#
# Conexión a Postgres — se elige automáticamente:
#   1. Si DATABASE_URL está definida (la misma que usa Prisma, ver .env), se
#      usa tal cual. Esta es la forma recomendada para correrlo FUERA de
#      este sandbox, contra tu propio Postgres/Docker/Neon/Supabase/RDS:
#        DATABASE_URL="postgresql://user:pass@host:5432/db" ./scripts/verify_concurrency.sh
#   2. Si no está definida, se usa el fallback de este sandbox en particular
#      (`sudo -u postgres psql -d consignaciones_dev`), que es como se
#      preparó y verificó la base local aquí (ver docs/schema.sql).
# ============================================================================
set -uo pipefail

if [[ -n "${DATABASE_URL:-}" ]]; then
  PSQL_BASE=(psql "$DATABASE_URL")
else
  PSQL_BASE=(sudo -u postgres psql -d consignaciones_dev)
fi

psql_query() { "${PSQL_BASE[@]}" -qtAX -c "$1"; }
psql_file_bg() { "${PSQL_BASE[@]}" -v ON_ERROR_STOP=0 -f "$1"; }

LOG_DIR="$(mktemp -d)"
# El script se corre como root y usa `sudo -u postgres` para las consultas
# en el fallback de este sandbox; sin esto, el usuario postgres no tiene
# permiso de lectura sobre el directorio temporal (creado con permisos 700
# por defecto) y psql -f falla con "Permission denied" en vez de ejecutar
# la prueba. chmod 755 es inofensivo también cuando se usa DATABASE_URL.
chmod 755 "$LOG_DIR"
FAIL=0

pass() { echo "  [PASS] $1"; }
fail() { echo "  [FAIL] $1"; FAIL=1; }

echo "============================================================"
echo " Verificación de concurrencia — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo " Logs en: $LOG_DIR"
echo "============================================================"

# ----------------------------------------------------------------------------
# Fixture: cliente, producto, factura, línea de factura y lote de prueba.
# ----------------------------------------------------------------------------
echo
echo "-- Preparando datos de prueba..."

CUSTOMER_ID=$(psql_query "INSERT INTO customers (id, code, trade_name, legal_name, status) VALUES (gen_random_uuid()::text, 'TEST-CONC-'||substr(md5(random()::text),1,6), 'Cliente Prueba Concurrencia', 'Cliente Prueba Concurrencia SA', 'ACTIVO') RETURNING id;")
PRODUCT_ID=$(psql_query "INSERT INTO products (id, sku, name, standard_price, status) VALUES (gen_random_uuid()::text, 'SKU-CONC-'||substr(md5(random()::text),1,6), 'Producto Prueba Concurrencia', 10.00, 'ACTIVO') RETURNING id;")
INVOICE_ID=$(psql_query "INSERT INTO invoices (id, customer_id, invoice_number, invoice_date, source_type, source_file_url, status, invoice_total) VALUES (gen_random_uuid()::text, '$CUSTOMER_ID', 'FAC-CONC-TEST', now(), 'PDF', 'test://none', 'CONFIRMADA', 1000.00) RETURNING id;")
ITEM_ID=$(psql_query "INSERT INTO invoice_items (id, invoice_id, product_id, reference, description, quantity, unit_price, line_total) VALUES (gen_random_uuid()::text, '$INVOICE_ID', '$PRODUCT_ID', 'SKU-CONC', 'Producto Prueba Concurrencia', 100, 10.00, 1000.00) RETURNING id;")
BATCH_ID=$(psql_query "INSERT INTO consignment_batches (id, customer_id, product_id, invoice_item_id, delivered_qty, unit_price, sold_qty, batch_date) VALUES (gen_random_uuid()::text, '$CUSTOMER_ID', '$PRODUCT_ID', '$ITEM_ID', 100, 10.00, 0, now()) RETURNING id;")

if [[ -z "$CUSTOMER_ID" || -z "$PRODUCT_ID" || -z "$BATCH_ID" ]]; then
  echo "No se pudo preparar el fixture. Abortando."
  exit 1
fi

echo "   customer_id=$CUSTOMER_ID"
echo "   product_id=$PRODUCT_ID"
echo "   batch_id=$BATCH_ID (delivered_qty=100, sold_qty=0)"

cleanup() {
  echo
  echo "-- Limpiando datos de prueba..."
  psql_query "DELETE FROM account_movements WHERE customer_id = '$CUSTOMER_ID';" >/dev/null
  psql_query "DELETE FROM payments WHERE customer_id = '$CUSTOMER_ID';" >/dev/null
  psql_query "DELETE FROM consignment_batches WHERE id = '$BATCH_ID';" >/dev/null
  psql_query "DELETE FROM invoice_items WHERE id = '$ITEM_ID';" >/dev/null
  psql_query "DELETE FROM invoices WHERE id = '$INVOICE_ID';" >/dev/null
  psql_query "DELETE FROM products WHERE id = '$PRODUCT_ID';" >/dev/null
  psql_query "DELETE FROM customers WHERE id = '$CUSTOMER_ID';" >/dev/null
  echo "   listo."
}
trap cleanup EXIT

# ----------------------------------------------------------------------------
# TEST 1: dos "registros de venta" concurrentes sobre el MISMO lote.
# T1 toma el lock de la fila con su UPDATE y se queda 3s antes de hacer
# COMMIT (simula el tiempo que tarda un vendedor en terminar su transacción).
# T2 arranca ~1s después: su UPDATE queda bloqueado esperando la fila hasta
# que T1 libera el lock. En SERIALIZABLE, cuando T1 haga commit, Postgres
# debe rechazar el UPDATE de T2 con SQLSTATE 40001 en vez de dejarlo aplicar
# una segunda vez sobre un valor que ya cambió bajo sus pies.
# ----------------------------------------------------------------------------
echo
echo "== TEST 1: doble registro de venta/inventario sobre el mismo lote =="

T1_SQL="$LOG_DIR/t1.sql"
T2_SQL="$LOG_DIR/t2.sql"
cat > "$T1_SQL" <<SQL
BEGIN ISOLATION LEVEL SERIALIZABLE;
UPDATE consignment_batches SET sold_qty = sold_qty + 10 WHERE id = '$BATCH_ID';
SELECT pg_sleep(3);
COMMIT;
SQL
cat > "$T2_SQL" <<SQL
BEGIN ISOLATION LEVEL SERIALIZABLE;
UPDATE consignment_batches SET sold_qty = sold_qty + 10 WHERE id = '$BATCH_ID';
COMMIT;
SQL

( psql_file_bg "$T1_SQL" > "$LOG_DIR/t1.out" 2>&1 ) &
T1_PID=$!
sleep 1
( psql_file_bg "$T2_SQL" > "$LOG_DIR/t2.out" 2>&1 ) &
T2_PID=$!

wait "$T1_PID"
wait "$T2_PID"

echo "  --- salida T1 ---"; sed 's/^/    /' "$LOG_DIR/t1.out"
echo "  --- salida T2 ---"; sed 's/^/    /' "$LOG_DIR/t2.out"

T1_COMMITTED=$(grep -c "^COMMIT$" "$LOG_DIR/t1.out" || true)
T2_COMMITTED=$(grep -c "^COMMIT$" "$LOG_DIR/t2.out" || true)
T2_SERIALIZATION_ERROR=$(grep -ci "could not serialize access\|40001" "$LOG_DIR/t2.out" || true)

FINAL_SOLD_QTY=$(psql_query "SELECT sold_qty FROM consignment_batches WHERE id = '$BATCH_ID';")

echo "  sold_qty final = $FINAL_SOLD_QTY (esperado: 10, NO 20)"

if [[ "$T1_COMMITTED" -ge 1 ]]; then pass "T1 confirmó su transacción normalmente."; else fail "T1 no confirmó (no debería haber fallado)."; fi
if [[ "$T2_SERIALIZATION_ERROR" -ge 1 && "$T2_COMMITTED" -eq 0 ]]; then
  pass "T2 fue rechazada por Postgres con error de serialización (40001) — exactamente el código que withSerializableTransaction reintenta automáticamente."
else
  fail "T2 NO fue rechazada como se esperaba (revisar salida arriba) — esto indicaría riesgo real de doble registro de inventario."
fi
if [[ "$FINAL_SOLD_QTY" == "10.000" || "$FINAL_SOLD_QTY" == "10" ]]; then
  pass "sold_qty quedó en 10 (una sola venta aplicada, no se perdió ni se duplicó la actualización)."
else
  fail "sold_qty = $FINAL_SOLD_QTY — valor inesperado, indica un problema real de concurrencia."
fi

# TEST 1b: reintentar la operación de T2 (exactamente lo que hace
# withSerializableTransaction al recibir P2034) debe aplicar limpiamente
# ahora que ya no hay conflicto, demostrando que el reintento automático es
# seguro y no requiere intervención manual del usuario.
psql_query "BEGIN ISOLATION LEVEL SERIALIZABLE; UPDATE consignment_batches SET sold_qty = sold_qty + 10 WHERE id = '$BATCH_ID'; COMMIT;" >/dev/null
RETRY_SOLD_QTY=$(psql_query "SELECT sold_qty FROM consignment_batches WHERE id = '$BATCH_ID';")
echo "  sold_qty tras reintentar la operación de T2 = $RETRY_SOLD_QTY (esperado: 20)"
if [[ "$RETRY_SOLD_QTY" == "20.000" || "$RETRY_SOLD_QTY" == "20" ]]; then
  pass "El reintento (igual al que hace withSerializableTransaction tras un 40001/P2034) aplicó limpiamente, sin duplicar ni perder ninguna venta."
else
  fail "sold_qty tras reintentar = $RETRY_SOLD_QTY, se esperaba 20."
fi

# ----------------------------------------------------------------------------
# TEST 2: dos pagos concurrentes del mismo cliente.
# A diferencia del inventario, un pago es un INSERT (no un UPDATE de un
# campo compartido), así que ambos deben poder registrarse sin conflicto —
# y el saldo (derivado con SUM sobre account_movements) debe reflejar la
# suma de los dos. Esto es lo que hace segura la decisión de diseño de NO
# usar un campo `customers.balance` mutable (ver DECISIONS.md #1): con un
# campo mutable, dos `UPDATE balance = balance - monto` concurrentes bajo
# READ COMMITTED (el nivel por defecto) SÍ podrían perder una actualización;
# con un libro de movimientos append-only, cada pago es una fila nueva e
# independiente, así que no hay nada que "perder".
# ----------------------------------------------------------------------------
echo
echo "== TEST 2: dos pagos concurrentes del mismo cliente =="

P1_SQL="$LOG_DIR/p1.sql"
P2_SQL="$LOG_DIR/p2.sql"
cat > "$P1_SQL" <<SQL
BEGIN ISOLATION LEVEL SERIALIZABLE;
INSERT INTO payments (id, customer_id, amount, method) VALUES ('11111111-p1', '$CUSTOMER_ID', 25.00, 'EFECTIVO');
INSERT INTO account_movements (id, customer_id, type, debit, credit, document_type, document_ref, payment_id)
  VALUES (gen_random_uuid()::text, '$CUSTOMER_ID', 'PAGO', 0, 25.00, 'Pago', 'PAGO-TEST-1', '11111111-p1');
SELECT pg_sleep(1);
COMMIT;
SQL
cat > "$P2_SQL" <<SQL
BEGIN ISOLATION LEVEL SERIALIZABLE;
INSERT INTO payments (id, customer_id, amount, method) VALUES ('22222222-p2', '$CUSTOMER_ID', 40.00, 'TRANSFERENCIA');
INSERT INTO account_movements (id, customer_id, type, debit, credit, document_type, document_ref, payment_id)
  VALUES (gen_random_uuid()::text, '$CUSTOMER_ID', 'PAGO', 0, 40.00, 'Pago', 'PAGO-TEST-2', '22222222-p2');
SELECT pg_sleep(1);
COMMIT;
SQL

( psql_file_bg "$P1_SQL" > "$LOG_DIR/p1.out" 2>&1 ) &
P1_PID=$!
( psql_file_bg "$P2_SQL" > "$LOG_DIR/p2.out" 2>&1 ) &
P2_PID=$!
wait "$P1_PID"
wait "$P2_PID"

echo "  --- salida pago 1 ---"; sed 's/^/    /' "$LOG_DIR/p1.out"
echo "  --- salida pago 2 ---"; sed 's/^/    /' "$LOG_DIR/p2.out"

P1_COMMITTED=$(grep -c "^COMMIT$" "$LOG_DIR/p1.out" || true)
P2_COMMITTED=$(grep -c "^COMMIT$" "$LOG_DIR/p2.out" || true)
PAYMENT_COUNT=$(psql_query "SELECT count(*) FROM payments WHERE customer_id = '$CUSTOMER_ID';")
# Misma fórmula que src/domain/accounts/calculateBalance.ts: debit - credit
# (un pago es 100% crédito, así que dos pagos reducen el saldo pendiente).
BALANCE=$(psql_query "SELECT COALESCE(SUM(debit) - SUM(credit), 0) FROM account_movements WHERE customer_id = '$CUSTOMER_ID';")

echo "  pagos registrados = $PAYMENT_COUNT (esperado: 2)"
echo "  saldo derivado del libro de movimientos = $BALANCE (esperado: -65.00, ambos pagos contados)"

if [[ "$P1_COMMITTED" -ge 1 && "$P2_COMMITTED" -ge 1 ]]; then
  pass "Ambos pagos concurrentes confirmaron sin conflicto (son INSERTs independientes, no compiten por una fila)."
else
  fail "Uno de los dos pagos no confirmó — no debería pasar con INSERTs a filas distintas."
fi
if [[ "$PAYMENT_COUNT" == "2" ]]; then
  pass "Los dos pagos existen en la tabla (ninguno se perdió)."
else
  fail "Se esperaban 2 pagos, se encontraron $PAYMENT_COUNT."
fi
if [[ "$BALANCE" == "-65.00" ]]; then
  pass "El saldo derivado del libro de movimientos suma los dos pagos correctamente (-65.00 = -25.00 + -40.00 en crédito)."
else
  fail "Saldo derivado = $BALANCE, se esperaba -65.00."
fi

echo
echo "============================================================"
if [[ "$FAIL" -eq 0 ]]; then
  echo " RESULTADO: TODAS LAS VERIFICACIONES DE CONCURRENCIA PASARON"
else
  echo " RESULTADO: HUBO FALLAS — revisar arriba antes de confiar en el mecanismo de concurrencia"
fi
echo "============================================================"
exit "$FAIL"
