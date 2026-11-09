
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const { Pool } = require('pg');
const { createZarinpalRouter, getConfig } = require('./zarinpal');
const { createCustomerAuth } = require('./customer-auth');
const { createAdminAuth } = require('./admin-auth');

const app = express();
const port = Number(process.env.PORT || 3000);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function validateRuntimeConfig() {
  const errors = [];
  if (!process.env.DATABASE_URL) errors.push('DATABASE_URL is required.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push('PORT must be an integer from 1 to 65535.');

  if (process.env.NODE_ENV === 'production') {
    if (!process.env.ADMIN_API_KEY || Buffer.byteLength(process.env.ADMIN_API_KEY) < 32 ||
        process.env.ADMIN_API_KEY.startsWith('REPLACE_WITH_')) {
      errors.push('ADMIN_API_KEY must contain at least 32 bytes in production.');
    }

    const paymentEnabled = String(process.env.ZARINPAL_ENABLED || 'false').trim().toLowerCase() === 'true';
    if (paymentEnabled) {
      if (String(process.env.ZARINPAL_MODE || '').trim().toLowerCase() !== 'production') {
        errors.push('ZARINPAL_MODE must be production when live payments are enabled.');
      }
      if (!getConfig().ready) errors.push('ZarinPal production configuration is incomplete or invalid.');
    }
  }

  if (errors.length) throw new Error('Invalid AVELORA runtime configuration: ' + errors.join(' '));
}

validateRuntimeConfig();
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", "https:", "data:"],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "https://fonts.googleapis.com"],
      upgradeInsecureRequests: []
    }
  }
}));
app.use(cors({ origin: false }));
// Keep ordinary JSON requests small; only the authenticated image-upload route gets the larger body limit.
app.use((req, res, next) => {
  if (req.method === 'POST' && req.path === '/api/admin/uploads/product') return next();
  return express.json({ limit: '1mb' })(req, res, next);
});
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), { maxAge: '7d', immutable: true }));
app.use(express.static(path.join(__dirname, '../../frontend')));
app.use('/admin', express.static(path.join(__dirname, '../../admin')));

function adminOnly(req, res, next) {
  return adminAuth.requireAdmin(req, res, next);
}

function createRateLimiter({ windowMs, max, message }) {
  const buckets = new Map();
  let sweepCounter = 0;

  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';

    let bucket = buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count++;

    if (++sweepCounter % 100 === 0 || buckets.size > 5000) {
      for (const [ip, entry] of buckets) {
        if (now >= entry.resetAt) buckets.delete(ip);
      }

      while (buckets.size > 5000) {
        const oldest = buckets.keys().next().value;
        if (oldest === undefined) break;
        buckets.delete(oldest);
      }
    }

    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

    res.set('RateLimit-Limit', String(max));
    res.set('RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    res.set('RateLimit-Reset', String(retryAfter));

    if (bucket.count > max) {
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: message });
    }

    next();
  };
}

const adminRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: 'تعداد درخواست‌های مدیریتی بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.'
});

const adminAuthRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'تعداد تلاش‌های ورود مدیریت زیاد است. ۱۵ دقیقه بعد دوباره تلاش کن.'
});
const adminAuth = createAdminAuth({pool,rateLimit:adminAuthRateLimit});
app.use('/api/admin/auth', adminAuth.router);

const orderRateLimit = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: 'تعداد تلاش‌های ثبت سفارش بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.'
});

const paymentRateLimit = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 8,
  message: 'تعداد درخواست‌های پرداخت بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.'
});

const customerAuthRateLimit = createRateLimiter({windowMs:15*60*1000,max:10,message:'تعداد تلاش‌های ورود یا ثبت‌نام زیاد است. کمی بعد دوباره تلاش کن.'});
const customerAuth = createCustomerAuth({pool,rateLimit:customerAuthRateLimit});
app.use('/api',customerAuth.optionalCustomer);
app.use('/api/auth',customerAuth.router);
app.use('/api/admin', adminRateLimit);
app.use('/api', (req,res,next) => {
  res.on('finish', () => {
    if (res.statusCode >= 500) {
      pool.query(
        'INSERT INTO admin_error_logs(level,message,request_method,request_path,response_status,stack,user_agent) VALUES($1,$2,$3,$4,$5,$6,$7)',
        ['error','API returned a server error',req.method,String(req.originalUrl||req.path).slice(0,300),res.statusCode,'',String(req.get('user-agent')||'').slice(0,300)]
      ).catch(error=>console.error('API error log write failed:',error.message));
    }
  });
  next();
});
app.use('/api/payments/zarinpal', createZarinpalRouter({ pool, paymentRateLimit }));

pool.on('error', error => {
  console.error('Unexpected PostgreSQL pool error:', error && error.message ? error.message : error);
});

const toman = n => Number.isSafeInteger(Number(n)) && Number(n) >= 0;
const orderCode = () => 'MM' + Date.now().toString().slice(-9) + crypto.randomBytes(2).toString('hex').toUpperCase();

