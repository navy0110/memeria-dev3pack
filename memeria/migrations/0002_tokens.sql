-- Fichas MMRIA ganadas en el juego y pedidos de canje por MMRIA real. El saldo lo lleva solo el servidor.
CREATE TABLE balances (
  address      TEXT PRIMARY KEY,
  tokens       INTEGER NOT NULL DEFAULT 0,
  -- Día UTC (AAAA-MM-DD) y fichas ganadas ese día: sirven para el tope diario.
  earned_day   TEXT,
  earned_today INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL
);

-- Un canje descuenta las fichas y queda 'pending' hasta que alguien envía el MMRIA y anota la transacción.
CREATE TABLE redemptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  address    TEXT NOT NULL,
  tokens     INTEGER NOT NULL,
  mmria      REAL NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  paid_at    INTEGER,
  tx         TEXT
);
CREATE INDEX idx_redemptions_address ON redemptions(address, status);
