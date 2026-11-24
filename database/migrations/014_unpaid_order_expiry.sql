ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_expires_at TIMESTAMPTZ;

ALTER TABLE orders
  ALTER COLUMN payment_expires_at SET DEFAULT (NOW() + INTERVAL '30 minutes');

UPDATE orders
SET payment_expires_at = created_at + INTERVAL '30 minutes'
WHERE status='awaiting_payment' AND payment_expires_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_unpaid_expiry
  ON orders(payment_expires_at)
  WHERE status='awaiting_payment' AND payment_status<>'verified';
