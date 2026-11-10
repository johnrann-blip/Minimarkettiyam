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
let adminSessionCookie = null;
let managerUsername = null;

function assert(condition, message) {
  if (!condition) throw new Error('FAIL: ' + message);
  console.log('PASS: ' + message);
}

async function request(path, options = {}) {
  const {admin, ...fetchOptions} = options;
  const headers = { 'content-type': 'application/json', ...(fetchOptions.headers || {}) };
  if (admin) {
    headers['x-admin-request'] = '1';
    if (adminSessionCookie) headers.cookie = adminSessionCookie;
  }
  const response = await fetch(BASE + path, {
    ...fetchOptions,
    headers,
    body: fetchOptions.body ? JSON.stringify(fetchOptions.body) : undefined
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
  await db.query(membershipMigration);
  const adminMigration = await fs.readFile(path.join(__dirname, '../../database/migrations/008_admin_auth.sql'), 'utf8');
  await db.query(adminMigration);
  const advertisingMigration = await fs.readFile(path.join(__dirname, '../../database/migrations/009_advertising.sql'), 'utf8');
  await db.query(advertisingMigration);
  await db.query('DELETE FROM advertising_events');
  await db.query('DELETE FROM advertising_campaigns');
  await db.query('DELETE FROM advertising_requests');
  await db.query("UPDATE advertising_packages SET pricing_model='custom',rate_toman=NULL,is_active=TRUE");
  await db.query('DELETE FROM admin_sessions');
  await db.query('DELETE FROM admin_audit_logs');
  await db.query('DELETE FROM admin_users');
  await waitForServer();

  let staticResponse = await fetch(BASE + '/admin/');
  const adminHtml = await staticResponse.text();
  assert(staticResponse.status === 200 && adminHtml.includes('noindex,nofollow'), 'بارگذاری پنل مدیریت با جلوگیری از ایندکس موتورهای جست‌وجو');
  staticResponse = await fetch(BASE + '/');
  const storefrontHtml = await staticResponse.text();
  assert(storefrontHtml.includes('homeAdSlot') && storefrontHtml.includes('categoryAdSlot') && storefrontHtml.includes('/advertising.html'), 'وجود جایگاه‌های تبلیغاتی و مسیر همکاری در صفحه اصلی');
  assert(staticResponse.status === 200 && storefrontHtml.includes('name="description"') &&
    staticResponse.headers.get('x-content-type-options') === 'nosniff',
    'بارگذاری فروشگاه همراه با توضیحات SEO و هدر امنیتی nosniff');
  staticResponse = await fetch(BASE + '/assistant.js');
  assert(staticResponse.status === 200 && (await staticResponse.text()).includes('راهنمای خرید AVELORA'), 'بارگذاری دستیار رایگان راهنمای خرید');
  staticResponse = await fetch(BASE + '/advertising.html');
  assert(staticResponse.status === 200 && (await staticResponse.text()).includes('درخواست تبلیغات'), 'بارگذاری صفحه عمومی معرفی و ثبت درخواست تبلیغات');
  staticResponse = await fetch(BASE + '/advertising.js');
  assert(staticResponse.status === 200, 'بارگذاری فرم ثبت درخواست تبلیغات');
  staticResponse = await fetch(BASE + '/admin/advertising.html');
  assert(staticResponse.status === 200 && (await staticResponse.text()).includes('noindex,nofollow'), 'بارگذاری صفحه مدیریت تبلیغات بدون ایندکس موتور جست‌وجو');
  staticResponse = await fetch(BASE + '/admin/advertising.js');
  assert(staticResponse.status === 200, 'بارگذاری ابزار مدیریت کمپین‌های تبلیغاتی');
  staticResponse = await fetch(BASE + '/admin/admin.js');
  assert(staticResponse.status === 200, 'بارگذاری JavaScript پنل مدیریت');
  staticResponse = await fetch(BASE + '/admin/admin.css');
  assert(staticResponse.status === 200, 'بارگذاری CSS پنل مدیریت');

  let r = await request('/api/admin/auth/status');
  assert(r.status === 200 && r.data.setup_required === true, 'تشخیص نیاز به راه‌اندازی اولیه حساب مالک');
  r = await request('/api/admin/auth/bootstrap', {
    method:'POST',
    headers:{'x-admin-request':'1'},
    body:{admin_api_key:KEY,username:'owner',display_name:'مالک آزمایشی',password:'TestOwnerPassword123'}
  });
  assert(r.status === 201 && r.data.admin.role === 'owner' && !!r.cookie, 'ساخت حساب مالک و ایجاد نشست امن');
  adminSessionCookie = r.cookie;
  r = await request('/api/advertising/packages');
  assert(r.status===200 && r.data.length===3, 'نمایش سه جایگاه تبلیغاتی فعال برای عموم');
  const adPackage=r.data.find(x=>x.placement==='home_banner');
  assert(!!adPackage, 'وجود جایگاه بنر صفحه اصلی');
  r = await request('/api/advertising/requests',{method:'POST',body:{
    advertiser_name:'آزمایش‌کننده تبلیغ',business_name:'برند آزمایشی',phone:'09121234567',
    email:'ads@example.com',industry:'کیف و اکسسوری',package_id:adPackage.id,duration_days:7,
    creative_url:'https://example.com/ad.jpg',target_url:'https://example.com/',message:'درخواست آزمایشی'
  }});
  assert(r.status===201 && r.data.success && r.data.request.status==='pending' && !!r.data.request.request_code, 'ثبت عمومی درخواست تبلیغات بدون انتشار خودکار');
  const adRequestId=r.data.request.id;
  r = await request('/api/admin/advertising/requests');
  assert(r.status===401, 'محافظت از درخواست‌های تبلیغاتی در برابر دسترسی غیرمجاز');
  r = await request('/api/admin/advertising/packages',{admin:true});
  assert(r.status===200 && r.data.some(x=>x.id===adPackage.id), 'دسترسی مالک به مدیریت تعرفه‌ها');
  r = await request('/api/admin/advertising/packages/'+adPackage.id,{method:'PATCH',admin:true,body:{pricing_model:'daily',rate_toman:50000,is_active:true}});
  assert(r.status===200 && Number(r.data.rate_toman)===50000, 'تنظیم تعرفه روزانه جایگاه توسط مالک');
  r = await request('/api/advertising/requests',{method:'POST',body:{
    advertiser_name:'مشتری دوم',business_name:'برند قیمت‌دار',phone:'09121111111',
    package_id:adPackage.id,duration_days:7
  }});
  assert(r.status===201 && Number(r.data.request.quote_toman)===350000 && r.data.request.status==='quoted', 'محاسبه خودکار قیمت بر اساس تعرفه روزانه و مدت کمپین');
  const quotedRequestId=r.data.request.id;
  r = await request('/api/admin/advertising/requests/'+quotedRequestId,{method:'PATCH',admin:true,body:{status:'approved',payment_status:'unpaid',quote_toman:350000,admin_notes:'تأیید آزمایشی'}});
  assert(r.status===200 && r.data.status==='approved', 'تأیید درخواست و ثبت مبلغ نهایی');
  r = await request('/api/admin/advertising/requests/'+quotedRequestId+'/campaign',{method:'POST',admin:true,body:{
    title:'تبلیغ برند آزمایشی',image_url:'https://example.com/ad.jpg',target_url:'https://example.com/',
    starts_at:new Date(Date.now()-60000).toISOString(),ends_at:new Date(Date.now()+7*86400000).toISOString()
  }});
  assert(r.status===409, 'جلوگیری از انتشار کمپین پیش از تأیید دریافت وجه');
  r = await request('/api/admin/advertising/requests/'+quotedRequestId,{method:'PATCH',admin:true,body:{status:'approved',payment_status:'paid',quote_toman:350000,admin_notes:'وجه در آزمون تأیید شد'}});
  assert(r.status===200 && r.data.payment_status==='paid', 'ثبت پرداخت پس از بررسی مدیر');
  r = await request('/api/admin/advertising/requests/'+quotedRequestId+'/campaign',{method:'POST',admin:true,body:{
    title:'تبلیغ برند آزمایشی',image_url:'https://example.com/ad.jpg',target_url:'https://example.com/',
    starts_at:new Date(Date.now()-60000).toISOString(),ends_at:new Date(Date.now()+7*86400000).toISOString()
  }});
  assert(r.status===201 && !!r.data.id, 'انتشار کمپین فقط پس از تأیید و پرداخت');
  const adCampaignId=r.data.id;
  r = await request('/api/advertising/campaigns/home_banner');
  assert(r.status===200 && r.data.some(x=>x.id===adCampaignId), 'نمایش کمپین پرداخت‌شده در جایگاه عمومی');
  const adClick=await fetch(BASE+'/api/advertising/click/'+adCampaignId,{redirect:'manual'});
  assert(adClick.status===302 && adClick.headers.get('location')==='https://example.com/', 'ثبت کلیک و هدایت به مقصد امن تبلیغ');
  r = await request('/api/admin/advertising/campaigns',{admin:true});
  const trackedAd = Array.isArray(r.data) ? r.data.find(x=>String(x.id)===String(adCampaignId)) : null;
  assert(r.status===200 && !!trackedAd && Number(trackedAd.impressions)>=1 && Number(trackedAd.clicks)>=1, 'ثبت آمار نمایش و کلیک کمپین');
  r = await request('/api/admin/auth/me', {headers:{cookie:adminSessionCookie}});
  assert(r.status === 200 && r.data.admin.username === 'owner', 'بازیابی حساب مالک از نشست کوکی');
  r = await request('/api/admin/auth/login', {
    method:'POST',headers:{'x-admin-request':'1'},
    body:{username:'owner',password:'WrongOwnerPassword123'}
  });
  assert(r.status === 401, 'رد رمز عبور اشتباه مدیر');
  r = await request('/api/admin/auth/login', {
    method:'POST',headers:{'x-admin-request':'1'},
    body:{username:'owner',password:'TestOwnerPassword123'}
  });
  assert(r.status === 200 && !!r.cookie, 'ورود مدیر با رمز صحیح و صدور نشست جدید');
  adminSessionCookie = r.cookie;

  managerUsername = 'manager_' + crypto.randomBytes(4).toString('hex');
  r = await request('/api/admin/auth/managers', {method:'POST',admin:true,body:{
    username:managerUsername,display_name:'مدیر آزمایشی',password:'TestManagerPassword123',
    permissions:['orders.view']
  }});
  assert(r.status===201 && r.data.username===managerUsername, 'ساخت حساب مدیر با مجوزهای محدود');
  r = await request('/api/admin/auth/login', {method:'POST',headers:{'x-admin-request':'1'},body:{
    username:managerUsername,password:'TestManagerPassword123'
  }});
  assert(r.status===200 && r.data.admin.role==='manager' && !!r.cookie, 'ورود مدیر دوم با حساب مستقل');
  const ownerSessionCookie = adminSessionCookie;
  adminSessionCookie = r.cookie;
  r = await request('/api/admin/orders',{admin:true});
  assert(r.status===200 && Array.isArray(r.data), 'دسترسی مدیر محدود به مشاهده سفارش‌ها');
  r = await request('/api/admin/products',{admin:true});
  assert(r.status===403, 'جلوگیری از دسترسی مدیر به محصولات بدون مجوز');
  r = await request('/api/admin/advertising/packages',{admin:true});
  assert(r.status===403, 'محدودماندن مدیریت قراردادها و درآمد تبلیغات به مالک فروشگاه');
  r = await request('/api/admin/store-settings',{admin:true});
  assert(r.status===403, 'جلوگیری از مشاهده اطلاعات بانکی و تنظیمات حساس توسط مدیر فاقد مجوز');
  adminSessionCookie = ownerSessionCookie;
  r = await request('/api/admin/auth/managers',{method:'POST',admin:true,body:{username:'unsafe_settings',display_name:'مدیر نامعتبر',password:'TestManagerPassword123',permissions:['settings.view']}});
  assert(r.status===400, 'جلوگیری از اعطای مجوز تنظیمات حساس به مدیر');

  r = await request('/api/admin/uploads/product', {
    method: 'POST',
    body: { mime_type: 'image/png', image_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=' }
  });
  assert(r.status === 403, 'رد آپلود بدون سربرگ معتبر درخواست پنل مدیریت');

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
  assert(r.status === 201 && r.data.discount_percent === 0 && !!r.cookie, 'ثبت‌نام مشتری بدون تخفیف خودکار');
  memberSessionCookie = r.cookie;
  r = await request('/api/auth/me', {headers:{cookie:memberSessionCookie}});
  assert(r.status === 200 && r.data.customer && r.data.customer.phone === memberPhone && r.data.discount_percent === 0, 'بازیابی نشست مشتری بدون تخفیف خودکار');
  r = await request('/api/admin/customers');
  assert(r.status===401, 'محافظت از فهرست مشتریان در برابر دسترسی غیرمجاز');
  r = await request('/api/admin/customers',{admin:true});
  assert(r.status===200 && Array.isArray(r.data) && r.data.some(x=>x.phone===memberPhone), 'نمایش مشتری ثبت‌نام‌شده در پنل مدیریت');
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
  assert(r.status === 401, 'رد دسترسی مدیر بدون نشست معتبر');

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
    sku:SKU+'-MEMBER',name:'محصول آزمایشی بدون تخفیف خودکار',category_id:categoryId,
    description:'آزمون عدم تخفیف خودکار',price_toman:12000,sale_price_toman:null,
    cost_price_toman:7000,stock:5,image_url:'',is_active:true
  }});
  assert(r.status===201 && r.data.id && Number(r.data.cost_price_toman)===7000, 'ثبت بهای تمام‌شده محصول برای کنترل حاشیه سود');
  memberProductId=r.data.id;
  r=await request('/api/products');
  assert(r.status===200 && Number(r.data.find(p=>String(p.id)===String(memberProductId)).sale_price_toman||12000)===12000, 'نمایش قیمت عادی برای مشتری مهمان');
  r=await request('/api/products',{headers:{cookie:memberSessionCookie}});
  const memberProduct=r.data.find(p=>String(p.id)===String(memberProductId));
  assert(r.status===200 && memberProduct.sale_price_toman===null && memberProduct.member_discount_toman===undefined, 'عدم اعمال تخفیف خودکار حتی برای مشتری عضو');


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
      nationwide_shipping_toman: 10000,
      footer_about: 'معرفی آزمایشی AVELORA',
      footer_support_phone: '02112345678',
      footer_support_email: 'support@example.com',
      footer_instagram_url: 'https://instagram.com/avelora.test',
      footer_whatsapp_phone: '989121234567',
      footer_bale_url: 'https://ble.ir/avelora_test',
      footer_telegram_url: 'https://t.me/avelora_test',
      footer_address: 'نشانی آزمایشی',
      footer_hours: 'شنبه تا پنجشنبه ۹ تا ۱۷',
      policy_terms: 'قوانین خرید آزمایشی',
      policy_privacy: 'حریم خصوصی آزمایشی',
      policy_shipping: 'شرایط ارسال آزمایشی',
      policy_returns: 'شرایط مرجوعی آزمایشی'
    }
  });
  assert(r.status === 200 && r.data.success === true, 'ذخیره تنظیمات معتبر فروشگاه و سیاست‌ها');

  r = await request('/api/store-settings');
  assert(r.status === 200 && r.data.payment_enabled === true &&
    r.data.card_number === '1111222233334444' &&
    r.data.footer_instagram_url === 'https://instagram.com/avelora.test' &&
    r.data.footer_whatsapp_phone === '989121234567' &&
    r.data.footer_bale_url === 'https://ble.ir/avelora_test' &&
    r.data.footer_about === 'معرفی آزمایشی AVELORA', 'نمایش تنظیمات تماس و شبکه‌های اجتماعی در فوتر عمومی');

  r = await request('/api/store-policies');
  assert(r.status === 200 &&
    r.data.policy_terms === 'قوانین خرید آزمایشی' &&
    r.data.policy_privacy === 'حریم خصوصی آزمایشی' &&
    r.data.policy_shipping === 'شرایط ارسال آزمایشی' &&
    r.data.policy_returns === 'شرایط مرجوعی آزمایشی',
    'نمایش عمومی سیاست‌های منتشرشده فروشگاه');

  r = await request('/api/admin/store-settings', { admin: true });
  assert(r.status === 200 &&
    Number(r.data.local_shipping_toman) === 5000 &&
    Number(r.data.nationwide_shipping_toman) === 10000 &&
    r.data.footer_support_email === 'support@example.com' &&
    r.data.footer_hours === 'شنبه تا پنجشنبه ۹ تا ۱۷' &&
    r.data.policy_terms === 'قوانین خرید آزمایشی' &&
    r.data.policy_privacy === 'حریم خصوصی آزمایشی' &&
    r.data.policy_shipping === 'شرایط ارسال آزمایشی' &&
    r.data.policy_returns === 'شرایط مرجوعی آزمایشی',
    'دریافت تنظیمات فوتر و صفحات راهنما در پنل مدیریت');

  const memberOrderKey=crypto.randomUUID();
  const memberOrderPayload={
    customer:{name:'عضو آزمایشی',phone:memberPhone,city:'اصفهان',province:'اصفهان',address:'نشانی عضو آزمایشی',postal_code:''},
    items:[{product_id:memberProductId,quantity:1}],
    delivery_method:'local',
    note:'آزمون عدم تخفیف خودکار'
  };
  r=await request('/api/orders',{method:'POST',headers:{'Idempotency-Key':memberOrderKey,cookie:memberSessionCookie},body:memberOrderPayload});
  assert(r.status===201 && Number(r.data.subtotal_toman)===12000 && Number(r.data.membership_discount_toman)===0 && Number(r.data.total_toman)===17000,
    'ثبت سفارش مشتری عضو با قیمت عادی و بدون تخفیف خودکار');
  memberOrderCode=r.data.order_code;


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

  r = await request('/api/admin/auth/logout', {method:'POST',admin:true,body:{}});
  assert(r.status === 200, 'خروج مدیر و ابطال نشست');
  r = await request('/api/admin/products');
  assert(r.status === 401, 'رد درخواست پس از خروج مدیر');

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
      await db.query('DELETE FROM advertising_events');
      await db.query('DELETE FROM advertising_campaigns');
      await db.query('DELETE FROM advertising_requests');
      await db.query("UPDATE advertising_packages SET pricing_model='custom',rate_toman=NULL,is_active=TRUE");
      await db.query('DELETE FROM admin_sessions');
      await db.query('DELETE FROM admin_audit_logs');
      await db.query('DELETE FROM admin_users');
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
