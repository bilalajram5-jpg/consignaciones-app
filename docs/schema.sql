-- ============================================================================
-- DDL equivalente a prisma/schema.prisma
-- ----------------------------------------------------------------------------
-- Este archivo NO es generado por Prisma (no se pudo instalar el CLI de
-- Prisma en el sandbox por falta de acceso a npm). Es una traducción manual,
-- escrita para poder aplicarse contra un Postgres real y así verificar que el
-- modelo relacional (tipos, foreign keys, unique constraints, enums) es
-- válido y consistente ANTES de salir del sandbox. Ver VERIFICATION_LOG.md.
--
-- Cuando Prisma esté disponible (fuera del sandbox), NO se debe correr este
-- archivo manualmente: usar `npx prisma migrate dev` a partir de
-- prisma/schema.prisma, que generará su propia migración SQL. Este archivo
-- queda como documentación/verificación, no como la migración oficial.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------
CREATE TYPE user_role AS ENUM ('ADMINISTRADOR', 'VENDEDOR', 'CONTABILIDAD', 'VISOR');
CREATE TYPE user_status AS ENUM ('ACTIVO', 'INACTIVO');
CREATE TYPE customer_status AS ENUM ('ACTIVO', 'INACTIVO');
CREATE TYPE product_status AS ENUM ('ACTIVO', 'INACTIVO');
CREATE TYPE invoice_source_type AS ENUM ('PDF', 'IMAGE', 'MANUAL');
CREATE TYPE invoice_status AS ENUM ('PENDIENTE_REVISION', 'CONFIRMADA', 'RECHAZADA');
CREATE TYPE inventory_count_status AS ENUM ('BORRADOR', 'CONFIRMADO');
CREATE TYPE payment_method AS ENUM ('EFECTIVO', 'ACH', 'TRANSFERENCIA', 'CHEQUE', 'TARJETA', 'OTRO');
CREATE TYPE account_movement_type AS ENUM ('CARGO_VENTA', 'PAGO', 'NOTA_CREDITO', 'OTRO_CARGO');

-- ---------------------------------------------------------------------------
-- USERS / AUTH (NextAuth)
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          user_role NOT NULL DEFAULT 'VENDEDOR',
  status        user_status NOT NULL DEFAULT 'ACTIVO',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE accounts (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type                TEXT NOT NULL,
  provider            TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  refresh_token       TEXT,
  access_token        TEXT,
  expires_at          INTEGER,
  token_type          TEXT,
  scope               TEXT,
  id_token            TEXT,
  session_state       TEXT,
  UNIQUE (provider, provider_account_id)
);

CREATE TABLE sessions (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  session_token TEXT NOT NULL UNIQUE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires       TIMESTAMPTZ NOT NULL
);

-- ---------------------------------------------------------------------------
-- CUSTOMERS
-- ---------------------------------------------------------------------------
CREATE TABLE customers (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  code           TEXT NOT NULL UNIQUE,
  trade_name     TEXT NOT NULL,
  legal_name     TEXT NOT NULL,
  ruc            TEXT,
  dv             TEXT,
  address        TEXT,
  phone          TEXT,
  email          TEXT,
  contact_person TEXT,
  vendor_id      TEXT REFERENCES users(id),
  start_date     TIMESTAMPTZ NOT NULL DEFAULT now(),
  status         customer_status NOT NULL DEFAULT 'ACTIVO',
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     TEXT
);

-- ---------------------------------------------------------------------------
-- PRODUCTS
-- ---------------------------------------------------------------------------
CREATE TABLE products (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  sku            TEXT NOT NULL UNIQUE,
  barcode        TEXT UNIQUE,
  name           TEXT NOT NULL,
  description    TEXT,
  category       TEXT,
  image_url      TEXT,
  standard_price DECIMAL(14,2) NOT NULL,
  status         product_status NOT NULL DEFAULT 'ACTIVO',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     TEXT
);
CREATE INDEX idx_products_sku ON products(sku);

