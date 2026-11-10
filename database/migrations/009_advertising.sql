BEGIN;

CREATE TABLE IF NOT EXISTS advertising_packages (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  title VARCHAR(120) NOT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  placement VARCHAR(32) NOT NULL CHECK (placement IN ('home_banner','product_feed','category_banner')),
  pricing_model VARCHAR(16) NOT NULL DEFAULT 'custom' CHECK (pricing_model IN ('daily','cpm','cpc','custom')),
  rate_toman BIGINT CHECK (rate_toman IS NULL OR rate_toman >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO advertising_packages (code,title,description,placement,pricing_model,rate_toman,display_order)
VALUES
 ('home_banner','بنر صفحه اصلی','نمایش بنر برند در بخش شاخص صفحه اصلی فروشگاه','home_banner','custom',NULL,1),
 ('product_feed','تبلیغ میان محصولات','نمایش محتوای تبلیغاتی در میان ویترین محصولات','product_feed','custom',NULL,2),
 ('category_banner','بنر بخش محصولات','نمایش بنر تبلیغاتی بالای فهرست محصولات','category_banner','custom',NULL,3)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS advertising_requests (
  id BIGSERIAL PRIMARY KEY,
  request_code VARCHAR(24) NOT NULL UNIQUE,
  advertiser_name VARCHAR(120) NOT NULL,
  business_name VARCHAR(160) NOT NULL,
  phone VARCHAR(24) NOT NULL,
  email VARCHAR(254) NOT NULL DEFAULT '',
  website_url VARCHAR(500) NOT NULL DEFAULT '',
  industry VARCHAR(100) NOT NULL DEFAULT '',
  package_id BIGINT NOT NULL REFERENCES advertising_packages(id),
  duration_days INTEGER NOT NULL CHECK (duration_days BETWEEN 1 AND 90),
  target_impressions INTEGER CHECK (target_impressions IS NULL OR target_impressions BETWEEN 1 AND 100000000),
  target_clicks INTEGER CHECK (target_clicks IS NULL OR target_clicks BETWEEN 1 AND 10000000),
  budget_toman BIGINT CHECK (budget_toman IS NULL OR budget_toman >= 0),
  creative_url VARCHAR(1000) NOT NULL DEFAULT '',
  target_url VARCHAR(1000) NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','quoted','approved','rejected')),
  quote_toman BIGINT CHECK (quote_toman IS NULL OR quote_toman >= 0),
  payment_status VARCHAR(16) NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid')),
  admin_notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_advertising_requests_status_created
  ON advertising_requests(status, created_at DESC);

CREATE TABLE IF NOT EXISTS advertising_campaigns (
  id BIGSERIAL PRIMARY KEY,
  request_id BIGINT NOT NULL UNIQUE REFERENCES advertising_requests(id),
  package_id BIGINT NOT NULL REFERENCES advertising_packages(id),
  title VARCHAR(160) NOT NULL,
  image_url VARCHAR(1000) NOT NULL,
  target_url VARCHAR(1000) NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','active','paused','completed')),
  impressions BIGINT NOT NULL DEFAULT 0 CHECK (impressions >= 0),
  clicks BIGINT NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_advertising_campaigns_live
  ON advertising_campaigns(package_id,status,starts_at,ends_at);

CREATE TABLE IF NOT EXISTS advertising_events (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES advertising_campaigns(id) ON DELETE CASCADE,
  event_type VARCHAR(16) NOT NULL CHECK (event_type IN ('impression','click')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_advertising_events_campaign_time
  ON advertising_events(campaign_id,occurred_at DESC);

COMMIT;