app.get('/api/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok', service: 'minimarkettiyam-store' }); }
  catch { res.status(503).json({ status: 'database_unavailable' }); }
});
app.get('/api/categories', async (_req, res) => {
  try { const r = await pool.query('SELECT id,name,slug FROM categories WHERE is_active=true ORDER BY id'); res.json(r.rows); }
  catch { res.status(500).json({ error: 'خطا در دریافت دسته‌بندی‌ها' }); }
});
app.get('/api/products', async (req, res) => {
  try {
    const values = [];
    let where = 'p.is_active=true';
    if (req.query.category) { values.push(String(req.query.category)); where += ` AND c.slug=$${values.length}`; }
    if (req.query.q) { values.push('%' + String(req.query.q).slice(0,80) + '%'); where += ` AND (p.name ILIKE $${values.length} OR p.description ILIKE $${values.length})`; }
    const r = await pool.query(
      `SELECT p.id,p.sku,p.name,p.description,p.price_toman,p.sale_price_toman,p.cost_price_toman,p.stock,p.image_url,c.name AS category_name,c.slug AS category_slug
       FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE ${where} ORDER BY p.created_at DESC LIMIT 100`, values);
    res.json(r.rows.map(p => {
      const {cost_price_toman,...publicProduct}=p;
      const regular=Number(p.price_toman), current=Number(p.sale_price_toman ?? p.price_toman);
      let effective=current, discount=0;
      if(req.customer && p.cost_price_toman!==null){
        const candidate=Math.floor(regular*95/100);
        if(candidate>=Number(p.cost_price_toman)){effective=Math.min(current,candidate);discount=Math.max(0,current-effective);}
      }
      return {...publicProduct,price_toman:regular,sale_price_toman:effective<regular?effective:null,
        member_discount_toman:discount,member_price_eligible:Boolean(req.customer&&discount>0)};
    }));
  } catch { res.status(500).json({ error: 'خطا در دریافت محصولات' }); }
});



