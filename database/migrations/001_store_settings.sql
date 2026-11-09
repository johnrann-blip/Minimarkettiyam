CREATE TABLE IF NOT EXISTS store_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  bank_name VARCHAR(100) NOT NULL DEFAULT '',
  card_number VARCHAR(19) NOT NULL DEFAULT '',
  cardholder_name VARCHAR(120) NOT NULL DEFAULT '',
  iban VARCHAR(34) NOT NULL DEFAULT '',
  payment_instructions TEXT NOT NULL DEFAULT '',
  payment_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  local_shipping_toman BIGINT CHECK (local_shipping_toman IS NULL OR local_shipping_toman >= 0),
  nationwide_shipping_toman BIGINT CHECK (nationwide_shipping_toman IS NULL OR nationwide_shipping_toman >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO store_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
