ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(80),
  ADD COLUMN IF NOT EXISTS request_hash CHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key
  ON orders(idempotency_key)
  WHERE idempotency_key IS NOT NULL;
