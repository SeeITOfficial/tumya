-- Tumya v1 schema
-- SQLite (better-sqlite3). Applied once at boot if tables don't exist.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  email            TEXT UNIQUE,
  email_verified   INTEGER NOT NULL DEFAULT 0,
  phone            TEXT NOT NULL UNIQUE,
  password_hash    TEXT,
  role             TEXT NOT NULL CHECK (role IN ('customer','admin')) DEFAULT 'customer',
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
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
  unit         TEXT NOT NULL,
  price        REAL NOT NULL,
  stock_status TEXT NOT NULL
      CHECK (stock_status IN ('in_stock','out_of_stock','coming_soon'))
      DEFAULT 'in_stock',
  photo_url    TEXT,
  photo_url_2  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,

  customer_id         INTEGER NOT NULL
      REFERENCES users(id),

  type                TEXT NOT NULL
      CHECK (type IN ('catalog','parcel')),

  status              TEXT NOT NULL,

  payment_mode        TEXT
      CHECK (
          payment_mode IN ('cod_cash','cod_upi_scan')
          OR payment_mode IS NULL
      ),

  total_amount        REAL,

  tracking_code       TEXT UNIQUE,

  handled_by_admin_id INTEGER
      REFERENCES users(id),

  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  order_id INTEGER NOT NULL
      REFERENCES orders(id)
      ON DELETE CASCADE,

  catalog_item_id INTEGER NOT NULL
      REFERENCES catalog_items(id),

  qty REAL NOT NULL,

  unit_price REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS parcels (
  order_id INTEGER PRIMARY KEY
      REFERENCES orders(id)
      ON DELETE CASCADE,

  direction TEXT NOT NULL
      CHECK (direction IN ('india_to_uganda','uganda_to_india')),

  send_or_receive TEXT NOT NULL
      CHECK (send_or_receive IN ('send','receive')),

  description TEXT NOT NULL,

  photo_url TEXT,

  weight_kg REAL,

  pickup_handler_type TEXT NOT NULL
      CHECK (
          pickup_handler_type IN (
              'self_pickup',
              'own_agent',
              'you_deliver'
          )
      ),

  pickup_point_id INTEGER
      REFERENCES pickup_points(id),

  pickup_agent_name TEXT,
  pickup_agent_phone TEXT,
  pickup_address TEXT,

  drop_handler_type TEXT NOT NULL
      CHECK (
          drop_handler_type IN (
              'self_pickup',
              'own_agent',
              'you_deliver'
          )
      ),

  drop_point_id INTEGER
      REFERENCES pickup_points(id),

  drop_agent_name TEXT,
  drop_agent_phone TEXT,
  drop_address TEXT,

  suggested_amount REAL,

  quote_amount REAL,

  quoted_at TEXT,

  quoted_by INTEGER
      REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  order_id INTEGER NOT NULL UNIQUE
      REFERENCES orders(id)
      ON DELETE CASCADE,

  method TEXT NOT NULL
      CHECK (method IN ('upi','momo','cod','upi_scan')),

  amount REAL NOT NULL,

  reference_number TEXT,

  status TEXT NOT NULL
      CHECK (status IN ('pending','verified'))
      DEFAULT 'pending',

  verified_by INTEGER
      REFERENCES users(id),

  verified_at TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  order_id INTEGER NOT NULL
      REFERENCES orders(id)
      ON DELETE CASCADE,

  status TEXT NOT NULL,

  note TEXT,

  changed_by INTEGER
      REFERENCES users(id),

  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  customer_id INTEGER NOT NULL
      REFERENCES users(id)
      ON DELETE CASCADE,

  endpoint TEXT NOT NULL UNIQUE,

  p256dh TEXT NOT NULL,

  auth TEXT NOT NULL,

  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rate_config (
  direction TEXT PRIMARY KEY
      CHECK (direction IN ('india_to_uganda','uganda_to_india')),

  rate_per_kg REAL NOT NULL,

  currency TEXT NOT NULL,

  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_customer
ON orders(customer_id);

CREATE INDEX IF NOT EXISTS idx_orders_status
ON orders(status);

CREATE INDEX IF NOT EXISTS idx_orders_admin
ON orders(handled_by_admin_id);

CREATE INDEX IF NOT EXISTS idx_status_history_order
ON status_history(order_id);

CREATE TABLE IF NOT EXISTS catalog_bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  user_id INTEGER NOT NULL,

  catalog_item_id INTEGER NOT NULL,

  qty INTEGER NOT NULL
      CHECK (qty BETWEEN 1 AND 999),

  status TEXT NOT NULL DEFAULT 'pending'
      CHECK (
          status IN (
              'pending',
              'sourcing',
              'arrived',
              'customer_notified',
              'completed',
              'cancelled'
          )
      ),

  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (user_id)
      REFERENCES users(id)
      ON DELETE CASCADE,

  FOREIGN KEY (catalog_item_id)
      REFERENCES catalog_items(id)
      ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_catalog_bookings_user
ON catalog_bookings(user_id);

CREATE INDEX IF NOT EXISTS idx_catalog_bookings_item
ON catalog_bookings(catalog_item_id);

CREATE INDEX IF NOT EXISTS idx_catalog_bookings_status
ON catalog_bookings(status);

CREATE INDEX IF NOT EXISTS idx_catalog_bookings_created
ON catalog_bookings(created_at);

CREATE TABLE IF NOT EXISTS global_settings (
  key TEXT PRIMARY KEY COLLATE NOCASE,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_verification_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  email TEXT NOT NULL,

  name TEXT,

  phone TEXT,

  code TEXT NOT NULL,

  purpose TEXT NOT NULL,

  expires_at TEXT NOT NULL,

  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_email_codes_email
ON email_verification_codes(email);

CREATE INDEX IF NOT EXISTS idx_email_codes_expires
ON email_verification_codes(expires_at);