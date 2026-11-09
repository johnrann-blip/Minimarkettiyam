const { spawn } = require('child_process');
const { Pool } = require('pg');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const PORT = 3197;
const KEY = crypto.randomBytes(32).toString('hex');
const SKU = 'TEST-' + crypto.randomBytes(6).toString('hex');
const BASE = `http://127.0.0.1:${PORT}`;

const env = {
  ...process.env,
  PORT: String(PORT),
  DATABASE_URL: 'postgresql://u0_a289@127.0.0.1:5432/minimarkettiyam_test',
  ADMIN_API_KEY: KEY
};

const server = spawn(process.execPath, ['src/server.js'], {
  cwd: __dirname + '/..',
  env,
  stdio: 'inherit'
});

const db = new Pool({ connectionString: env.DATABASE_URL });
let productId = null;
let orderCode = null;
let uploadedImageFile = null;

function assert(condition, message) {
  if (!condition) throw new Error('FAIL: ' + message);
  console.log('PASS: ' + message);
}

async function request(path, options = {}) {
  const headers = { 'content-type': 'application/json', ...(options.headers || {}) };
  if (options.admin) headers['x-admin-key'] = KEY;

  const response = await fetch(BASE + path, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  let data = {};
  try { data = await response.json(); } catch {}
  return { status: response.status, data };
}

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(BASE + '/api/health');
      if (r.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Server did not become ready.');
}

async function run() {
  await waitForServer();

  let staticResponse = await fetch(BASE + '/admin/');
  assert(staticResponse.status === 200, 'بارگذاری صفحه پنل مدیریت');
  staticResponse = await fetch(BASE + '/admin/admin.js');
  assert(staticResponse.status === 200, 'بارگذاری JavaScript پنل مدیریت');
  staticResponse = await fetch(BASE + '/admin/admin.css');
  assert(staticResponse.status === 200, 'بارگذاری CSS پنل مدیریت');

  r = await request('/api/admin/uploads/product', {
    method: 'POST',
    body: { mime_type: 'image/png', image_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=' }
  });
  assert(r.status === 401, 'جلوگیری از آپلود عکس بدون کلید مدیر');

  r = await request('/api/admin/uploads/product', {
    method: 'POST',
    admin: true,
    body: { mime_type: 'image/png', image_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=' }
  });
  assert(r.status === 201 && typeof r.data.image_url === 'string' &&
    r.data.image_url.startsWith('/uploads/products/') && r.data.image_url.endsWith('.png'),
    'آپلود امن عکس محصول با کلید مدیر');
  uploadedImageFile = path.basename(r.data.image_url);

  const uploadedImage = await fetch(BASE + r.data.image_url);
  const uploadedBytes = Buffer.from(await uploadedImage.arrayBuffer());
  assert(uploadedImage.status === 200 && uploadedBytes.length > 8 &&
    uploadedBytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
    'نمایش عکس آپلودشده از مسیر عمومی محصولات');

  // فقط دیتابیس آزمایشی؛ هر اجرا از تنظیمات پاک شروع می‌شود.
  await db.query(`
    UPDATE store_settings SET
      bank_name='', card_number='', cardholder_name='', iban='',
      payment_instructions='', payment_enabled=FALSE,
      local_shipping_toman=NULL, nationwide_shipping_toman=NULL
    WHERE id=1
  `);

  let r = await request('/api/health');
  assert(r.status === 200 && r.data.status === 'ok', 'سلامت API و اتصال دیتابیس');

  r = await request('/api/categories');
  assert(r.status === 200 && r.data.length >= 3, 'دریافت دسته‌بندی‌ها');

  r = await request('/api/admin/products');
  assert(r.status === 401, 'رد دسترسی مدیر بدون کلید');

  r = await request('/api/admin/store-settings');
  assert(r.status === 401, 'رد دسترسی غیرمجاز به تنظیمات بانکی');

  r = await request('/api/store-settings');
  assert(r.status === 200 && r.data.payment_enabled === false &&
    r.data.card_number === '', 'عدم نمایش اطلاعات بانکی هنگام غیرفعال بودن پرداخت');

  r = await request('/api/admin/products', { admin: true });
  assert(r.status === 200 && Array.isArray(r.data), 'دریافت فهرست محصولات مدیر');

  const categoryId = r = (await request('/api/categories')).data[0].id;

  r = await request('/api/admin/products', {
    method: 'POST',
    admin: true,
    body: {
      sku: SKU,
      name: 'محصول آزمایشی',
      category_id: categoryId,
      description: 'آزمون یکپارچه',
      price_toman: 12000,
      sale_price_toman: 10000,
      stock: 5,
      image_url: '',
      is_active: true
    }
  });
  assert(r.status === 201 && r.data.id, 'ایجاد محصول');
  productId = r.data.id;

  r = await request('/api/products');
  assert(r.status === 200 && r.data.some(p => String(p.id) === String(productId)), 'نمایش محصول در فروشگاه');

  r = await request(`/api/admin/products/${productId}`, {
    method: 'PATCH',
    admin: true,
    body: { name: 'محصول ویرایش‌شده', price_toman: 15000 }
  });
  assert(r.status === 200 && r.data.name === 'محصول ویرایش‌شده', 'ویرایش محصول');

  r = await request(`/api/admin/products/${productId}`, {
    method: 'PATCH',
    admin: true,
    body: { is_active: false }
  });
  assert(r.status === 200 && r.data.is_active === false, 'غیرفعال‌سازی محصول');

  r = await request('/api/products');
  assert(!r.data.some(p => String(p.id) === String(productId)), 'عدم نمایش محصول غیرفعال');

  r = await request(`/api/admin/products/${productId}`, {
    method: 'PATCH',
    admin: true,
    body: { is_active: true }
  });
  assert(r.status === 200 && r.data.is_active === true, 'فعال‌سازی دوباره محصول');

  r = await request('/api/admin/products', {
    method: 'POST',
    admin: true,
    body: {
      name: 'محصول نامعتبر',
      price_toman: 1000,
      sale_price_toman: 1000,
      stock: 2
    }
  });
  assert(r.status === 400, 'رد قیمت تخفیفی نامعتبر');

  const orderPayload = {
    customer: {
      name: 'مشتری آزمایشی',
      phone: '09120000000',
      city: 'اصفهان',
      province: 'اصفهان',
      address: 'نشانی آزمایشی',
      postal_code: ''
    },
    items: [{ product_id: productId, quantity: 2 }],
    delivery_method: 'local',
    note: 'آزمون'
  };

  r = await request('/api/orders', {
    method: 'POST',
    body: orderPayload
  });
  assert(r.status !== 201, 'جلوگیری از سفارش هنگام غیرفعال بودن پرداخت');

  r = await request('/api/admin/store-settings', {
    method: 'PATCH',
    admin: true,
    body: {
      bank_name: 'بانک آزمایشی',
      card_number: '123',
      cardholder_name: 'کاربر آزمایشی',
      payment_enabled: true,
      local_shipping_toman: 5000,
      nationwide_shipping_toman: 10000
    }
  });
  assert(r.status === 400, 'رد شماره کارت نامعتبر');

  r = await request('/api/admin/store-settings', {
    method: 'PATCH',
    admin: true,
    body: {
      bank_name: 'بانک آزمایشی',
      card_number: '1111222233334444',
      cardholder_name: 'کاربر آزمایشی',
      iban: '',
      payment_instructions: 'اطلاعات صرفاً آزمایشی',
      payment_enabled: true,
      local_shipping_toman: 5000,
      nationwide_shipping_toman: 10000
    }
  });
  assert(r.status === 200 && r.data.success === true, 'ذخیره تنظیمات معتبر فروشگاه');

  r = await request('/api/store-settings');
  assert(r.status === 200 && r.data.payment_enabled === true &&
    r.data.card_number === '1111222233334444', 'نمایش اطلاعات پرداخت فعال برای مشتری');

  r = await request('/api/admin/store-settings', { admin: true });
  assert(r.status === 200 &&
    Number(r.data.local_shipping_toman) === 5000 &&
    Number(r.data.nationwide_shipping_toman) === 10000,
    'دریافت تعرفه‌های ارسال در پنل مدیریت');

  const orderKey = crypto.randomUUID();
  const concurrentOrders = await Promise.all([
    request('/api/orders', {
      method:'POST',
      headers:{'Idempotency-Key':orderKey},
      body:orderPayload
    }),
    request('/api/orders', {
      method:'POST',
      headers:{'Idempotency-Key':orderKey},
      body:orderPayload
    })
  ]);

  assert(
    concurrentOrders.every(x => x.status === 200 || x.status === 201) &&
    concurrentOrders.some(x => x.status === 201) &&
    concurrentOrders.some(x => x.status === 200) &&
    concurrentOrders[0].data.order_code === concurrentOrders[1].data.order_code,
    'جلوگیری از ثبت هم‌زمان سفارش تکراری'
  );

  r = concurrentOrders.find(x => x.status === 201);
  orderCode = r.data.order_code;

  const changedPayload = {
    ...orderPayload,
    note:String(orderPayload.note || '') + ' تغییر'
  };
  const conflict = await request('/api/orders', {
    method:'POST',
    headers:{'Idempotency-Key':orderKey},
    body:changedPayload
  });
  assert(conflict.status === 409, 'رد استفاده مجدد از شناسه با اطلاعات متفاوت');
  assert(Number(r.data.subtotal_toman) === 20000 &&
    Number(r.data.shipping_toman) === 5000 &&
    Number(r.data.total_toman) === 25000,
    'محاسبه صحیح جمع کالا، ارسال و مبلغ نهایی');

  const stock = await db.query('SELECT stock FROM products WHERE id=$1', [productId]);
  assert(Number(stock.rows[0].stock) === 3, 'کسر موجودی پس از ثبت سفارش');

  r = await request('/api/admin/orders', { admin: true });
  assert(r.status === 200 && Array.isArray(r.data), 'نمایش سفارش در پنل مدیریت');

  const order = r.data.find(x => x.order_code === orderCode);
  assert(!!order, 'یافتن سفارش آزمایشی');

  r = await request(`/api/admin/orders/${order.id}/status`, {
    method: 'PATCH',
    admin: true,
    body: { status: 'cancelled' }
  });
  assert(r.status === 200 && r.data.status === 'cancelled', 'لغو سفارش');

  const restored = await db.query('SELECT stock FROM products WHERE id=$1', [productId]);
  assert(Number(restored.rows[0].stock) === 5, 'بازگشت موجودی پس از لغو سفارش');

  r = await request(`/api/admin/orders/${order.id}/status`, {
    method: 'PATCH',
    admin: true,
    body: { status: 'cancelled' }
  });
  assert(r.status === 409, 'جلوگیری از لغو تکراری سفارش');

  r = await request(`/api/admin/orders/${order.id}/status`, {
    method: 'PATCH',
    admin: true,
    body: { status: 'paid' }
  });
  assert(r.status === 409, 'جلوگیری از تغییر سفارش لغوشده به پرداخت‌شده');

  console.log('\nALL INTEGRATION TESTS PASSED');
}

(async () => {
  try {
    await run();
  } catch (error) {
    console.error('\nINTEGRATION TEST FAILED:', error.message);
    process.exitCode = 1;
  } finally {
    try {
      if (uploadedImageFile) {
        await fs.unlink(path.join(__dirname, '..', 'uploads', 'products', uploadedImageFile)).catch(() => {});
      }
      if (orderCode) await db.query('DELETE FROM orders WHERE order_code=$1', [orderCode]);
      if (productId) await db.query('DELETE FROM products WHERE id=$1', [productId]);
    } catch (error) {
      console.error('Test cleanup warning:', error.message);
      process.exitCode = 1;
    }

    try {
      await db.query(`
        UPDATE store_settings SET
          bank_name='', card_number='', cardholder_name='', iban='',
          payment_instructions='', payment_enabled=FALSE,
          local_shipping_toman=NULL, nationwide_shipping_toman=NULL
        WHERE id=1
      `);
    } catch (error) {
      console.error('Settings cleanup warning:', error.message);
      process.exitCode = 1;
    }

    await db.end();
    server.kill('SIGTERM');
  }
})();
