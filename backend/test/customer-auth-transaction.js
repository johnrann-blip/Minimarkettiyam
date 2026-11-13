const { spawn } = require('child_process');
const { Pool } = require('pg');
const crypto = require('crypto');

const PORT = 3198;
const BASE = `http://127.0.0.1:${PORT}`;
const TEST_DATABASE_URL = 'postgresql://u0_a289@127.0.0.1:5432/avelora_integration_test';
const parsed = new URL(TEST_DATABASE_URL);

if (parsed.protocol !== 'postgresql:' || parsed.hostname !== '127.0.0.1' ||
    parsed.port !== '5432' || parsed.pathname !== '/avelora_integration_test') {
  throw new Error('SAFETY STOP: customer-auth tests require the isolated local AVELORA test database.');
}

const env = {
  ...process.env,
  PORT: String(PORT),
  DATABASE_URL: TEST_DATABASE_URL,
  ADMIN_API_KEY: crypto.randomBytes(32).toString('hex'),
  ZARINPAL_ENABLED: 'false',
  ZARINPAL_MODE: 'sandbox',
  PUBLIC_BASE_URL: ''
};
const server = spawn(process.execPath, ['src/server.js'], {
  cwd: __dirname + '/..',
  env,
  stdio: 'inherit'
});
const db = new Pool({ connectionString: TEST_DATABASE_URL });

function assert(condition, message) {
  if (!condition) throw new Error('FAIL: ' + message);
  console.log('PASS: ' + message);
}

async function request(path, options = {}) {
  const response = await fetch(BASE + path, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  let data = {};
  try { data = await response.json(); } catch {}
  return { status: response.status, data, cookie: response.headers.get('set-cookie') };
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(BASE + '/api/health');
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Customer-auth test server did not become ready.');
}

async function run() {
  await waitForServer();

  // Force session creation to fail. The customer row must roll back with it.
  await db.query(`
    CREATE OR REPLACE FUNCTION test_reject_customer_session()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'intentional customer session failure';
    END;
    $$
  `);
  await db.query(`
    CREATE TRIGGER test_reject_customer_session
    BEFORE INSERT ON customer_sessions
    FOR EACH ROW EXECUTE FUNCTION test_reject_customer_session()
  `);

  const failedPhone = '09' + String(crypto.randomInt(100000000, 999999999));
  try {
    const failed = await request('/api/auth/register', {
      method: 'POST',
      body: { name: 'Rollback Test', phone: failedPhone, password: 'TestMemberPass123' }
    });
    assert(failed.status === 503 && !failed.cookie,
      'registration failure returns an error without issuing a session cookie');
    const rolledBack = await db.query('SELECT id FROM customers WHERE phone=$1', [failedPhone]);
    assert(rolledBack.rowCount === 0,
      'customer account is rolled back when session creation fails');
  } finally {
    await db.query('DROP TRIGGER IF EXISTS test_reject_customer_session ON customer_sessions');
    await db.query('DROP FUNCTION IF EXISTS test_reject_customer_session()');
  }

  const phone = '09' + String(crypto.randomInt(100000000, 999999999));
  const registered = await request('/api/auth/register', {
    method: 'POST',
    body: { name: 'Atomic Registration Test', phone, password: 'TestMemberPass123' }
  });
  assert(registered.status === 201 && !!registered.cookie,
    'successful registration returns a session cookie only after commit');

  const tokenMatch = /(?:^|;\\s*)avelora_session=([^;]+)/.exec(registered.cookie);
  assert(!!tokenMatch, 'registration cookie contains the customer session token');
  const token = decodeURIComponent(tokenMatch[1]);
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const session = await db.query(
    'SELECT customer_id FROM customer_sessions WHERE token_hash=$1 AND expires_at>NOW()',
    [tokenHash]
  );
  assert(session.rowCount === 1, 'session token is stored only as a hash in the database');

  const me = await request('/api/auth/me', { headers: { cookie: registered.cookie } });
  assert(me.status === 200 && me.data.customer && me.data.customer.phone === phone,
    'new customer session authenticates immediately after registration');

  const duplicate = await request('/api/auth/register', {
    method: 'POST',
    body: { name: 'Duplicate Test', phone, password: 'TestMemberPass123' }
  });
  assert(duplicate.status === 409,
    'duplicate phone registration is rejected without creating another account');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await db.end().catch(() => {});
  server.kill('SIGTERM');
});
