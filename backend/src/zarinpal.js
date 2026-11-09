const express = require('express');

const SANDBOX_BASE = 'https://sandbox.zarinpal.com';
const PRODUCTION_BASE = 'https://payment.zarinpal.com';
const SANDBOX_MERCHANT_ID = '00000000-0000-0000-0000-000000000000';

function getConfig(env = process.env) {
  const mode = String(env.ZARINPAL_MODE || 'sandbox').trim().toLowerCase();
  const enabled = String(env.ZARINPAL_ENABLED || 'false').trim().toLowerCase() === 'true';
  const merchantId = String(env.ZARINPAL_MERCHANT_ID || '').trim();
  const publicBaseUrl = String(env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');

  if (!['sandbox', 'production'].includes(mode)) {
    return { mode, enabled: false, ready: false, error: 'ZARINPAL_MODE must be sandbox or production.' };
  }

  const effectiveMerchantId = mode === 'sandbox' && !merchantId
    ? SANDBOX_MERCHANT_ID
    : merchantId;
  const merchantValid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(effectiveMerchantId);
  let baseUrlValid = false;
  try {
    const parsed = new URL(publicBaseUrl);
    baseUrlValid = parsed.protocol === 'https:' && Boolean(parsed.hostname);
  } catch {}

  const productionReady = mode !== 'production' || Boolean(merchantId && merchantValid);
  return {
    mode,
    enabled,
    ready: enabled && merchantValid && baseUrlValid && productionReady,
    merchantId: effectiveMerchantId,
    publicBaseUrl,
    apiBase: mode === 'sandbox' ? SANDBOX_BASE : PRODUCTION_BASE,
    gatewayBase: mode === 'sandbox' ? SANDBOX_BASE : PRODUCTION_BASE,
    error: !enabled ? 'Online payments are disabled.' :
      !merchantValid ? 'A valid ZarinPal merchant ID is required.' :
      !baseUrlValid ? 'PUBLIC_BASE_URL must be a public HTTPS URL.' : null
  };
}

function tomanToRial(value) {
  const toman = Number(value);
  if (!Number.isSafeInteger(toman) || toman < 100) {
    throw new Error('مبلغ پرداخت باید حداقل ۱۰۰ تومان و معتبر باشد.');
  }
  const rial = toman * 10;
  if (!Number.isSafeInteger(rial)) throw new Error('مبلغ پرداخت معتبر نیست.');
  return rial;
}

function validAuthority(value) {
  return typeof value === 'string' && /^[A-Za-z0-9]{20,80}$/.test(value);
}

async function providerPost(config, endpoint, payload) {
  const response = await fetch(config.apiBase + endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ merchant_id: config.merchantId, ...payload }),
    signal: AbortSignal.timeout(15000)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    const error = new Error('پاسخ معتبر از درگاه زرین‌پال دریافت نشد.');
    error.statusCode = response.status;
    throw error;
  }
  return data;
}

