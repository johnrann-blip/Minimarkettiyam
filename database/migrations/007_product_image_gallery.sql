-- Product image gallery: up to 10 images per product.
-- Existing primary images are preserved and backfilled.

BEGIN;

CREATE TABLE IF NOT EXISTS product_images (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL
    REFERENCES products(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  position SMALLINT NOT NULL DEFAULT 0
    CHECK (position BETWEEN 0 AND 9),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT product_images_product_position_unique
    UNIQUE (product_id, position),
  CONSTRAINT product_images_product_url_unique
    UNIQUE (product_id, image_url),
  CONSTRAINT product_images_url_length
    CHECK (length(image_url) BETWEEN 1 AND 2048)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_images_one_primary
  ON product_images(product_id)
  WHERE is_primary = TRUE;

CREATE INDEX IF NOT EXISTS idx_product_images_product_order
  ON product_images(product_id, position, id);

-- Preserve each existing product image as its primary gallery image.
INSERT INTO product_images (product_id, image_url, position, is_primary)
SELECT p.id, p.image_url, 0, TRUE
FROM products p
WHERE p.image_url IS NOT NULL
  AND btrim(p.image_url) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM product_images pi
    WHERE pi.product_id = p.id
  );

COMMIT;
