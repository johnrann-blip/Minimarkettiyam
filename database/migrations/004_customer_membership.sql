-- AVELORA customer accounts and membership discount. Safe to run repeatedly.
CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  phone VARCHAR(20) NOT NULL UNIQUE,
  password_hash CHAR(128) NOT NULL,
  password_salt CHAR(32) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS customer_sessions (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_expiry ON customer_sessions(expires_at);
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price_toman BIGINT CHECK (cost_price_toman IS NULL OR cost_price_toman >= 0);
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS membership_discount_toman BIGINT NOT NULL DEFAULT 0 CHECK (membership_discount_toman >= 0),
  ADD COLUMN IF NOT EXISTS membership_discount_percent SMALLINT NOT NULL DEFAULT 0 CHECK (membership_discount_percent IN (0,5));
CREATE INDEX IF NOT EXISTS idx_orders_customer_created ON orders(customer_id,created_at DESC);
