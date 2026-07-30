CREATE TABLE IF NOT EXISTS catalog_bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    user_id INTEGER NOT NULL,
    catalog_item_id INTEGER NOT NULL,

    qty INTEGER NOT NULL CHECK (qty BETWEEN 1 AND 999),

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