function createZarinpalRouter({ pool, paymentRateLimit }) {
  const router = express.Router();

  router.get('/status', (_req, res) => {
    const config = getConfig();
    res.json({
      provider: 'zarinpal',
      mode: config.mode,
      enabled: config.ready,
      sandbox: config.mode === 'sandbox'
    });
  });

  router.post('/request', ...(paymentRateLimit ? [paymentRateLimit] : []), async (req, res) => {
    const config = getConfig();
    if (!config.ready) {
      return res.status(503).json({
        error: 'درگاه آنلاین هنوز آماده نیست. پس از انتشار سایت و تنظیم امن متغیرهای سرور فعال می‌شود.'
      });
    }

    const orderCode = String(req.body?.order_code || '').trim();
    const phone = String(req.body?.phone || '').replace(/[\s-]/g, '');
    if (!/^[A-Za-z0-9_-]{8,40}$/.test(orderCode) || !/^09\d{9}$/.test(phone)) {
      return res.status(400).json({ error: 'شماره سفارش یا موبایل معتبر نیست.' });
    }

    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const found = await client.query(
        'SELECT id,order_code,phone,total_toman,status,payment_status,payment_method,payment_provider,payment_authority,payment_amount_rial FROM orders WHERE order_code=$1 AND phone=$2 FOR UPDATE',
        [orderCode, phone]
      );
      if (!found.rowCount) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'سفارش پیدا نشد.' });
      }

      const order = found.rows[0];
      if (order.status === 'cancelled') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'این سفارش لغو شده و قابل پرداخت نیست.' });
      }
      if (order.payment_status === 'verified' || order.status === 'paid') {
        await client.query('COMMIT');
        return res.status(409).json({ error: 'پرداخت این سفارش قبلاً تأیید شده است.' });
      }

      if (order.payment_provider === 'zarinpal' &&
          order.payment_authority && order.payment_status === 'pending') {
        const redirectUrl = config.gatewayBase + '/pg/StartPay/' + encodeURIComponent(order.payment_authority);
        await client.query('COMMIT');
        return res.json({ redirect_url: redirectUrl, order_code: order.order_code, reused: true });
      }

      const amountRial = tomanToRial(order.total_toman);
      const callbackUrl = config.publicBaseUrl + '/api/payments/zarinpal/callback';
      const providerResult = await providerPost(config, '/pg/v4/payment/request.json', {
        amount: amountRial,
        callback_url: callbackUrl,
        description: 'پرداخت سفارش ' + order.order_code + ' فروشگاه AVELORA',
        metadata: { mobile: phone, order_id: String(order.id) }
      });

      const data = providerResult && providerResult.data;
      if (!data || Number(data.code) !== 100 || !validAuthority(data.authority)) {
        await client.query('ROLLBACK');
        return res.status(502).json({ error: 'درگاه نتوانست درخواست پرداخت را ایجاد کند. کمی بعد دوباره تلاش کنید.' });
      }

      await client.query(
        "UPDATE orders SET payment_method='zarinpal',payment_provider='zarinpal',payment_authority=$1,payment_amount_rial=$2,payment_status='pending',updated_at=NOW() WHERE id=$3",
        [data.authority, amountRial, order.id]
      );
      await client.query('COMMIT');

      return res.json({
        redirect_url: config.gatewayBase + '/pg/StartPay/' + encodeURIComponent(data.authority),
        order_code: order.order_code,
        reused: false
      });
    } catch (error) {
      if (client) {
        try { await client.query('ROLLBACK'); } catch {}
      }
      console.error('ZarinPal payment request failed:', error && error.message ? error.message : error);
      return res.status(503).json({ error: 'ساخت درخواست پرداخت انجام نشد. دوباره تلاش کنید.' });
    } finally {
      if (client) client.release();
    }
  });

  router.get('/callback', async (req, res) => {
    const config = getConfig();
    const authority = String(req.query.Authority || '');
    const status = String(req.query.Status || '').toUpperCase();

    if (!validAuthority(authority)) {
      return res.status(400).send('درخواست بازگشت از درگاه معتبر نیست.');
    }

    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const found = await client.query(
        'SELECT id,order_code,status,payment_status,payment_provider,payment_authority,payment_amount_rial FROM orders WHERE payment_authority=$1 FOR UPDATE',
        [authority]
      );
      if (!found.rowCount) {
        await client.query('ROLLBACK');
        return res.status(404).send('سفارش مرتبط با این پرداخت پیدا نشد.');
      }

      const order = found.rows[0];
      if (order.payment_provider !== 'zarinpal') {
        await client.query('ROLLBACK');
        return res.status(409).send('درگاه پرداخت سفارش معتبر نیست.');
      }

      if (order.payment_status === 'verified' && order.status === 'paid') {
        await client.query('COMMIT');
        return res.redirect(303, '/?payment=success&order=' + encodeURIComponent(order.order_code));
      }

      if (order.status !== 'awaiting_payment') {
        await client.query('ROLLBACK');
        return res.redirect(303, '/?payment=failed&order=' + encodeURIComponent(order.order_code));
      }

      if (status !== 'OK') {
        await client.query(
          "UPDATE orders SET payment_status='failed',updated_at=NOW() WHERE id=$1 AND payment_status<>'verified'",
          [order.id]
        );
        await client.query('COMMIT');
        return res.redirect(303, '/?payment=failed&order=' + encodeURIComponent(order.order_code));
      }

      if (!config.ready) {
        await client.query('ROLLBACK');
        return res.status(503).send('تنظیمات امن درگاه برای تأیید پرداخت در دسترس نیست.');
      }

      const amountRial = Number(order.payment_amount_rial);
      if (!Number.isSafeInteger(amountRial) || amountRial < 1000) {
        await client.query('ROLLBACK');
        return res.status(409).send('مبلغ ذخیره‌شده پرداخت معتبر نیست.');
      }

      const verifyResult = await providerPost(config, '/pg/v4/payment/verify.json', {
        amount: amountRial,
        authority
      });
      const verification = verifyResult && verifyResult.data;
      const verifyCode = Number(verification && verification.code);
      const verifiedAmount = Number(verification && verification.amount);
      const reference = verification && verification.ref_id != null
        ? String(verification.ref_id)
        : '';

      if (![100, 101].includes(verifyCode) ||
          verifiedAmount !== amountRial ||
          !reference) {
        await client.query(
          "UPDATE orders SET payment_status='failed',updated_at=NOW() WHERE id=$1 AND payment_status<>'verified'",
          [order.id]
        );
        await client.query('COMMIT');
        return res.redirect(303, '/?payment=failed&order=' + encodeURIComponent(order.order_code));
      }

      await client.query(
        "UPDATE orders SET status='paid',payment_status='verified',payment_reference=$1,payment_verified_at=NOW(),updated_at=NOW() WHERE id=$2 AND status='awaiting_payment' AND payment_status<>'verified'",
        [reference, order.id]
      );
      await client.query('COMMIT');
      return res.redirect(303, '/?payment=success&order=' + encodeURIComponent(order.order_code));
    } catch (error) {
      if (client) {
        try { await client.query('ROLLBACK'); } catch {}
      }
      console.error('ZarinPal callback verification failed:', error && error.message ? error.message : error);
      return res.status(503).send('تأیید پرداخت موقتاً انجام نشد. وضعیت سفارش را از فروشگاه پیگیری کنید.');
    } finally {
      if (client) client.release();
    }
  });

  return router;
}

module.exports = {
  createZarinpalRouter,
  getConfig,
  tomanToRial,
  validAuthority
};