// تنظیمات عمومی فروشگاه؛ اطلاعات بانکی فقط در صورت فعال بودن پرداخت نمایش داده می‌شود.
app.get('/api/store-settings', async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT bank_name,card_number,cardholder_name,iban,
              payment_instructions,payment_enabled,
              local_shipping_toman,nationwide_shipping_toman
       FROM store_settings WHERE id=1`
    );
    if (!r.rowCount) return res.status(503).json({error:'تنظیمات فروشگاه ثبت نشده است.'});
    const x = r.rows[0];
    res.json({
      payment_enabled: x.payment_enabled,
      online_payment_enabled: getConfig().ready,
      online_payment_mode: getConfig().mode,
      bank_name: x.payment_enabled ? x.bank_name : '',
      card_number: x.payment_enabled ? x.card_number : '',
      cardholder_name: x.payment_enabled ? x.cardholder_name : '',
      iban: x.payment_enabled ? x.iban : '',
      payment_instructions: x.payment_enabled ? x.payment_instructions : '',
      local_shipping_toman: x.local_shipping_toman === null ? null : Number(x.local_shipping_toman),
      nationwide_shipping_toman: x.nationwide_shipping_toman === null ? null : Number(x.nationwide_shipping_toman)
    });
  } catch {
    res.status(500).json({error:'دریافت تنظیمات فروشگاه انجام نشد.'});
  }
});

app.get('/api/admin/store-settings', adminOnly, async (_req, res) => {
  try {
    const r = await pool.query('SELECT * FROM store_settings WHERE id=1');
    if (!r.rowCount) return res.status(503).json({error:'تنظیمات فروشگاه ثبت نشده است.'});
    const x = r.rows[0];
    res.json({
      bank_name: x.bank_name,
      card_number: x.card_number,
      cardholder_name: x.cardholder_name,
      iban: x.iban,
      payment_instructions: x.payment_instructions,
      payment_enabled: x.payment_enabled,
      local_shipping_toman: x.local_shipping_toman === null ? '' : Number(x.local_shipping_toman),
      nationwide_shipping_toman: x.nationwide_shipping_toman === null ? '' : Number(x.nationwide_shipping_toman)
    });
  } catch {
    res.status(500).json({error:'دریافت تنظیمات مدیریت انجام نشد.'});
  }
});

app.patch('/api/admin/store-settings', adminOnly, async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const currentResult = await client.query(
      'SELECT * FROM store_settings WHERE id=1 FOR UPDATE'
    );

    if (!currentResult.rowCount) {
      await client.query('ROLLBACK');
      return res.status(503).json({error:'تنظیمات فروشگاه ثبت نشده است.'});
    }

    const current = currentResult.rows[0];
    const body = req.body || {};
    const fields = [
      'bank_name','card_number','cardholder_name','iban',
      'payment_instructions','payment_enabled',
      'local_shipping_toman','nationwide_shipping_toman'
    ];

    const value = {};
    for (const field of fields) {
      value[field] = Object.prototype.hasOwnProperty.call(body, field)
        ? body[field] : current[field];
    }

    value.bank_name = String(value.bank_name ?? '').trim();
    value.card_number = String(value.card_number ?? '').replace(/[\s-]/g, '');
    value.cardholder_name = String(value.cardholder_name ?? '').trim();
    value.iban = String(value.iban ?? '').replace(/\s/g, '').toUpperCase();
    value.payment_instructions = String(value.payment_instructions ?? '').trim();

    let validationError = null;

    if (
      value.bank_name.length > 100 ||
      value.cardholder_name.length > 120 ||
      value.payment_instructions.length > 1000
    ) {
      validationError = 'طول یکی از اطلاعات بانکی بیش از حد مجاز است.';
    } else if (value.card_number && !/^\d{16}$/.test(value.card_number)) {
      validationError = 'شماره کارت باید ۱۶ رقم باشد.';
    } else if (value.iban && !/^IR\d{24}$/.test(value.iban)) {
      validationError = 'شماره شبا باید با IR شروع شود و ۲۴ رقم پس از آن داشته باشد.';
    } else if (typeof value.payment_enabled !== 'boolean') {
      validationError = 'وضعیت پرداخت معتبر نیست.';
    } else if (value.payment_enabled && (!value.card_number || !value.cardholder_name)) {
      validationError = 'برای فعال‌کردن پرداخت، شماره کارت و نام صاحب کارت الزامی است.';
    }

    for (const field of ['local_shipping_toman','nationwide_shipping_toman']) {
      if (validationError) break;
      const raw = value[field];

      if (raw === '' || raw === null || raw === undefined) {
        value[field] = null;
      } else {
        const n = Number(raw);
        if (!Number.isSafeInteger(n) || n < 0) {
          validationError = 'هزینه ارسال باید عدد صحیح نامنفی و معتبر باشد.';
        } else {
          value[field] = n;
        }
      }
    }

    if (validationError) {
      await client.query('ROLLBACK');
      return res.status(400).json({error:validationError});
    }

    const saved = await client.query(
      `UPDATE store_settings SET
       bank_name=$1,card_number=$2,cardholder_name=$3,iban=$4,
       payment_instructions=$5,payment_enabled=$6,
       local_shipping_toman=$7,nationwide_shipping_toman=$8,
       updated_at=NOW()
       WHERE id=1
       RETURNING bank_name,card_number,cardholder_name,iban,
                 payment_instructions,payment_enabled,
                 local_shipping_toman,nationwide_shipping_toman`,
      [
        value.bank_name,value.card_number,value.cardholder_name,value.iban,
        value.payment_instructions,value.payment_enabled,
        value.local_shipping_toman,value.nationwide_shipping_toman
      ]
    );

    await client.query('COMMIT');

    const x = saved.rows[0];
    res.json({
      success:true,
      settings:{
        bank_name:x.bank_name,
        card_number:x.card_number,
        cardholder_name:x.cardholder_name,
        iban:x.iban,
        payment_instructions:x.payment_instructions,
        payment_enabled:x.payment_enabled,
        local_shipping_toman:x.local_shipping_toman === null ? null : Number(x.local_shipping_toman),
        nationwide_shipping_toman:x.nationwide_shipping_toman === null ? null : Number(x.nationwide_shipping_toman)
      }
    });
  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch {}
    }
    res.status(500).json({error:'ذخیره تنظیمات فروشگاه انجام نشد.'});
  } finally {
    if (client) client.release();
  }
});

function normalizeDigits(value) {
  return String(value).replace(/[۰-۹٠-٩]/g, digit => {
    const code = digit.charCodeAt(0);
    return String(code >= 0x06F0 && code <= 0x06F9
      ? code - 0x06F0
      : code - 0x0660);
  });
}

function normalizeIranMobile(value) {
  let phone = normalizeDigits(value).trim().replace(/[\\s-]/g, '');

  if (phone.startsWith('+98')) phone = '0' + phone.slice(3);
  else if (phone.startsWith('0098')) phone = '0' + phone.slice(4);

  return /^09\d{9}$/.test(phone) ? phone : null;
}

app.post('/api/orders', orderRateLimit, async (req, res) => {
  const { customer, items, delivery_method, note } = req.body || {};
  const idempotencyKey = String(req.get('Idempotency-Key') || '').trim();

  if (!/^[A-Za-z0-9_-]{16,80}$/.test(idempotencyKey)) {
    return res.status(400).json({error:'شناسه یکتای درخواست معتبر نیست.'});
  }

  if (!customer || !Array.isArray(items) || !items.length || items.length > 30) {
    return res.status(400).json({error:'اطلاعات سفارش کامل نیست.'});
  }

  const name = String(customer.name || '').trim().slice(0, 120);
  const phone = normalizeIranMobile(customer.phone || '');
  const city = String(customer.city || '').trim().slice(0, 100);
  const province = String(customer.province || '').trim().slice(0, 100);
  const address = String(customer.address || '').trim().slice(0, 1000);
  const postal = normalizeDigits(customer.postal_code || '').trim();
  const customerNote = String(note || '').slice(0, 500);

  if (!name || !phone || !city || !address ||
      (postal && !/^\d{10}$/.test(postal)) ||
      !['local', 'nationwide'].includes(delivery_method)) {
    return res.status(400).json({
      error:'نام، شماره موبایل معتبر، شهر، نشانی و روش ارسال الزامی است؛ کد پستی در صورت ورود باید ۱۰ رقم باشد.'
    });
  }

  const quantities = new Map();
  for (const item of items) {
    const id = Number(item.product_id);
    const qty = Number(item.quantity);

    if (!Number.isSafeInteger(id) || id < 1 ||
        !Number.isInteger(qty) || qty < 1 || qty > 20) {
      return res.status(400).json({error:'تعداد یا شناسه محصول معتبر نیست.'});
    }

    const totalQty = (quantities.get(id) || 0) + qty;
    if (totalQty > 20) {
      return res.status(400).json({error:'تعداد هر محصول نمی‌تواند بیشتر از ۲۰ باشد.'});
    }
    quantities.set(id, totalQty);
  }

  const crypto = require('crypto');
  const customerId = req.customer ? req.customer.id : null;
  const canonicalRequest = {
    customer_id: customerId,
    customer: {name,phone,city,province,address,postal},
    items: [...quantities.entries()].sort((a,b) => a[0] - b[0]),
    delivery_method,
    note: customerNote
  };
  const requestHash = crypto.createHash('sha256')
    .update(JSON.stringify(canonicalRequest))
    .digest('hex');

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // درخواست‌های دارای یک کلید، حتی در اجرای هم‌زمان، پشت سر هم بررسی می‌شوند.
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [idempotencyKey]
    );

    const previous = await client.query(
      `SELECT order_code,subtotal_toman,shipping_toman,total_toman,status,request_hash,membership_discount_toman,membership_discount_percent
       FROM orders WHERE idempotency_key=$1`,
      [idempotencyKey]
    );

    if (previous.rowCount) {
      const old = previous.rows[0];

      if (old.request_hash !== requestHash) {
        throw new Error('شناسه درخواست قبلاً برای سفارش دیگری استفاده شده است.');
      }

      await client.query('COMMIT');
      return res.status(200).json({
        order_code:old.order_code,
        subtotal_toman:Number(old.subtotal_toman),
        shipping_toman:Number(old.shipping_toman),
        total_toman:Number(old.total_toman),
        membership_discount_toman:Number(old.membership_discount_toman||0),
        membership_discount_percent:Number(old.membership_discount_percent||0),
        status:old.status,
        duplicate:true,
        message:'این سفارش قبلاً ثبت شده است.'
      });
    }

    const settingsResult = await client.query(
      `SELECT payment_enabled,local_shipping_toman,nationwide_shipping_toman
       FROM store_settings WHERE id=1 FOR SHARE`
    );
    if (!settingsResult.rowCount) throw new Error('تنظیمات فروشگاه کامل نیست.');

    const settings = settingsResult.rows[0];
    if (!settings.payment_enabled && !getConfig().ready) {
      throw new Error('هیچ روش پرداختی برای فروشگاه فعال نیست.');
    }

    const shippingRaw = delivery_method === 'local'
      ? settings.local_shipping_toman
      : settings.nationwide_shipping_toman;

    if (shippingRaw === null) {
      throw new Error('تعرفه روش ارسال انتخاب‌شده هنوز توسط مدیر تعیین نشده است.');
    }

    const shipping = Number(shippingRaw);
    if (!Number.isSafeInteger(shipping) || shipping < 0) {
      throw new Error('تعرفه ارسال معتبر نیست.');
    }

    let subtotal = 0;
    let membershipDiscount = 0;
    const normalized = [];

    for (const [id, qty] of quantities) {
      const result = await client.query(
        'SELECT id,name,price_toman,sale_price_toman,cost_price_toman,stock FROM products WHERE id=$1 AND is_active=true FOR UPDATE',
        [id]
      );

      if (!result.rowCount) throw new Error('یکی از محصولات دیگر موجود نیست.');

      const product = result.rows[0];
      if (Number(product.stock) < qty) {
        throw new Error('موجودی ' + product.name + ' کافی نیست.');
      }

      const regularPrice=Number(product.price_toman);
      const currentPrice=Number(product.sale_price_toman ?? product.price_toman);
      let price=currentPrice;
      if(req.customer && product.cost_price_toman!==null){
        const candidate=Math.floor(regularPrice*95/100);
        if(candidate>=Number(product.cost_price_toman)) price=Math.min(currentPrice,candidate);
      }
      const discountPerUnit=Math.max(0,currentPrice-price);
      const line = price * qty;

      if (!Number.isSafeInteger(price) || price < 0 ||
          !Number.isSafeInteger(line) ||
          !Number.isSafeInteger(subtotal + line)) {
        throw new Error('مبلغ سفارش معتبر نیست.');
      }

      subtotal += line;
      membershipDiscount += discountPerUnit*qty;
      normalized.push({product,qty,price,line});
    }

    const total = subtotal + shipping;
    if (!Number.isSafeInteger(total)) throw new Error('مبلغ سفارش معتبر نیست.');

    const code = orderCode();
    const inserted = await client.query(
      `INSERT INTO orders
       (order_code,customer_id,customer_name,phone,city,province,address,postal_code,delivery_method,
        subtotal_toman,shipping_toman,total_toman,customer_note,membership_discount_toman,membership_discount_percent,idempotency_key,request_hash)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING id,order_code,total_toman,status`,
      [code,customerId,name,phone,city,province,address,postal,delivery_method,
       subtotal,shipping,total,customerNote,membershipDiscount,membershipDiscount>0?5:0,idempotencyKey,requestHash]
    );

    const order = inserted.rows[0];

    for (const x of normalized) {
      await client.query(
        `INSERT INTO order_items
         (order_id,product_id,product_name,unit_price_toman,quantity,line_total_toman,cost_price_toman)
         VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [order.id,x.product.id,x.product.name,x.price,x.qty,x.line,
         x.product.cost_price_toman===null ? null : Number(x.product.cost_price_toman)]
      );

      await client.query(
        'UPDATE products SET stock=stock-$1,updated_at=NOW() WHERE id=$2',
        [x.qty,x.product.id]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      order_code:order.order_code,
      subtotal_toman:subtotal,
      membership_discount_toman:membershipDiscount,
      membership_discount_percent:membershipDiscount>0?5:0,
      shipping_toman:shipping,
      total_toman:Number(order.total_toman),
      status:order.status,
      message:'سفارش ثبت شد. جمع کالاها و هزینه ارسال در مبلغ نهایی محاسبه شده است.'
    });
  } catch (e) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch {}
    }

    const message = e.message || '';
    if (message.startsWith('شناسه درخواست قبلاً')) {
      return res.status(409).json({error:message});
    }

    const known = [
      'تعداد یا شناسه محصول معتبر نیست.',
      'تعداد هر محصول نمی‌تواند بیشتر از ۲۰ باشد.',
      'یکی از محصولات دیگر موجود نیست.',
      'موجودی ',
      'مبلغ سفارش معتبر نیست.',
      'تنظیمات فروشگاه کامل نیست.',
      'پرداخت فروشگاه هنوز توسط مدیر فعال نشده است.',
      'هیچ روش پرداختی برای فروشگاه فعال نیست.',
      'تعرفه روش ارسال انتخاب‌شده هنوز توسط مدیر تعیین نشده است.',
      'تعرفه ارسال معتبر نیست.'
    ];

    const expected = known.some(x => message.startsWith(x));
    res.status(expected ? 400 : 503).json({
      error:expected ? message : 'ثبت سفارش موقتاً ممکن نیست. دوباره تلاش کنید.'
    });
  } finally {
    if (client) client.release();
  }
});