-- ---------------------------------------------------------------------------
-- INVOICES
-- ---------------------------------------------------------------------------
CREATE TABLE invoices (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_id    TEXT NOT NULL REFERENCES customers(id),
  invoice_number TEXT NOT NULL,
  invoice_date   TIMESTAMPTZ NOT NULL,
  source_type    invoice_source_type NOT NULL,
  source_file_url TEXT NOT NULL,
  status         invoice_status NOT NULL DEFAULT 'PENDIENTE_REVISION',
  invoice_total  DECIMAL(14,2) NOT NULL,
  ai_raw_response JSONB,
  ai_model        TEXT,
  ai_overall_confidence DECIMAL(5,4),
  possible_duplicate_of_id TEXT REFERENCES invoices(id),
  uploaded_by_id  TEXT REFERENCES users(id),
  confirmed_by_id TEXT REFERENCES users(id),
  confirmed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, invoice_number)
);
CREATE INDEX idx_invoices_date ON invoices(invoice_date);

CREATE TABLE invoice_items (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  invoice_id     TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id     TEXT REFERENCES products(id),
  reference      TEXT NOT NULL,
  description    TEXT NOT NULL,
  quantity       DECIMAL(14,3) NOT NULL,
  unit_price     DECIMAL(14,2) NOT NULL,
  line_total     DECIMAL(14,2) NOT NULL,
  reference_confidence   DECIMAL(5,4),
  description_confidence DECIMAL(5,4),
  quantity_confidence    DECIMAL(5,4),
  price_confidence       DECIMAL(5,4),
  was_edited_manually BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- CONSIGNMENT BATCHES (lotes FIFO)
-- ---------------------------------------------------------------------------
CREATE TABLE consignment_batches (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_id   TEXT NOT NULL REFERENCES customers(id),
  product_id    TEXT NOT NULL REFERENCES products(id),
  invoice_item_id TEXT NOT NULL UNIQUE REFERENCES invoice_items(id),
  delivered_qty DECIMAL(14,3) NOT NULL,
  unit_price    DECIMAL(14,2) NOT NULL,
  sold_qty      DECIMAL(14,3) NOT NULL DEFAULT 0,
  returned_qty  DECIMAL(14,3) NOT NULL DEFAULT 0,
  adjusted_qty  DECIMAL(14,3) NOT NULL DEFAULT 0,
  batch_date    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_delivered_qty_nonneg CHECK (delivered_qty >= 0)
);
CREATE INDEX idx_batches_customer_product_date ON consignment_batches(customer_id, product_id, batch_date);

-- ---------------------------------------------------------------------------
-- INVENTORY COUNTS (visitas)
-- ---------------------------------------------------------------------------
CREATE TABLE inventory_counts (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_id   TEXT NOT NULL REFERENCES customers(id),
  status        inventory_count_status NOT NULL DEFAULT 'BORRADOR',
  counted_by_id TEXT REFERENCES users(id),
  visit_date    TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE inventory_count_items (
  id                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  inventory_count_id TEXT NOT NULL REFERENCES inventory_counts(id) ON DELETE CASCADE,
  product_id         TEXT NOT NULL REFERENCES products(id),
  entry_mode         TEXT NOT NULL CHECK (entry_mode IN ('CONTEO_FISICO','CANTIDAD_VENDIDA')),
  previous_qty       DECIMAL(14,3) NOT NULL,
  counted_qty        DECIMAL(14,3),
  sold_qty           DECIMAL(14,3) NOT NULL,
  new_qty            DECIMAL(14,3) NOT NULL,
  unit_price         DECIMAL(14,2) NOT NULL,
  line_amount        DECIMAL(14,2) NOT NULL,
  has_discrepancy    BOOLEAN NOT NULL DEFAULT false,
  batch_allocations  JSONB NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (inventory_count_id, product_id)
);

-- ---------------------------------------------------------------------------
-- CONSIGNMENT CUTS (snapshot inmutable)
-- ---------------------------------------------------------------------------
CREATE TABLE consignment_cuts (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  cut_number          SERIAL UNIQUE,
  customer_id         TEXT NOT NULL REFERENCES customers(id),
  inventory_count_id  TEXT NOT NULL UNIQUE REFERENCES inventory_counts(id),
  cut_date            TIMESTAMPTZ NOT NULL DEFAULT now(),
  items_count         INTEGER NOT NULL,
  sold_units          DECIMAL(14,3) NOT NULL,
  total_amount        DECIMAL(14,2) NOT NULL,
  adjustments_count   INTEGER NOT NULL DEFAULT 0,
  returns_count       INTEGER NOT NULL DEFAULT 0,
  snapshot            JSONB NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          TEXT
);

-- ---------------------------------------------------------------------------
-- SALES
-- ---------------------------------------------------------------------------
CREATE TABLE sales (
  id                      TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_id             TEXT NOT NULL REFERENCES customers(id),
  cut_id                  TEXT UNIQUE REFERENCES consignment_cuts(id),
  inventory_count_item_id TEXT UNIQUE REFERENCES inventory_count_items(id),
  sale_date               TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_amount            DECIMAL(14,2) NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sale_items (
  id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  sale_id              TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  consignment_batch_id TEXT NOT NULL REFERENCES consignment_batches(id),
  product_id           TEXT NOT NULL REFERENCES products(id),
  quantity             DECIMAL(14,3) NOT NULL,
  unit_price           DECIMAL(14,2) NOT NULL,
  line_total           DECIMAL(14,2) NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- PAYMENTS
-- ---------------------------------------------------------------------------
CREATE TABLE payments (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_id       TEXT NOT NULL REFERENCES customers(id),
  payment_date      TIMESTAMPTZ NOT NULL DEFAULT now(),
  amount            DECIMAL(14,2) NOT NULL CHECK (amount > 0),
  method            payment_method NOT NULL,
  reference_number  TEXT,
  bank              TEXT,
  notes             TEXT,
  receipt_file_url  TEXT,
  registered_by_id  TEXT REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- RETURNS
-- ---------------------------------------------------------------------------
CREATE TABLE returns (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_id      TEXT NOT NULL REFERENCES customers(id),
  return_date      TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason           TEXT NOT NULL,
  registered_by_id TEXT REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE return_items (
  id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  return_id            TEXT NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  consignment_batch_id TEXT NOT NULL REFERENCES consignment_batches(id),
  product_id           TEXT NOT NULL REFERENCES products(id),
  quantity             DECIMAL(14,3) NOT NULL CHECK (quantity > 0),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- INVENTORY ADJUSTMENTS
-- ---------------------------------------------------------------------------
CREATE TABLE inventory_adjustments (
  id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_id          TEXT NOT NULL REFERENCES customers(id),
  consignment_batch_id TEXT NOT NULL REFERENCES consignment_batches(id),
  product_id           TEXT NOT NULL REFERENCES products(id),
  quantity             DECIMAL(14,3) NOT NULL,
  reason               TEXT NOT NULL,
  category             TEXT NOT NULL,
  created_by_id        TEXT REFERENCES users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- ACCOUNT MOVEMENTS (libro de cuentas por cobrar — fuente de verdad del saldo)
-- ---------------------------------------------------------------------------
CREATE TABLE account_movements (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_id         TEXT NOT NULL REFERENCES customers(id),
  type                account_movement_type NOT NULL,
  date                TIMESTAMPTZ NOT NULL DEFAULT now(),
  debit               DECIMAL(14,2) NOT NULL DEFAULT 0,
  credit              DECIMAL(14,2) NOT NULL DEFAULT 0,
  document_type       TEXT NOT NULL,
  document_ref        TEXT NOT NULL,
  consignment_cut_id  TEXT REFERENCES consignment_cuts(id),
  payment_id          TEXT UNIQUE REFERENCES payments(id),
  notes               TEXT,
  created_by_id       TEXT REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_debit_or_credit CHECK (debit >= 0 AND credit >= 0)
);
CREATE INDEX idx_account_movements_customer_date ON account_movements(customer_id, date);

-- ---------------------------------------------------------------------------
-- AUDIT LOG
-- ---------------------------------------------------------------------------
CREATE TABLE audit_logs (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id        TEXT REFERENCES users(id),
  action         TEXT NOT NULL,
  entity_type    TEXT NOT NULL,
  entity_id      TEXT NOT NULL,
  previous_value JSONB,
  new_value      JSONB,
  ip_address     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_user_date ON audit_logs(user_id, created_at);
