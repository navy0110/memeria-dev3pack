-- Jugadores y guardados. La clave es la dirección de la wallet (verificada por firma en el Worker).
CREATE TABLE players (
  address     TEXT PRIMARY KEY,
  class_id    TEXT NOT NULL,
  skin        INTEGER NOT NULL DEFAULT 0,
  alias       TEXT,
  alias_lower TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
-- Un nombre no se repite (sin distinguir mayúsculas). Varias filas sin nombre (NULL) conviven.
CREATE UNIQUE INDEX idx_players_alias ON players(alias_lower);

CREATE TABLE saves (
  address    TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
