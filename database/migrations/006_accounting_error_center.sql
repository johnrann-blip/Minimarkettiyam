-- AVELORA accounting snapshots and operational error log.
-- Historical order item costs remain NULL: never infer past costs from today's product prices.
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS cost_price_toman BIGINT
  CHECK (cost_price_toman IS NULL OR cost_price_toman >= 0);

CREATE TABLE IF NOT EXISTS admin_error_logs (
  id BIGSERIAL PRIMARY KEY,
  level VARCHAR(20) NOT NULL DEFAULT 'error',
  message TEXT NOT NULL,
  request_method VARCHAR(10) NOT NULL,
  request_path VARCHAR(300) NOT NULL,
  response_status SMALLINT NOT NULL,
  stack TEXT NOT NULL DEFAULT '',
  user_agent VARCHAR(300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_error_logs_created
  ON admin_error_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS accounting_expenses (
  id BIGSERIAL PRIMARY KEY,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category VARCHAR(80) NOT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  amount_toman BIGINT NOT NULL CHECK (amount_toman > 0),
  created_by BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_accounting_expenses_date
  ON accounting_expenses(expense_date DESC);
