-- AVELORA product likes and moderated customer feedback. Safe to run repeatedly.
CREATE TABLE IF NOT EXISTS product_likes (
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  voter_key VARCHAR(80) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, voter_key)
);
CREATE INDEX IF NOT EXISTS idx_product_likes_product ON product_likes(product_id);

CREATE TABLE IF NOT EXISTS customer_feedback (
  id BIGSERIAL PRIMARY KEY,
  display_name VARCHAR(80) NOT NULL,
  feedback_type VARCHAR(20) NOT NULL DEFAULT 'comment'
    CHECK (feedback_type IN ('comment','suggestion')),
  message VARCHAR(1200) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by BIGINT REFERENCES admin_users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_customer_feedback_public
  ON customer_feedback(status, created_at DESC);