app.get('/api/admin/customers', adminOnly, async (_req,res) => {
  try {
    const result=await pool.query(`
      SELECT c.id,c.full_name,c.phone,c.is_active,c.created_at,
             COUNT(o.id)::int AS order_count,
             COALESCE(SUM(o.total_toman) FILTER (WHERE o.payment_status='verified' AND o.status<>'cancelled'),0)::bigint AS total_spent_toman
      FROM customers c LEFT JOIN orders o ON o.customer_id=c.id
      GROUP BY c.id ORDER BY c.created_at DESC LIMIT 500
    `);
    res.json(result.rows);
  } catch {
    res.status(500).json({error:'دریافت فهرست مشتریان انجام نشد.'});
  }
});

app.get('/api/admin/reports/summary', adminOnly, async (req,res) => {
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value||'')) && !Number.isNaN(Date.parse(String(value)+'T00:00:00Z'));
  const to = validDate(req.query.to) ? String(req.query.to) : new Date().toISOString().slice(0,10);
  const fromDefault = new Date(Date.now()-29*86400000).toISOString().slice(0,10);
  const from = validDate(req.query.from) ? String(req.query.from) : fromDefault;
  if (from > to) return res.status(400).json({error:'بازه تاریخ گزارش معتبر نیست.'});
  try {
    const summary = await pool.query(`
      WITH paid AS (
        SELECT id,created_at,subtotal_toman,shipping_toman,total_toman
        FROM orders
        WHERE payment_status='verified' AND status<>'cancelled'
          AND created_at >= $1::date AND created_at < ($2::date + INTERVAL '1 day')
      ), item_costs AS (
        SELECT i.order_id,
          SUM(i.line_total_toman)::bigint AS item_revenue,
          SUM(i.cost_price_toman * i.quantity) FILTER (WHERE i.cost_price_toman IS NOT NULL)::bigint AS known_cost,
          COUNT(*) FILTER (WHERE i.cost_price_toman IS NULL)::int AS unknown_cost_items
        FROM order_items i JOIN paid p ON p.id=i.order_id GROUP BY i.order_id
      )
      SELECT COUNT(*)::int AS paid_order_count,
        COALESCE(SUM(p.subtotal_toman),0)::bigint AS product_revenue_toman,
        COALESCE(SUM(p.shipping_toman),0)::bigint AS shipping_collected_toman,
        COALESCE(SUM(p.total_toman),0)::bigint AS total_collected_toman,
        COALESCE(SUM(COALESCE(c.unknown_cost_items,0)),0)::int AS items_without_cost,
        CASE WHEN COALESCE(SUM(COALESCE(c.unknown_cost_items,0)),0)=0
          THEN (COALESCE(SUM(c.item_revenue),0)-COALESCE(SUM(c.known_cost),0))::bigint
          ELSE NULL END AS gross_profit_toman
      FROM paid p LEFT JOIN item_costs c ON c.order_id=p.id
    `,[from,to]);
    const daily = await pool.query(`
      SELECT created_at::date::text AS day,COUNT(*)::int AS paid_orders,
        SUM(total_toman)::bigint AS collected_toman
      FROM orders
      WHERE payment_status='verified' AND status<>'cancelled'
        AND created_at >= $1::date AND created_at < ($2::date + INTERVAL '1 day')
      GROUP BY created_at::date ORDER BY created_at::date
    `,[from,to]);
    res.json({from,to,summary:summary.rows[0],daily:daily.rows});
  } catch(error) {
    console.error('Accounting report failed:',error.message);
    res.status(500).json({error:'گزارش مالی دریافت نشد.'});
  }
});

