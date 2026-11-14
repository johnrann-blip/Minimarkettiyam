'use strict';

const fs = require('fs/promises');
const path = require('path');

// Safe, additive bootstrap for administrator authentication and store settings.
// Existing tables and rows are preserved.
async function ensureCoreSchema(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id BIGSERIAL PRIMARY KEY,
        username VARCHAR(60) NOT NULL UNIQUE,
        display_name VARCHAR(120) NOT NULL,
        password_hash VARCHAR(256) NOT NULL,
        password_salt VARCHAR(128) NOT NULL,
        role VARCHAR(20) NOT NULL CHECK (role IN ('owner','manager')),
        permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
        last_login_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_sessions (
        id BIGSERIAL PRIMARY KEY,
        admin_id BIGINT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
        token_hash CHAR(64) NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        ip_address VARCHAR(64) NOT NULL DEFAULT '',
        user_agent VARCHAR(300) NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_id ON admin_sessions(admin_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions(expires_at)');

    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id BIGSERIAL PRIMARY KEY,
        admin_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
        username VARCHAR(60),
        action VARCHAR(100) NOT NULL,
        resource VARCHAR(100) NOT NULL,
        resource_id VARCHAR(100),
        request_method VARCHAR(12) NOT NULL,
        request_path VARCHAR(500) NOT NULL,
        response_status INTEGER NOT NULL,
        ip_address VARCHAR(64) NOT NULL DEFAULT '',
        user_agent VARCHAR(300) NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs(created_at DESC)');

    await client.query(`
      CREATE TABLE IF NOT EXISTS store_settings (
        id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        bank_name VARCHAR(160) NOT NULL DEFAULT '',
        card_number VARCHAR(40) NOT NULL DEFAULT '',
        cardholder_name VARCHAR(160) NOT NULL DEFAULT '',
        iban VARCHAR(40) NOT NULL DEFAULT '',
        payment_instructions TEXT NOT NULL DEFAULT '',
        payment_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        local_shipping_toman BIGINT,
        nationwide_shipping_toman BIGINT,
        footer_support_phone VARCHAR(30) NOT NULL DEFAULT '',
        footer_support_email VARCHAR(254) NOT NULL DEFAULT '',
        footer_instagram_url VARCHAR(500) NOT NULL DEFAULT '',
        footer_whatsapp_phone VARCHAR(30) NOT NULL DEFAULT '',
        footer_bale_url VARCHAR(500) NOT NULL DEFAULT '',
        footer_telegram_url VARCHAR(500) NOT NULL DEFAULT '',
        footer_address VARCHAR(500) NOT NULL DEFAULT '',
        footer_hours VARCHAR(160) NOT NULL DEFAULT '',
        footer_about TEXT NOT NULL DEFAULT '',
        policy_terms TEXT NOT NULL DEFAULT '',
        policy_privacy TEXT NOT NULL DEFAULT '',
        policy_shipping TEXT NOT NULL DEFAULT '',
        policy_returns TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query('INSERT INTO store_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING');

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// Run only the additive migrations used by the current main application.
// The advisory lock prevents two cPanel/Passenger workers from racing on startup.
async function runApplicationMigrations(pool) {
  const client = await pool.connect();
  const migrationsDir = path.resolve(__dirname, '../../database/migrations');
  const migrations = [
    '000_core_store_tables.sql',
    '001_store_settings.sql',
    '002_order_idempotency.sql',
    '003_zarinpal_payments.sql',
    '004_customer_membership.sql',
    '008_admin_auth.sql',
    '009_advertising.sql',
    '010_product_likes_customer_feedback.sql'
  ];

  try {
    await client.query('SELECT pg_advisory_lock(741029110)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_schema_migrations (
        migration_name VARCHAR(160) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const migration of migrations) {
      const found = await client.query(
        'SELECT 1 FROM app_schema_migrations WHERE migration_name=$1',
        [migration]
      );
      if (found.rowCount) continue;

      const sql = await fs.readFile(path.join(migrationsDir, migration), 'utf8');
      await client.query(sql);
      await client.query(
        'INSERT INTO app_schema_migrations (migration_name) VALUES ($1) ON CONFLICT DO NOTHING',
        [migration]
      );
      console.log('AVELORA database migration applied:', migration);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(741029110)').catch(() => {});
    client.release();
  }
}

module.exports = { ensureCoreSchema, runApplicationMigrations };
