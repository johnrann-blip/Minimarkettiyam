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
  DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgresql://u0_a289@127.0.0.1:5432/minimarkettiyam_test',
  ADMIN_API_KEY: KEY,
  ZARINPAL_ENABLED: 'false',
  ZARINPAL_MODE: 'sandbox',
  PUBLIC_BASE_URL: ''
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
let uploadedImageUrl = null;
let secondProductId = null;
let memberProductId = null;
let memberSessionCookie = null;
let memberOrderCode = null;
let memberPhone = null;
let adminCookie = '';

function assert(condition, message) {
  if (!condition) throw new Error('FAIL: ' + message);
  console.log('PASS: ' + message);
}

async function request(path, options = {}) {
  const headers = { 'content-type': 'application/json', ...(options.headers || {}) };
  if (options.admin) { headers['x-admin-request'] = '1'; if (adminCookie) headers.cookie = adminCookie; }

  const response = await fetch(BASE + path, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  let data = {};
  try { data = await response.json(); } catch {}
  return { status: response.status, data, cookie: response.headers.get('set-cookie') };
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
  const membershipMigration = await fs.readFile(path.join(__dirname, '../../database/migrations/004_customer_membership.sql'), 'utf8');
  const adminMigration = await fs.readFile(path.join(__dirname, '../../database/migrations/005_admin_rbac.sql'), 'utf8');
  const accountingMigration = await fs.readFile(path.join(__dirname, '../../database/migrations/006_accounting_error_center.sql'), 'utf8');
  await db.query(membershipMigration);
  await db.query(adminMigration);
  await db.query(accountingMigration);
  await db.query('DELETE FROM admin_users');
  await waitForServer();

  const bootstrap = await request('/api/admin/auth/bootstrap', {
    method:'POST', headers:{'x-admin-request':'1'},
    body:{admin_api_key:KEY,username:'owner',display_name:'مالک آزمون',password:'Owner-Test-Password-2026!'}
  });
  assert(bootstrap.status===201 && bootstrap.data.admin.role==='owner' && bootstrap.cookie,
    'ساخت یک‌باره حساب مالک و ایجاد نشست امن');
  adminCookie = bootstrap.cookie.split(';')[0];

  const denied = await request('/api/admin/products');
  assert(denied.status===401,'جلوگیری از دسترسی مدیریتی بدون نشست معتبر');

  const managerCreated = await request('/api/admin/auth/managers',{
    method:'POST',admin:true,
    body:{username:'orders.manager',display_name:'مدیر سفارش‌ها',password:'Manager-Test-Password-2026!',permissions:['orders.view']}
  });
  assert(managerCreated.status===201,'ساخت مدیر فرعی با مجوز محدود توسط مالک');
  const ownerCookie=adminCookie;
  const managerLogin=await request('/api/admin/auth/login',{
    method:'POST',headers:{'x-admin-request':'1'},
    body:{username:'orders.manager',password:'Manager-Test-Password-2026!'}
  });
  assert(managerLogin.status===200 && managerLogin.cookie,'ورود مستقل مدیر فرعی');
  adminCookie=managerLogin.cookie.split(';')[0];
  const forbiddenProducts=await request('/api/admin/products',{admin:true});
  assert(forbiddenProducts.status===403,'جلوگیری از مشاهده محصولات توسط مدیر فاقد مجوز');
  const allowedOrders=await request('/api/admin/orders',{admin:true});
  assert(allowedOrders.status===200,'اجازه مشاهده سفارش‌ها برای مدیر دارای مجوز');
  adminCookie=ownerCookie;
  const auditRows=await request('/api/admin/auth/audit',{admin:true});
  assert(auditRows.status===200 && auditRows.data.some(x=>x.action==='admin.login'),'ثبت و نمایش رویدادهای ورود و فعالیت مدیران');
  const managerDisabled=await request('/api/admin/auth/managers/'+managerCreated.data.id,{
    method:'PATCH',admin:true,body:{is_active:false}
  });
  assert(managerDisabled.status===200,'غیرفعال‌سازی مدیر فرعی توسط مالک');
  adminCookie=managerLogin.cookie.split(';')[0];
  const revoked=await request('/api/admin/orders',{admin:true});
  assert(revoked.status===401,'ابطال فوری نشست‌های مدیر غیرفعال‌شده');
  adminCookie=ownerCookie;

  const restrictedSettingsManager=await request('/api/admin/auth/managers',{
    method:'POST',admin:true,
    body:{username:'settings.legacy',display_name:'مدیر تنظیمات محدود',password:'Manager-Settings-Test-2026!',permissions:['settings.view','settings.update']}
  });
  assert(restrictedSettingsManager.status===201,'ساخت مدیر با مجوزهای تنظیمات غیرحساس');
  const restrictedSettingsLogin=await request('/api/admin/auth/login',{
    method:'POST',headers:{'x-admin-request':'1'},
    body:{username:'settings.legacy',password:'Manager-Settings-Test-2026!'}
  });
  assert(restrictedSettingsLogin.status===200 && restrictedSettingsLogin.cookie,'ورود مدیر تنظیمات محدود');
  adminCookie=restrictedSettingsLogin.cookie.split(';')[0];
  const hiddenPaymentDetails=await request('/api/admin/store-settings',{admin:true});
  assert(hiddenPaymentDetails.status===403,'جلوگیری از مشاهده اطلاعات بانکی بدون مجوز مستقل پرداخت');
  const blockedPaymentChange=await request('/api/admin/store-settings',{
    method:'PATCH',admin:true,body:{payment_enabled:true}
  });
  assert(blockedPaymentChange.status===403,'جلوگیری از تغییر تنظیمات پرداخت بدون مجوز مستقل');
  adminCookie=ownerCookie;
  const paymentViewer=await request('/api/admin/auth/managers',{
    method:'POST',admin:true,
    body:{username:'payment.viewer',display_name:'مشاهده‌گر پرداخت',password:'Manager-Payment-Test-2026!',permissions:['payments.view']}
  });
  assert(paymentViewer.status===201,'ساخت مدیر با مجوز مستقل مشاهده پرداخت');
  const paymentViewerLogin=await request('/api/admin/auth/login',{
    method:'POST',headers:{'x-admin-request':'1'},
    body:{username:'payment.viewer',password:'Manager-Payment-Test-2026!'}
  });
  assert(paymentViewerLogin.status===200 && paymentViewerLogin.cookie,'ورود مشاهده‌گر پرداخت');
  adminCookie=paymentViewerLogin.cookie.split(';')[0];
  const paymentRead=await request('/api/admin/store-settings',{admin:true});
  assert(paymentRead.status===200,'اجازه مشاهده اطلاعات پرداخت با مجوز مستقل');
  const paymentWriteDenied=await request('/api/admin/store-settings',{method:'PATCH',admin:true,body:{}});
  assert(paymentWriteDenied.status===403,'جلوگیری از تغییر اطلاعات پرداخت برای مشاهده‌گر صرف');
  adminCookie=ownerCookie;

  let staticResponse = await fetch(BASE + '/admin/');
  const adminHtml = await staticResponse.text();
  assert(staticResponse.status === 200 && adminHtml.includes('noindex,nofollow'), 'بارگذاری پنل مدیریت با جلوگیری از ایندکس موتورهای جست‌وجو');
  staticResponse = await fetch(BASE + '/');
  const storefrontHtml = await staticResponse.text();
  assert(staticResponse.status === 200 && storefrontHtml.includes('name="description"') &&
    staticResponse.headers.get('x-content-type-options') === 'nosniff',
    'بارگذاری فروشگاه همراه با توضیحات SEO و هدر امنیتی nosniff');
  staticResponse = await fetch(BASE + '/assistant.js');
  assert(staticResponse.status === 200 && (await staticResponse.text()).includes('راهنمای خرید AVELORA'), 'بارگذاری دستیار رایگان راهنمای خرید');
  staticResponse = await fetch(BASE + '/admin/admin.js');
  assert(staticResponse.status === 200, 'بارگذاری JavaScript پنل مدیریت');
  staticResponse = await fetch(BASE + '/admin/admin.css');
  assert(staticResponse.status === 200, 'بارگذاری CSS پنل مدیریت');

  let r = await request('/api/admin/uploads/product', {
    method: 'POST',
    headers: { 'x-admin-request': '1' },
    body: { mime_type: 'image/png', image_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=' }
  });
  assert(r.status === 401, 'جلوگیری از آپلود عکس بدون کلید مدیر');

  r = await request('/api/unknown-endpoint');
  assert(r.status === 404 && typeof r.data.error === 'string', 'پاسخ JSON استاندارد برای مسیر API ناشناخته');

  const missingUpload = await fetch(BASE + '/uploads/does-not-exist.png');
  const missingUploadBody = await missingUpload.json();
  assert(missingUpload.status === 404 && typeof missingUploadBody.error === 'string',
    'پاسخ ۴۰۴ استاندارد برای فایل آپلودی ناموجود');

  r = await request('/api/admin/uploads/product', {
    method: 'POST',
    admin: true,
    body: { mime_type: 'image/png', image_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=' }
  });
  assert(r.status === 201 && typeof r.data.image_url === 'string' &&
    r.data.image_url.startsWith('/uploads/products/') && r.data.image_url.endsWith('.png'),
    'آپلود امن عکس محصول با کلید مدیر');
  uploadedImageFile = path.basename(r.data.image_url);
  uploadedImageUrl = r.data.image_url;

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

  r = await request('/api/payments/zarinpal/status');
  assert(r.status === 200 && r.data.provider === 'zarinpal' && r.data.enabled === false, 'درگاه زرین‌پال به‌صورت پیش‌فرض خاموش است');

  r = await request('/api/payments/zarinpal/request', {method:'POST',body:{order_code:'MM123456789ABCD',phone:'09120000000'}});
  assert(r.status === 503, 'جلوگیری از ساخت پرداخت آنلاین تا زمان پیکربندی درگاه');

  r = await request('/api/health');
  assert(r.status === 200 && r.data.status === 'ok', 'سلامت API و اتصال دیتابیس');

  memberPhone = '0912' + String(crypto.randomInt(1000000,9999999));
  r = await request('/api/auth/register', {method:'POST',body:{name:'عضو آزمایشی',phone:memberPhone,password:'TestMemberPass123'}});
  assert(r.status === 201 && r.data.discount_percent === 5 && !!r.cookie, 'ثبت‌نام مشتری و ایجاد نشست عضویت با تخفیف ۵ درصد');
  memberSessionCookie = r.cookie;
  r = await request('/api/auth/me', {headers:{cookie:memberSessionCookie}});
  assert(r.status === 200 && r.data.customer && r.data.customer.phone === memberPhone, 'بازیابی امن وضعیت ورود مشتری');
  r = await request('/api/admin/customers');
  assert(r.status===401, 'محافظت از فهرست مشتریان در برابر دسترسی غیرمجاز');
  r = await request('/api/admin/customers',{admin:true});
  assert(r.status===200 && Array.isArray(r.data) && r.data.some(x=>x.phone===memberPhone), 'نمایش مشتری ثبت‌نام‌شده در پنل مدیریت');
  const noOrderPhone='09'+crypto.randomInt(100000000,999999999).toString();
  const noOrderCustomer=(await db.query("INSERT INTO customers(full_name,phone,password_hash,password_salt) VALUES('مشتری بدون سفارش',$1,$2,$3) RETURNING id",[noOrderPhone,'0'.repeat(128),'0'.repeat(32)])).rows[0];
  const deactivateNoOrder=await request('/api/admin/customers/'+noOrderCustomer.id+'/status',{method:'PATCH',admin:true,body:{is_active:false}});
  assert(deactivateNoOrder.status===200 && deactivateNoOrder.data.customer.is_active===false,'غیرفعال‌سازی برگشت‌پذیر مشتری بدون سفارش');
  const reactivateNoOrder=await request('/api/admin/customers/'+noOrderCustomer.id+'/status',{method:'PATCH',admin:true,body:{is_active:true}});
  assert(reactivateNoOrder.status===200 && reactivateNoOrder.data.customer.is_active===true,'فعال‌سازی دوباره مشتری بدون سفارش');

  r = await request('/api/auth/register',{method:'POST',body:{name:'عضو تکراری',phone:memberPhone,password:'TestMemberPass123'}});
  assert(r.status===409, 'جلوگیری از ثبت‌نام تکراری با یک شماره موبایل');
  r = await request('/api/auth/login', {method:'POST',body:{phone:memberPhone,password:'WrongPassword123'}});
  assert(r.status === 401, 'رد رمز عبور اشتباه مشتری');


  r = await request('/api/categories');
  assert(r.status === 200 && r.data.length >= 3, 'دریافت دسته‌بندی‌ها');
  const bagsCategory = r.data.find(x => x.slug === 'bags-accessories');
  const beautyCategory = r.data.find(x => x.slug === 'beauty');
  assert(!!bagsCategory && !!beautyCategory, 'وجود دسته‌های مستقل کیف و لوازم آرایشی');

  r = await request('/api/admin/products');
  assert(r.status === 401, 'رد دسترسی مدیر بدون کلید');

  r = await request('/api/admin/store-settings');
  assert(r.status === 401, 'رد دسترسی غیرمجاز به تنظیمات بانکی');

  r = await request('/api/store-settings');
  assert(r.status === 200 && r.data.payment_enabled === false &&
    r.data.card_number === '', 'عدم نمایش اطلاعات بانکی هنگام غیرفعال بودن پرداخت');

  r = await request('/api/admin/products', { admin: true });
  assert(r.status === 200 && Array.isArray(r.data), 'دریافت فهرست محصولات مدیر');

  const categoryId = bagsCategory.id;

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
      image_url: uploadedImageUrl,
      is_active: true
    }
  });
  assert(r.status === 201 && r.data.id && r.data.image_url === uploadedImageUrl, 'ثبت محصول همراه با تصویر آپلودشده');
  productId = r.data.id;

  r = await request('/api/admin/products', {
    method: 'POST',
    admin: true,
    body: {
      sku: SKU + '-BEAUTY',
      name: 'نمونه آزمایشی لوازم آرایشی',
      category_id: beautyCategory.id,
      description: 'این محصول فقط برای آزمون دسته‌بندی است.',
      price_toman: 18000,
      sale_price_toman: null,
      stock: 2,
      image_url: '',
      is_active: true
    }
  });
  assert(r.status === 201 && r.data.id, 'ثبت نمونه آزمایشی لوازم آرایشی');
  secondProductId = r.data.id;

  r = await request('/api/admin/products', {method:'POST',admin:true,body:{
    sku:SKU+'-MEMBER',name:'محصول واجد تخفیف عضویت',category_id:categoryId,
    description:'آزمون تخفیف عضویت',price_toman:12000,sale_price_toman:null,
    cost_price_toman:7000,stock:5,image_url:'',is_active:true
  }});
  assert(r.status===201 && r.data.id && Number(r.data.cost_price_toman)===7000, 'ثبت بهای تمام‌شده محصول برای کنترل حاشیه سود');
  memberProductId=r.data.id;
  r=await request('/api/products');
  assert(r.status===200 && Number(r.data.find(p=>String(p.id)===String(memberProductId)).sale_price_toman||12000)===12000, 'نمایش قیمت عادی برای مشتری مهمان');
  r=await request('/api/products',{headers:{cookie:memberSessionCookie}});
  const memberProduct=r.data.find(p=>String(p.id)===String(memberProductId));
  assert(r.status===200 && Number(memberProduct.sale_price_toman)===11400 && Number(memberProduct.member_discount_toman)===600, 'اعمال تخفیف ۵ درصدی عضو فقط بالاتر از قیمت خرید');


  r = await request('/api/products');
  assert(r.status === 200 && r.data.some(p => String(p.id) === String(productId)) && r.data.some(p => String(p.id) === String(secondProductId)), 'نمایش نمونه‌های کیف و لوازم آرایشی در فروشگاه');
  r = await request('/api/products?category=bags-accessories');
  assert(r.status === 200 && r.data.some(p => String(p.id) === String(productId)) && !r.data.some(p => String(p.id) === String(secondProductId)), 'فیلتر مستقل دسته کیف');
  r = await request('/api/products?category=beauty');
  assert(r.status === 200 && r.data.some(p => String(p.id) === String(secondProductId)) && !r.data.some(p => String(p.id) === String(productId)), 'فیلتر مستقل دسته لوازم آرایشی');

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

  const memberOrderKey=crypto.randomUUID();
  const memberOrderPayload={
    customer:{name:'عضو آزمایشی',phone:memberPhone,city:'اصفهان',province:'اصفهان',address:'نشانی عضو آزمایشی',postal_code:''},
    items:[{product_id:memberProductId,quantity:1}],
    delivery_method:'local',
    note:'آزمون تخفیف عضویت'
  };
  r=await request('/api/orders',{method:'POST',headers:{'Idempotency-Key':memberOrderKey,cookie:memberSessionCookie},body:memberOrderPayload});
  assert(r.status===201 && Number(r.data.subtotal_toman)===11400 && Number(r.data.membership_discount_toman)===600 && Number(r.data.total_toman)===16400,
    'محاسبه قطعی تخفیف ۵ درصدی در سمت سرور هنگام ثبت سفارش عضو');
  memberOrderCode=r.data.order_code;

  const memberCostSnapshot=await db.query('SELECT cost_price_toman FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.order_code=$1',[memberOrderCode]);
  assert(memberCostSnapshot.rowCount===1 && Number(memberCostSnapshot.rows[0].cost_price_toman)===7000,'ثبت بهای تمام‌شده در لحظه سفارش برای حسابداری');
  const memberCustomer=(await db.query('SELECT id FROM customers WHERE phone=$1',[memberPhone])).rows[0];
  const linkedMemberOrder=await db.query('SELECT customer_id FROM orders WHERE order_code=$1',[memberOrderCode]);
  assert(linkedMemberOrder.rowCount===1 && Number(linkedMemberOrder.rows[0].customer_id)===Number(memberCustomer.id),'اتصال سفارش عضویت به حساب مشتری');
  const refuseCustomerDeactivate=await request('/api/admin/customers/'+memberCustomer.id+'/status',{method:'PATCH',admin:true,body:{is_active:false}});
  assert(refuseCustomerDeactivate.status===409,'جلوگیری از غیرفعال‌سازی مشتری دارای سابقه سفارش؛ پاسخ '+refuseCustomerDeactivate.status+' '+(refuseCustomerDeactivate.data.error||''));


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
  const accountingReport=await request('/api/admin/reports/summary',{admin:true});
  assert(accountingReport.status===200 && accountingReport.data.summary && Array.isArray(accountingReport.data.daily),'دریافت گزارش مالی با ساختار معتبر');
  const errorReport=await request('/api/admin/reports/errors',{admin:true});
  assert(errorReport.status===200 && Array.isArray(errorReport.data),'دریافت مرکز خطاها');


  // Simulate an order with a pending ZarinPal authority: admin UI must not bypass gateway verification.
  await db.query("UPDATE orders SET payment_method='zarinpal',payment_provider='zarinpal',payment_status='pending',payment_authority='TESTAUTHORITY1234567890' WHERE id=$1", [order.id]);
  r = await request(`/api/admin/orders/${order.id}/status`, {
    method: 'PATCH', admin: true, body: { status: 'paid' }
  });
  assert(r.status === 409, 'جلوگیری از تأیید دستی پرداخت زرین‌پال بدون تأیید درگاه');
  const guardedOrder = await db.query('SELECT status,payment_status FROM orders WHERE id=$1', [order.id]);
  assert(guardedOrder.rows[0].status === 'awaiting_payment' && guardedOrder.rows[0].payment_status === 'pending', 'حفظ وضعیت پرداخت زرین‌پال تا تأیید واقعی');
  await db.query("UPDATE orders SET payment_method='card_to_card',payment_provider=NULL,payment_status='unverified',payment_authority=NULL WHERE id=$1", [order.id]);

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
      if (memberOrderCode) await db.query('DELETE FROM orders WHERE order_code=$1', [memberOrderCode]);
      if (productId) await db.query('DELETE FROM products WHERE id=$1', [productId]);
      if (secondProductId) await db.query('DELETE FROM products WHERE id=$1', [secondProductId]);
      if (memberProductId) await db.query('DELETE FROM products WHERE id=$1', [memberProductId]);
      if (memberSessionCookie) {
        const token=(memberSessionCookie.match(/avelora_session=([^;]+)/)||[])[1];
        if(token) await db.query('DELETE FROM customer_sessions WHERE token_hash=$1',[crypto.createHash('sha256').update(decodeURIComponent(token)).digest('hex')]);
      }
      if (memberPhone) await db.query('DELETE FROM customers WHERE phone=$1',[memberPhone]);
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