app.get('/api/admin/reports/errors', adminOnly, async (_req,res) => {
  try {
    const result=await pool.query('SELECT id,level,message,request_method,request_path,response_status,created_at FROM admin_error_logs ORDER BY created_at DESC LIMIT 200');
    res.json(result.rows);
  } catch(error) {
    res.status(500).json({error:'گزارش خطاها دریافت نشد.'});
  }
});

app.patch('/api/admin/customers/:id/status', adminOnly, async (req,res) => {
  const id=String(req.params.id||'');
  const active=req.body?.is_active;
  if(!/^[1-9][0-9]*$/.test(id)||typeof active!=='boolean') return res.status(400).json({error:'شناسه یا وضعیت مشتری معتبر نیست.'});
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const found=await client.query('SELECT id,is_active FROM customers WHERE id=$1 FOR UPDATE',[id]);
    if(!found.rowCount){await client.query('ROLLBACK');return res.status(404).json({error:'مشتری پیدا نشد.'});}
    if(!active){
      const orders=await client.query('SELECT 1 FROM orders WHERE customer_id=$1 LIMIT 1',[id]);
      if(orders.rowCount){await client.query('ROLLBACK');return res.status(409).json({error:'این مشتری سابقه سفارش دارد و قابل غیرفعال‌سازی از این بخش نیست.'});}
      await client.query('DELETE FROM customer_sessions WHERE customer_id=$1',[id]);
    }
    const updated=await client.query('UPDATE customers SET is_active=$1,updated_at=NOW() WHERE id=$2 RETURNING id,is_active',[active,id]);
    await client.query('COMMIT');
    res.json({success:true,customer:updated.rows[0]});
  } catch(error) {
    try{await client.query('ROLLBACK');}catch{}
    res.status(500).json({error:'تغییر وضعیت مشتری انجام نشد.'});
  } finally {client.release();}
});

