-- ZarinPal payment metadata. Safe to run more than once.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(30),
  ADD COLUMN IF NOT EXISTS payment_authority VARCHAR(80),
  ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(100),
  ADD COLUMN IF NOT EXISTS payment_amount_rial BIGINT,
  ADD COLUMN IF NOT EXISTS payment_verified_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_payment_authority
  ON orders(payment_authority)
  WHERE payment_authority IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_payment_provider_status
  ON orders(payment_provider, payment_status);
