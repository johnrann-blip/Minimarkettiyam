-- AVELORA separate administrator accounts, revocable sessions, permissions and audit trail.
CREATE TABLE IF NOT EXISTS admin_users (
 id BIGSERIAL PRIMARY KEY, username VARCHAR(60) NOT NULL UNIQUE,
 display_name VARCHAR(120) NOT NULL, password_hash CHAR(128) NOT NULL,
 password_salt CHAR(32) NOT NULL, role VARCHAR(20) NOT NULL DEFAULT 'manager' CHECK (role IN ('owner','manager')),
 permissions JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(permissions)='array'),
 is_active BOOLEAN NOT NULL DEFAULT TRUE, created_by BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
 last_login_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS admin_sessions (
 id BIGSERIAL PRIMARY KEY, admin_id BIGINT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
 token_hash CHAR(64) NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL,
 last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), ip_address VARCHAR(64), user_agent VARCHAR(300),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry ON admin_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin ON admin_sessions(admin_id);
CREATE TABLE IF NOT EXISTS admin_audit_logs (
 id BIGSERIAL PRIMARY KEY, admin_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
 username VARCHAR(60), action VARCHAR(80) NOT NULL, resource VARCHAR(80) NOT NULL,
 resource_id VARCHAR(100), request_method VARCHAR(10) NOT NULL, request_path VARCHAR(300) NOT NULL,
 response_status SMALLINT NOT NULL, ip_address VARCHAR(64), user_agent VARCHAR(300),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_admin_created ON admin_audit_logs(admin_id,created_at DESC);