app.get('/api/admin/orders', adminOnly, async (_req,res) => {
  try {
    const r = await pool.query(`SELECT o.*, COALESCE(json_agg(json_build_object('name',i.product_name,'quantity',i.quantity,'unit_price_toman',i.unit_price_toman)) FILTER (WHERE i.id IS NOT NULL),'[]') items
      FROM orders o LEFT JOIN order_items i ON i.order_id=o.id GROUP BY o.id ORDER BY o.created_at DESC LIMIT 200`);
    res.json(r.rows);
  } catch {
    res.status(500).json({error:'خطا در دریافت سفارش‌ها'});
  }
});

app.patch('/api/admin/orders/:id/status', adminOnly, async (req,res) => {
  const id = String(req.params.id || '');
  const next = req.body.status;

  if (!/^[1-9][0-9]*$/.test(id) ||
      !['awaiting_payment','paid','preparing','shipped','completed','cancelled'].includes(next)) {
    return res.status(400).json({error:'شناسه یا وضعیت سفارش نامعتبر است.'});
  }

  let client;

  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const found = await client.query(
      'SELECT id,status,payment_status,payment_method,payment_provider FROM orders WHERE id=$1 FOR UPDATE',
      [id]
    );

    if (!found.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({error:'سفارش پیدا نشد.'});
    }

    const current = found.rows[0].status;

    const transitions = {
      awaiting_payment: ['paid','cancelled'],
      paid: ['preparing'],
      preparing: ['shipped'],
      shipped: ['completed'],
      completed: [],
      cancelled: []
    };

    if (!transitions[current] || !transitions[current].includes(next)) {
      throw new Error('تغییر وضعیت از حالت فعلی مجاز نیست.');
    }

    if (next === 'paid') {
      const payment = found.rows[0];
      // A ZarinPal payment can only become paid after the provider callback verifies it.
      // Manual card-to-card orders remain confirmable by the store administrator.
      if (payment.payment_provider === 'zarinpal' || payment.payment_method === 'zarinpal') {
        throw new Error('پرداخت زرین‌پال فقط پس از تأیید مستقیم درگاه قابل نهایی‌شدن است.');
      }
      if (payment.payment_status === 'verified') {
        throw new Error('وضعیت تأیید پرداخت با وضعیت سفارش سازگار نیست؛ بررسی دستی لازم است.');
      }
      await client.query(
        "UPDATE orders SET status='paid',payment_status='verified',payment_verified_at=NOW(),updated_at=NOW() WHERE id=$1",
        [id]
      );
    } else {
      await client.query(
        'UPDATE orders SET status=$1,updated_at=NOW() WHERE id=$2',
        [next,id]
      );
    }

    if (next === 'cancelled') {
      const items = await client.query(
        'SELECT product_id,quantity FROM order_items WHERE order_id=$1',
        [id]
      );

      for (const item of items.rows) {
        if (item.product_id) {
          await client.query(
            'UPDATE products SET stock=stock+$1,updated_at=NOW() WHERE id=$2',
            [item.quantity,item.product_id]
          );
        }
      }
    }

    await client.query('COMMIT');
    res.json({success:true,status:next});
  } catch (e) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch {}
    }
    const conflict = [
      'تغییر وضعیت از حالت فعلی مجاز نیست.',
      'پرداخت زرین‌پال فقط پس از تأیید مستقیم درگاه قابل نهایی‌شدن است.',
      'وضعیت تأیید پرداخت با وضعیت سفارش سازگار نیست؛ بررسی دستی لازم است.'
    ].includes(e.message);
    res.status(conflict ? 409 : 503)
      .json({error:conflict ? e.message : 'به‌روزرسانی سفارش انجام نشد.'});
  } finally {
    if (client) client.release();
  }
});


