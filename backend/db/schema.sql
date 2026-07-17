-- Tumya v1 schema
-- SQLite (better-sqlite3). Applied once at boot if tables don't exist.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL UNIQUE,
  password_hash TEXT,                    -- set for admins only; customers identify by phone for v1
  role          TEXT NOT NULL CHECK (role IN ('customer','admin')) DEFAULT 'customer',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pickup_points (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL,
  area      TEXT NOT NULL,
  landmark  TEXT,
  active    INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS catalog_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  unit         TEXT NOT NULL,             -- "kg", "bunch", "piece"
  price        REAL NOT NULL,
  stock_status TEXT NOT NULL CHECK (stock_status IN ('in_stock','out_of_stock','coming_soon')) DEFAULT 'in_stock',
  photo_url    TEXT,
  photo_url_2  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id         INTEGER NOT NULL REFERENCES users(id),
  type                TEXT NOT NULL CHECK (type IN ('catalog','parcel')),
  status              TEXT NOT NULL,
  -- catalog orders only: always COD, choose the flavor
  payment_mode        TEXT CHECK (payment_mode IN ('cod_cash','cod_upi_scan') OR payment_mode IS NULL),
  total_amount        REAL,               -- known at checkout for catalog; set at quote time for parcels
  tracking_code       TEXT UNIQUE,
  handled_by_admin_id INTEGER REFERENCES users(id),   -- which of the 3 admins is working this order
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id        INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  catalog_item_id INTEGER NOT NULL REFERENCES catalog_items(id),
  qty             REAL NOT NULL,
  unit_price      REAL NOT NULL           -- snapshot of price at order time
);

CREATE TABLE IF NOT EXISTS parcels (
  order_id             INTEGER PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  direction            TEXT NOT NULL CHECK (direction IN ('india_to_uganda','uganda_to_india')),
  send_or_receive      TEXT NOT NULL CHECK (send_or_receive IN ('send','receive')),
  description          TEXT NOT NULL,
  photo_url            TEXT,
  weight_kg            REAL,              -- filled by admin after physical weighing

  pickup_handler_type  TEXT NOT NULL CHECK (pickup_handler_type IN ('self_pickup','own_agent','you_deliver')),
  pickup_point_id      INTEGER REFERENCES pickup_points(id),
  pickup_agent_name    TEXT,
  pickup_agent_phone   TEXT,
  pickup_address       TEXT,

  drop_handler_type    TEXT NOT NULL CHECK (drop_handler_type IN ('self_pickup','own_agent','you_deliver')),
  drop_point_id        INTEGER REFERENCES pickup_points(id),
  drop_agent_name      TEXT,
  drop_agent_phone     TEXT,
  drop_address         TEXT,

  suggested_amount     REAL,              -- weight_kg x rate_config, auto-calculated
  quote_amount          REAL,             -- final price admin confirms (may equal or override suggested)
  quoted_at            TEXT,
  quoted_by            INTEGER REFERENCES users(id)
);

-- One payment row per order. Parcels: created once quoted, method chosen by customer (upi/momo).
-- Catalog: created at checkout, method derived from payment_mode (cod_cash -> cod, cod_upi_scan -> upi_scan).
CREATE TABLE IF NOT EXISTS payments (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id         INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  method           TEXT NOT NULL CHECK (method IN ('upi','momo','cod','upi_scan')),
  amount           REAL NOT NULL,
  reference_number TEXT,
  status           TEXT NOT NULL CHECK (status IN ('pending','verified')) DEFAULT 'pending',
  verified_by      INTEGER REFERENCES users(id),
  verified_at      TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS status_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status     TEXT NOT NULL,
  note       TEXT,
  changed_by INTEGER REFERENCES users(id),
  timestamp  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Editable per-kg defaults for parcel quote suggestions. One row per direction.
CREATE TABLE IF NOT EXISTS rate_config (
  direction     TEXT PRIMARY KEY CHECK (direction IN ('india_to_uganda','uganda_to_india')),
  rate_per_kg   REAL NOT NULL,
  currency      TEXT NOT NULL,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_admin ON orders(handled_by_admin_id);
CREATE INDEX IF NOT EXISTS idx_status_history_order ON status_history(order_id);
