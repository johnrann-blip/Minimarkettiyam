
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
const port = Number(process.env.PORT || 3000);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
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
app.use(express.json({ limit: '7mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), { maxAge: '7d', immutable: true }));
app.use(express.static(path.join(__dirname, '../../frontend')));
app.use('/admin', express.static(path.join(__dirname, '../../admin')));

function adminOnly(req, res, next) {
  const expected = process.env.ADMIN_API_KEY;
  const supplied = req.get('x-admin-key') || '';
  if (!expected || expected.length < 24) return res.status(503).json({ error: 'کلید مدیریت در سرور تنظیم نشده است.' });
  const a = Buffer.from(expected), b = Buffer.from(supplied);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'دسترسی غیرمجاز' });
  next();
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

const orderRateLimit = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: 'تعداد تلاش‌های ثبت سفارش بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.'
});

app.use('/api/admin', adminRateLimit);

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
      `SELECT p.id,p.sku,p.name,p.description,p.price_toman,p.sale_price_toman,p.stock,p.image_url,c.name AS category_name,c.slug AS category_slug
       FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE ${where} ORDER BY p.created_at DESC LIMIT 100`, values);
    res.json(r.rows);
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
  const canonicalRequest = {
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
      `SELECT order_code,subtotal_toman,shipping_toman,total_toman,status,request_hash
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
    if (!settings.payment_enabled) {
      throw new Error('پرداخت فروشگاه هنوز توسط مدیر فعال نشده است.');
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
    const normalized = [];

    for (const [id, qty] of quantities) {
      const result = await client.query(
        'SELECT id,name,price_toman,sale_price_toman,stock FROM products WHERE id=$1 AND is_active=true FOR UPDATE',
        [id]
      );

      if (!result.rowCount) throw new Error('یکی از محصولات دیگر موجود نیست.');

      const product = result.rows[0];
      if (Number(product.stock) < qty) {
        throw new Error('موجودی ' + product.name + ' کافی نیست.');
      }

      const price = Number(product.sale_price_toman ?? product.price_toman);
      const line = price * qty;

      if (!Number.isSafeInteger(price) || price < 0 ||
          !Number.isSafeInteger(line) ||
          !Number.isSafeInteger(subtotal + line)) {
        throw new Error('مبلغ سفارش معتبر نیست.');
      }

      subtotal += line;
      normalized.push({product,qty,price,line});
    }

    const total = subtotal + shipping;
    if (!Number.isSafeInteger(total)) throw new Error('مبلغ سفارش معتبر نیست.');

    const code = orderCode();
    const inserted = await client.query(
      `INSERT INTO orders
       (order_code,customer_name,phone,city,province,address,postal_code,
        delivery_method,subtotal_toman,shipping_toman,total_toman,customer_note,
        idempotency_key,request_hash)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id,order_code,total_toman,status`,
      [code,name,phone,city,province,address,postal,delivery_method,
       subtotal,shipping,total,customerNote,idempotencyKey,requestHash]
    );

    const order = inserted.rows[0];

    for (const x of normalized) {
      await client.query(
        `INSERT INTO order_items
         (order_id,product_id,product_name,unit_price_toman,quantity,line_total_toman)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [order.id,x.product.id,x.product.name,x.price,x.qty,x.line]
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
      'SELECT id,status,payment_status FROM orders WHERE id=$1 FOR UPDATE',
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
      await client.query(
        "UPDATE orders SET status='paid',payment_status='verified',updated_at=NOW() WHERE id=$1",
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
    res.status(e.message === 'تغییر وضعیت از حالت فعلی مجاز نیست.' ? 409 : 503)
      .json({error:e.message === 'تغییر وضعیت از حالت فعلی مجاز نیست.'
        ? e.message : 'به‌روزرسانی سفارش انجام نشد.'});
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

  return {
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

app.post('/api/admin/uploads/product', adminOnly, async (req, res) => {
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
  } catch {
    res.status(500).json({error:'ذخیره عکس محصول انجام نشد.'});
  }
});

app.get('/api/admin/products', adminOnly, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.id,p.sku,p.name,p.category_id,p.description,
              p.price_toman,p.sale_price_toman,p.stock,p.image_url,
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
       (sku,name,category_id,description,price_toman,sale_price_toman,stock,image_url,is_active)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,name,sku,category_id,description,price_toman,sale_price_toman,stock,image_url,is_active`,
      [p.sku,p.name,p.category_id,p.description,p.price_toman,
       p.sale_price_toman,p.stock,p.image_url,p.is_active]
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
      'sale_price_toman','stock','image_url','is_active'
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
       sale_price_toman=$6,stock=$7,image_url=$8,is_active=$9,updated_at=NOW()
       WHERE id=$10
       RETURNING id,name,sku,category_id,description,price_toman,sale_price_toman,stock,image_url,is_active`,
      [p.sku,p.name,p.category_id,p.description,p.price_toman,
       p.sale_price_toman,p.stock,p.image_url,p.is_active,id]
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

app.get('*', (_req,res) => res.sendFile(path.join(__dirname,'../../frontend/index.html')));
app.listen(port, '0.0.0.0', () => console.log(`Minimarkettiyam running on ${port}`));
