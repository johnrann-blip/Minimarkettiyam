-- Safe review export: public product catalog fields only.
-- Excludes customer/order data, payment data, admin accounts and private cost prices.
SELECT COALESCE(
  jsonb_pretty(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'sku', p.sku,
        'name', p.name,
        'category', c.name,
        'description', p.description,
        'price_toman', p.price_toman,
        'sale_price_toman', p.sale_price_toman,
        'stock', p.stock,
        'is_active', p.is_active,
        'image_url', p.image_url,
        'images', COALESCE(
          (
            SELECT jsonb_agg(pi.image_url ORDER BY pi.position, pi.id)
            FROM product_images pi
            WHERE pi.product_id = p.id
          ),
          '[]'::jsonb
        )
      )
      ORDER BY p.id
    )
  ),
  '[]'
);
