-- Add product galleries and manager-defined color variants without changing existing products/orders.
CREATE TABLE IF NOT EXISTS product_images (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_product_images_product_sort ON product_images(product_id, sort_order, id);

CREATE TABLE IF NOT EXISTS product_colors (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name VARCHAR(60) NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(product_id, name)
);
CREATE INDEX IF NOT EXISTS idx_product_colors_product_active ON product_colors(product_id, is_active, sort_order);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS color_id BIGINT REFERENCES product_colors(id) ON DELETE SET NULL;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS color_name VARCHAR(60) NOT NULL DEFAULT '';

-- Preserve the existing primary image as the first gallery image.
INSERT INTO product_images(product_id,image_url,sort_order)
SELECT p.id,p.image_url,0 FROM products p
WHERE COALESCE(p.image_url,'')<>'' AND NOT EXISTS
(SELECT 1 FROM product_images i WHERE i.product_id=p.id);
