-- Draft and published appearance configuration, kept separate from commerce data.
CREATE TABLE IF NOT EXISTS store_theme_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  draft_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);
INSERT INTO store_theme_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
