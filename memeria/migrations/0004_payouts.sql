-- Pago automático de premios. Un canje pasa por pending -> sending -> paid. Antes de enviar se anota la firma de la
-- transacción y hasta qué altura de bloque vale (last_valid): así, si algo se corta, se puede saber si el pago salió
-- o venció, y reintentar sin pagar dos veces.
ALTER TABLE redemptions ADD COLUMN last_valid INTEGER;
ALTER TABLE redemptions ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE redemptions ADD COLUMN note TEXT;
CREATE INDEX idx_redemptions_day ON redemptions(created_at);
