
CREATE TABLE IF NOT EXISTS categories (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  slug VARCHAR(90) NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  sku VARCHAR(40) UNIQUE,
  name VARCHAR(180) NOT NULL,
  category_id BIGINT REFERENCES categories(id),
  description TEXT NOT NULL DEFAULT '',
  price_toman BIGINT NOT NULL CHECK (price_toman >= 0),
  sale_price_toman BIGINT CHECK (sale_price_toman IS NULL OR sale_price_toman >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  image_url TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  order_code VARCHAR(32) NOT NULL UNIQUE,
  customer_name VARCHAR(120) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  city VARCHAR(100) NOT NULL,
  province VARCHAR(100) NOT NULL DEFAULT '',
  address TEXT NOT NULL,
  postal_code VARCHAR(20) NOT NULL DEFAULT '',
  delivery_method VARCHAR(20) NOT NULL CHECK (delivery_method IN ('local','nationwide')),
  subtotal_toman BIGINT NOT NULL CHECK (subtotal_toman >= 0),
  shipping_toman BIGINT NOT NULL DEFAULT 0 CHECK (shipping_toman >= 0),
  total_toman BIGINT NOT NULL CHECK (total_toman >= 0),
  payment_method VARCHAR(30) NOT NULL DEFAULT 'card_to_card',
  payment_status VARCHAR(30) NOT NULL DEFAULT 'unverified',
  status VARCHAR(30) NOT NULL DEFAULT 'awaiting_payment',
  customer_note TEXT NOT NULL DEFAULT '',
  idempotency_key VARCHAR(80),
  request_hash CHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id BIGINT REFERENCES products(id),
  product_name VARCHAR(180) NOT NULL,
  unit_price_toman BIGINT NOT NULL CHECK (unit_price_toman >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_total_toman BIGINT NOT NULL CHECK (line_total_toman >= 0)
);

INSERT INTO categories (name, slug) VALUES
 ('کیف و اکسسوری','bags-accessories'),
 ('لوازم آرایشی','beauty'),
 ('سایر محصولات','more')
ON CONFLICT (slug) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_products_active_category ON products(is_active, category_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key
  ON orders(idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);


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
INSERT INTO store_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
