-- Compras con MMRIA real. Una orden se abre en el servidor, el jugador paga desde su wallet y el servidor verifica la
-- transferencia por RPC antes de entregar. La firma de la transacción es única: un pago no sirve para dos órdenes.
CREATE TABLE orders (
  id         TEXT PRIMARY KEY,
  address    TEXT NOT NULL,
  item_id    TEXT NOT NULL,
  -- Unidades mínimas de MMRIA (6 decimales), como texto.
  amount     TEXT NOT NULL,
  reference  TEXT NOT NULL UNIQUE,
  status     TEXT NOT NULL DEFAULT 'pending',
  signature  TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  paid_at    INTEGER
);
CREATE INDEX idx_orders_address ON orders(address, status);

-- Lo que una wallet compró y conserva. Una sola vez por ítem (los de equipo no se compran dos veces).
CREATE TABLE entitlements (
  address    TEXT NOT NULL,
  item_id    TEXT NOT NULL,
  order_id   TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (address, item_id)
);