function validateProduct(p) {
  const name = String(p.name ?? '').trim();
  const sku = String(p.sku ?? '').trim();
  const description = String(p.description ?? '');
  const image = String(p.image_url ?? '').trim();
  const price = Number(p.price_toman);
  const stock = Number(p.stock);
  const category = p.category_id === null || p.category_id === '' || p.category_id === undefined
    ? null : Number(p.category_id);
  const sale = p.sale_price_toman === null || p.sale_price_toman === '' || p.sale_price_toman === undefined
    ? null : Number(p.sale_price_toman);

  if (!name || name.length > 180) throw new Error('نام محصول باید بین ۱ تا ۱۸۰ نویسه باشد.');
  if (sku.length > 40) throw new Error('کد کالا بیش از حد طولانی است.');
  if (description.length > 5000) throw new Error('توضیحات محصول بیش از حد طولانی است.');
  if (!Number.isSafeInteger(price) || price < 0) throw new Error('قیمت محصول معتبر نیست.');
  if (!Number.isInteger(stock) || stock < 0 || stock > 2147483647) throw new Error('موجودی محصول معتبر نیست.');
  if (category !== null && (!Number.isSafeInteger(category) || category < 1)) throw new Error('دسته‌بندی معتبر نیست.');
  if (sale !== null && (!Number.isSafeInteger(sale) || sale < 0 || sale >= price)) {
    throw new Error('قیمت تخفیفی باید از قیمت اصلی کمتر باشد.');
  }

  if (image) {
    if (image.length > 2048) throw new Error('نشانی تصویر بیش از حد طولانی است.');
    if (/^\/uploads\/products\/[a-f0-9]{32}\.(jpg|png|webp)$/.test(image)) {
      // تصویر بارگذاری‌شده در فضای فایل سرور
    } else {
      let url;
      try { url = new URL(image); } catch { throw new Error('نشانی تصویر معتبر نیست.'); }
      if (url.protocol !== 'https:' || !url.hostname) {
        throw new Error('نشانی تصویر باید با HTTPS شروع شود.');
      }
    }
  }

  if (p.is_active !== undefined && typeof p.is_active !== 'boolean') {
    throw new Error('وضعیت فعال‌بودن محصول معتبر نیست.');
  }

  const cost = p.cost_price_toman === null || p.cost_price_toman === '' || p.cost_price_toman === undefined ? null : Number(p.cost_price_toman);
  if(cost!==null && (!Number.isSafeInteger(cost)||cost<0)) throw new Error('قیمت خرید محصول معتبر نیست.');
  return {
    cost_price_toman:cost,
    sku: sku || null,
    name,
    category_id: category,
    description,
    price_toman: price,
    sale_price_toman: sale,
    stock,
    image_url: image,
    is_active: p.is_active === undefined ? true : p.is_active
  };
}

async function validateCategory(client, categoryId) {
  if (categoryId === null) return;
  const result = await client.query(
    'SELECT id FROM categories WHERE id=$1 AND is_active=true',
    [categoryId]
  );
  if (!result.rowCount) throw new Error('دسته‌بندی انتخاب‌شده معتبر یا فعال نیست.');
}

app.post('/api/admin/uploads/product', adminOnly, express.json({ limit: '9mb' }), async (req, res) => {
  try {
    const mime = String(req.body?.mime_type || '');
    const encoded = String(req.body?.image_base64 || '');
    if (!['image/jpeg','image/png','image/webp'].includes(mime) ||
        !encoded || encoded.length > 7 * 1024 * 1024 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
      return res.status(400).json({error:'فایل تصویر معتبر نیست یا بیش از حد بزرگ است.'});
    }
    const buffer = Buffer.from(encoded, 'base64');
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(413).json({error:'حجم عکس باید حداکثر ۵ مگابایت باشد.'});
    }
    const signatures = {
      'image/jpeg': buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
      'image/png': buffer.length > 8 && buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
      'image/webp': buffer.length > 12 && buffer.toString('ascii',0,4) === 'RIFF' && buffer.toString('ascii',8,12) === 'WEBP'
    };
    if (!signatures[mime]) return res.status(400).json({error:'محتوای فایل با نوع تصویر اعلام‌شده مطابقت ندارد.'});
    const extension = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[mime];
    const filename = crypto.randomBytes(16).toString('hex') + '.' + extension;
    const directory = path.join(__dirname, '../uploads/products');
    await fs.mkdir(directory, {recursive:true});
    await fs.writeFile(path.join(directory, filename), buffer, {flag:'wx'});
    res.status(201).json({image_url:'/uploads/products/' + filename});
  } catch (error) {
    console.error('Product image upload failed:', error && error.message ? error.message : error);
    res.status(500).json({error:'ذخیره عکس محصول انجام نشد. گزارش خطا در ترمینال سرور ثبت شد.'});
  }
});

app.get('/api/admin/products', adminOnly, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.id,p.sku,p.name,p.category_id,p.description,
              p.price_toman,p.sale_price_toman,p.cost_price_toman,p.stock,p.image_url,
              p.is_active,p.created_at,p.updated_at,
              c.name AS category_name
       FROM products p
       LEFT JOIN categories c ON c.id=p.category_id
       ORDER BY p.created_at DESC
       LIMIT 500`
    );
    res.json(result.rows);
  } catch {
    res.status(500).json({error:'دریافت فهرست محصولات انجام نشد.'});
  }
});

app.post('/api/admin/products', adminOnly, async (req, res) => {
  let client;
  try {
    const p = validateProduct(req.body || {});
    client = await pool.connect();
    await validateCategory(client, p.category_id);

    const result = await client.query(
      `INSERT INTO products
       (sku,name,category_id,description,price_toman,sale_price_toman,cost_price_toman,stock,image_url,is_active)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,name,sku,category_id,description,price_toman,sale_price_toman,cost_price_toman,stock,image_url,is_active`,
      [p.sku,p.name,p.category_id,p.description,p.price_toman,
       p.sale_price_toman,p.cost_price_toman,p.stock,p.image_url,p.is_active]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    const known = e.message && (
      e.message.includes('محصول') ||
      e.message.includes('قیمت') ||
      e.message.includes('موجودی') ||
      e.message.includes('کد کالا') ||
      e.message.includes('دسته‌بندی') ||
      e.message.includes('توضیحات') ||
      e.message.includes('نشانی') ||
      e.message.includes('وضعیت')
    );
    res.status(known ? 400 : 409).json({
      error: known ? e.message : 'محصول ثبت نشد؛ احتمالاً کد کالا تکراری است یا خطای پایگاه داده رخ داده است.'
    });
  } finally {
    if (client) client.release();
  }
});

app.patch('/api/admin/products/:id', adminOnly, async (req, res) => {
  const id = String(req.params.id || '');
  if (!/^[1-9][0-9]*$/.test(id)) {
    return res.status(400).json({error:'شناسه محصول معتبر نیست.'});
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const found = await client.query(
      'SELECT * FROM products WHERE id=$1 FOR UPDATE',
      [id]
    );
    if (!found.rowCount) throw new Error('محصول پیدا نشد.');

    const current = found.rows[0];
    const allowed = [
      'sku','name','category_id','description','price_toman',
      'sale_price_toman','cost_price_toman','stock','image_url','is_active'
    ];
    const merged = {};

    for (const field of allowed) {
      merged[field] = Object.prototype.hasOwnProperty.call(req.body || {}, field)
        ? req.body[field] : current[field];
    }

    const p = validateProduct(merged);
    await validateCategory(client, p.category_id);

    const result = await client.query(
      `UPDATE products SET
       sku=$1,name=$2,category_id=$3,description=$4,price_toman=$5,
       sale_price_toman=$6,cost_price_toman=$7,stock=$8,image_url=$9,is_active=$10,updated_at=NOW()
       WHERE id=$11
       RETURNING id,name,sku,category_id,description,price_toman,sale_price_toman,cost_price_toman,stock,image_url,is_active`,
      [p.sku,p.name,p.category_id,p.description,p.price_toman,
       p.sale_price_toman,p.cost_price_toman,p.stock,p.image_url,p.is_active,id]
    );

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (e) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch {}
    }
    const known = e.message && (
      e.message.includes('محصول') ||
      e.message.includes('قیمت') ||
      e.message.includes('موجودی') ||
      e.message.includes('کد کالا') ||
      e.message.includes('دسته‌بندی') ||
      e.message.includes('توضیحات') ||
      e.message.includes('نشانی') ||
      e.message.includes('وضعیت')
    );
    res.status(e.message === 'محصول پیدا نشد.' ? 404 : known ? 400 : 409)
      .json({error:known || e.message === 'محصول پیدا نشد.'
        ? e.message : 'ویرایش محصول انجام نشد.'});
  } finally {
    if (client) client.release();
  }
});

app.delete('/api/admin/products/:id', adminOnly, async (req, res) => {
  const id = String(req.params.id || '');
  if (!/^[1-9][0-9]*$/.test(id)) {
    return res.status(400).json({error:'شناسه محصول معتبر نیست.'});
  }
  try {
    const result = await pool.query(
      'UPDATE products SET is_active=false,updated_at=NOW() WHERE id=$1 RETURNING id',
      [id]
    );
    if (!result.rowCount) return res.status(404).json({error:'محصول پیدا نشد.'});
    res.json({success:true});
  } catch {
    res.status(500).json({error:'غیرفعال‌سازی محصول انجام نشد.'});
  }
});

// Unknown API and upload paths must return machine-readable 404s, never the storefront HTML.
app.use('/api', (_req, res) => res.status(404).json({ error: 'مسیر API پیدا نشد.' }));
app.use('/uploads', (_req, res) => res.status(404).json({ error: 'فایل موردنظر پیدا نشد.' }));

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error && error.type === 'entity.too.large') {
    return res.status(413).json({error:'حجم درخواست یا عکس بیش از حد مجاز است. حجم عکس را به حداکثر ۵ مگابایت کاهش دهید.'});
  }
  console.error('Unhandled request error:', error && error.message ? error.message : error);
  const status = Number(error?.status) >= 400 && Number(error?.status) <= 599 ? Number(error.status) : 500;
  return res.status(status >= 500 ? 500 : 400).json({error:'در پردازش درخواست خطایی رخ داد. دوباره تلاش کنید.'});
});

app.get('*', (_req,res) => res.sendFile(path.join(__dirname,'../../frontend/index.html')));

const server = app.listen(port, '0.0.0.0', () => console.log(`AVELORA running on ${port}`));
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; shutting down AVELORA gracefully...`);
  server.close(async () => {
    try {
      await pool.end();
      process.exit(0);
    } catch (error) {
      console.error('Database pool shutdown failed:', error && error.message ? error.message : error);
      process.exit(1);
    }
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
