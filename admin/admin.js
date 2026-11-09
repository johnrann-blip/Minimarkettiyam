const $ = s => document.querySelector(s);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  })[c]);
}

let adminUser = null;
const ALL_ADMIN_PERMISSIONS = [
  'products.view','products.create','products.update','products.archive',
  'orders.view','orders.update','customers.view','customers.manage','payments.view','payments.manage',
  'accounting.view','accounting.manage','reports.view','audit.view'
];
const PERMISSION_LABELS = {
  'products.view':'مشاهده محصولات','products.create':'ثبت محصول','products.update':'ویرایش محصول',
  'products.archive':'بایگانی محصول','orders.view':'مشاهده سفارش‌ها','orders.update':'تغییر وضعیت سفارش',
  'customers.view':'مشاهده مشتریان','customers.manage':'غیرفعال‌سازی مشتری بدون سفارش','payments.view':'مشاهده اطلاعات بانکی و پرداخت','payments.manage':'مدیریت اطلاعات بانکی و پرداخت',
  'accounting.view':'مشاهده دفتر هزینه‌ها','accounting.manage':'ثبت هزینه‌های فروشگاه','reports.view':'گزارش‌ها','audit.view':'سوابق فعالیت'
};
function adminCan(permission) {
  if (!adminUser) return false;
  if (adminUser.role === 'owner') return true;
  const permissions=adminUser.permissions || [];
  if (permissions.includes(permission)) return true;
  if (permission.endsWith('.view')) {
    const prefix=permission.slice(0,-5);
    return [prefix+'.create',prefix+'.update',prefix+'.archive'].some(x=>permissions.includes(x)) || (permission==='payments.view' && permissions.includes('payments.manage')) || (permission==='customers.view' && permissions.includes('customers.manage')) || (permission==='accounting.view' && permissions.includes('accounting.manage'));
  }
  return false;
}
function headers() {
  return {'Content-Type':'application/json','x-admin-request':'1'};
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials:'same-origin',
    headers: {...headers(), ...(options.headers || {})}
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data.error || 'درخواست انجام نشد.') + ' (کد ' + response.status + ')');
  return data;
}

function message(text) {
  $('#msg').textContent = text;
}

async function loadManagers() {
  try {
    const managers = await request('/api/admin/auth/managers');
    $('#managerList').innerHTML = managers.map(manager => `
      <div class="order manager-card" data-manager-id="${escapeHtml(manager.id)}">
        <b>${escapeHtml(manager.display_name)} — @${escapeHtml(manager.username)}</b>
        <p>آخرین ورود: ${manager.last_login_at ? new Date(manager.last_login_at).toLocaleString('fa-IR') : 'هنوز وارد نشده'}</p>
        <label class="setting-check"><input class="manager-active" type="checkbox" ${manager.is_active ? 'checked' : ''}> حساب فعال باشد</label>
        <input class="manager-password" type="password" minlength="12" placeholder="رمز جدید مدیر (اختیاری؛ حداقل ۱۲ نویسه)">
        <div class="permission-grid">
          ${ALL_ADMIN_PERMISSIONS.map(permission => `
            <label><input class="manager-permission" type="checkbox" value="${permission}" ${(manager.permissions || []).includes(permission) ? 'checked' : ''}> ${PERMISSION_LABELS[permission]}</label>
          `).join('')}
        </div>
        <button type="button" data-manager-save="${escapeHtml(manager.id)}">ذخیره دسترسی‌های این مدیر</button>
      </div>
    `).join('') || 'هنوز مدیر دیگری تعریف نشده است.';
  } catch(error) { $('#managerList').textContent = error.message; }
}
$('#managerForm').onsubmit = async event => {
  event.preventDefault();
  const form=event.currentTarget;
  const data=Object.fromEntries(new FormData(form).entries());
  data.permissions=Array.from(form.querySelectorAll('[name="permissions"]:checked')).map(x=>x.value);
  try {
    await request('/api/admin/auth/managers',{method:'POST',body:JSON.stringify(data)});
    form.reset();
    message('حساب مدیر ساخته شد. اطلاعات ورود را امن به خودش تحویل بده.');
    await loadManagers();
  } catch(error) { message(error.message); }
};
$('#managerList').addEventListener('click',async event=>{
  const button=event.target.closest('[data-manager-save]');
  if(!button) return;
  const card=button.closest('[data-manager-id]');
  const permissions=Array.from(card.querySelectorAll('.manager-permission:checked')).map(x=>x.value);
  const is_active=card.querySelector('.manager-active').checked;
  const password=card.querySelector('.manager-password').value;
  const update={permissions,is_active};
  if(password) update.password=password;
  try {
    await request('/api/admin/auth/managers/'+encodeURIComponent(button.dataset.managerSave),{
      method:'PATCH',body:JSON.stringify(update)
    });
    message('دسترسی مدیر ذخیره شد؛ در صورت تغییر رمز یا غیرفعال‌سازی، نشست‌های قبلی او باطل می‌شوند.');
    await loadManagers();
  } catch(error) { message(error.message); }
});
async function loadReports() {
  const from=$('#reportFrom').value,to=$('#reportTo').value;
  const query=new URLSearchParams();
  if(from)query.set('from',from);
  if(to)query.set('to',to);
  try{
    const queryString=query.toString();
    const data=await request('/api/admin/reports/summary'+(queryString?'?'+queryString:''));
    const x=data.summary||{};
    const money=value=>BigInt(String(value||0)).toLocaleString('fa-IR')+' تومان';
    const profit=x.gross_profit_toman===null?'قابل محاسبه نیست؛ بهای تمام‌شده '+Number(x.items_without_cost||0).toLocaleString('fa-IR')+' قلم ثبت نشده است.':money(x.gross_profit_toman);
    const net=x.net_profit_toman===null?'قابل محاسبه نیست':money(x.net_profit_toman);
    $('#reportSummary').innerHTML=`
      <div class="order"><b>بازه گزارش: ${escapeHtml(data.from)} تا ${escapeHtml(data.to)}</b>
      <p>تعداد سفارش‌های پرداخت‌شده: ${Number(x.paid_order_count||0).toLocaleString('fa-IR')}</p>
      <p>فروش کالا پس از تخفیف: ${money(x.product_revenue_toman)}</p>
      <p>هزینه ارسال دریافت‌شده: ${money(x.shipping_collected_toman)}</p>
      <p><b>کل مبلغ وصول‌شده: ${money(x.total_collected_toman)}</b></p>
      <p>سود ناخالص کالا: ${escapeHtml(profit)}</p><p>هزینه‌های ثبت‌شده: ${money(x.expenses_toman)}</p><p><b>مانده پس از هزینه‌های ثبت‌شده: ${escapeHtml(net)}</b></p></div>`;
    $('#reportDaily').innerHTML=(data.daily||[]).map(day=>`<div class="order"><b>${escapeHtml(day.day)}</b><p>تعداد سفارش: ${Number(day.paid_orders).toLocaleString('fa-IR')} | وصولی: ${money(day.collected_toman)}</p></div>`).join('')||'در این بازه پرداخت تأییدشده‌ای ثبت نشده است.';
  }catch(error){$('#reportSummary').textContent=error.message;}
  await loadAdminErrors();
}
async function loadExpenses(){
  const query=new URLSearchParams();
  if($('#reportFrom').value)query.set('from',$('#reportFrom').value);
  if($('#reportTo').value)query.set('to',$('#reportTo').value);
  const qs=query.toString();
  try{
    const data=await request('/api/admin/accounting/expenses'+(qs?'?'+qs:''));
    const money=value=>Number(value||0).toLocaleString('fa-IR')+' تومان';
    $('#accountingExpenses').innerHTML=(data.expenses||[]).map(expense=>`<div class="order"><b>${escapeHtml(expense.category)}</b><p>${escapeHtml(expense.expense_date)} — ${money(expense.amount_toman)}</p><p>${escapeHtml(expense.description)}</p></div>`).join('')||'هزینه‌ای در این بازه ثبت نشده است.';
  }catch(error){$('#accountingExpenses').textContent=error.message;}
}
$('#expenseForm').onsubmit=async event=>{
  event.preventDefault();
  const form=event.currentTarget;
  const data=Object.fromEntries(new FormData(form).entries());
  data.amount_toman=Number(data.amount_toman);
  try{
    await request('/api/admin/accounting/expenses',{method:'POST',body:JSON.stringify(data)});
    form.reset();
    message('هزینه ثبت شد؛ ردیف‌های حسابداری حذف نمی‌شوند و اصلاح با ثبت ردیف اصلاحی انجام می‌شود.');
    await loadExpenses();
    if(adminCan('reports.view'))await loadReports();
  }catch(error){message(error.message);}
};
$('#refreshExpenses').onclick=loadExpenses;

async function loadAdminErrors(){
  try{
    const rows=await request('/api/admin/reports/errors');
    $('#adminErrors').innerHTML=rows.map(row=>`<div class="order"><b>${escapeHtml(row.level)} — HTTP ${escapeHtml(row.response_status)}</b><p>${escapeHtml(row.message)}</p><p>${escapeHtml(row.request_method)} ${escapeHtml(row.request_path)}</p><p class="muted">${new Date(row.created_at).toLocaleString('fa-IR')}</p></div>`).join('')||'خطای ثبت‌شده‌ای وجود ندارد.';
  }catch(error){$('#adminErrors').textContent=error.message;}
}
$('#refreshReports').onclick=()=>{if(adminCan('reports.view'))loadReports();if(adminCan('accounting.view')||adminCan('accounting.manage'))loadExpenses();};
$('#refreshErrors').onclick=loadAdminErrors;

async function loadAudit() {
  try {
    const rows=await request('/api/admin/auth/audit');
    $('#auditLogs').innerHTML=rows.map(row=>`
      <div class="order">
        <b>${escapeHtml(row.username || 'حساب حذف‌شده')} — ${escapeHtml(row.action)}</b>
        <p>بخش: ${escapeHtml(row.resource)} | مسیر: ${escapeHtml(row.request_path)}</p>
        <p>روش: ${escapeHtml(row.request_method)} | نتیجه: ${escapeHtml(row.response_status)}</p>
        <p class="muted">${new Date(row.created_at).toLocaleString('fa-IR')}</p>
      </div>
    `).join('') || 'هنوز فعالیتی ثبت نشده است.';
    if(adminUser?.role==='owner')await loadActiveSessions();
  } catch(error) { $('#auditLogs').textContent=error.message; }
}
async function loadActiveSessions(){
  try{
    const rows=await request('/api/admin/auth/sessions');
    $('#activeSessions').innerHTML=rows.map(row=>`<div class="order"><b>${escapeHtml(row.display_name)} — @${escapeHtml(row.username)}</b><p>IP: ${escapeHtml(row.ip_address||'نامشخص')}</p><p>آخرین فعالیت: ${new Date(row.last_seen_at).toLocaleString('fa-IR')}</p><p>انقضا: ${new Date(row.expires_at).toLocaleString('fa-IR')}</p></div>`).join('')||'نشست فعال دیگری وجود ندارد.';
  }catch(error){$('#activeSessions').textContent=error.message;}
}
$('#refreshSessions').onclick=loadActiveSessions;
$('#refreshAudit').onclick=loadAudit;

async function categories() {
  try {
    const data = await fetch('/api/categories').then(r => r.json());
    if (!Array.isArray(data)) throw new Error();
    $('#cat').innerHTML =
      '<option value="">بدون دسته</option>' +
      data.map(x =>
        `<option value="${escapeHtml(x.id)}">${escapeHtml(x.name)}</option>`
      ).join('');
  } catch {
    message('دریافت دسته‌بندی‌ها انجام نشد.');
  }
}

function resetProductForm() {
  $('#productForm').reset();
  $('#imagePreview').hidden = true;
  $('#imagePreview').removeAttribute('src');
  $('#productForm [name="id"]').value = '';
  $('#formTitle').textContent = 'افزودن محصول';
  $('#submitProduct').textContent = 'ثبت محصول';
  $('#submitProduct').hidden = !adminCan('products.create');
  $('#cancelEdit').hidden = true;
}

$('#cancelEdit').onclick = resetProductForm;

// Show immediate feedback even if browser validation prevents form submission.
$('#submitProduct').addEventListener('click', () => {
  message('دکمه ذخیره انتخاب شد؛ در حال بررسی اطلاعات محصول...');
});

$('#imageFile').addEventListener('change', () => {
  const file = $('#imageFile').files[0];
  if (!file) return;
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    message('عکس باید JPG، PNG یا WebP و حداکثر ۵ مگابایت باشد.');
    $('#imageFile').value = '';
    return;
  }
  $('#imagePreview').src = URL.createObjectURL(file);
  $('#imagePreview').hidden = false;
  message('عکس انتخاب شد و پیش‌نمایش آن آماده است. برای آپلود و ذخیره عکس، دکمه «ذخیره تغییرات» را بزن.');
});

function showAdminPage(page) {
  const sections=Array.from(document.querySelectorAll('#adminWorkspace section[data-page]'));
  const allowedPages=new Set(sections.filter(x=>x.dataset.allowed==='true').map(x=>x.dataset.page));
  if(!allowedPages.has(page)) page=allowedPages.values().next().value || '';
  sections.forEach(section=>{section.hidden=section.dataset.page!==page || section.dataset.allowed!=='true';});
  document.querySelectorAll('[data-nav-page]').forEach(button=>{
    button.hidden=!allowedPages.has(button.dataset.navPage);
    button.classList.toggle('active',button.dataset.navPage===page);
  });
}
document.querySelectorAll('[data-nav-page]').forEach(button=>{
  button.addEventListener('click',()=>showAdminPage(button.dataset.navPage));
});
function setAdminSession(admin) {
  adminUser = admin || null;
  $('#adminAuth').hidden = Boolean(adminUser);
  $('#adminWorkspace').hidden = !adminUser;
  if (!adminUser) {
    document.body.classList.remove('admin-authenticated');
    return;
  }
  document.body.classList.add('admin-authenticated');
  $('#adminIdentity').textContent = 'واردشده: ' + adminUser.display_name + ' (' + (adminUser.role === 'owner' ? 'مالک فروشگاه' : 'مدیر') + ')';
  const sectionAccess = {
    managerSection:adminUser.role==='owner',
    auditSection:adminCan('audit.view'),
    reportsSection:adminCan('reports.view') || adminCan('accounting.view') || adminCan('accounting.manage'),
    productFormSection:adminCan('products.create') || adminCan('products.update'),
    productsSection:adminCan('products.view'),
    archiveSection:adminCan('products.archive') || adminCan('products.view'),
    settingsSection:adminCan('payments.view') || adminCan('payments.manage'),
    customersSection:adminCan('customers.view') || adminCan('customers.manage'),
    ordersSection:adminCan('orders.view') || adminCan('orders.update')
  };
  for (const section of document.querySelectorAll('#adminWorkspace section[data-page]')) {
    section.dataset.allowed = String(Boolean(sectionAccess[section.id]));
  }
  const pageAccess = {};
  for (const section of document.querySelectorAll('#adminWorkspace section[data-page]')) {
    if (section.dataset.allowed==='true') pageAccess[section.dataset.page]=true;
  }
  showAdminPage(pageAccess.products?'products':Object.keys(pageAccess)[0]);
  for (const field of $('#settingsForm').elements) field.disabled = !adminCan('payments.manage');
  $('#expenseForm').hidden = !adminCan('accounting.manage');
  $('#activeSessionsSection').hidden = adminUser.role!=='owner';
  $('#financialReportsSection').hidden = !adminCan('reports.view');
  $('#expenseLedgerSection').hidden = !(adminCan('accounting.view') || adminCan('accounting.manage'));
  resetProductForm();
  Promise.all([
    adminCan('products.create') || adminCan('products.update') ? categories() : Promise.resolve(),
    adminCan('products.view') || adminCan('products.create') || adminCan('products.update') ? products() : Promise.resolve(),
    adminCan('orders.view') ? orders() : Promise.resolve(),
    adminCan('customers.view') || adminCan('customers.manage') ? customers() : Promise.resolve(),
    adminCan('payments.view') || adminCan('payments.manage') ? loadStoreSettings() : Promise.resolve(),
    adminUser.role === 'owner' ? loadManagers() : Promise.resolve(),
    adminCan('audit.view') ? loadAudit() : Promise.resolve(),
    adminCan('reports.view') ? loadReports() : Promise.resolve(),
    adminCan('accounting.view') || adminCan('accounting.manage') ? loadExpenses() : Promise.resolve()
  ]);
}
async function initializeAdminAuth() {
  try {
    const status = await fetch('/api/admin/auth/status').then(r => r.json());
    $('#bootstrapBox').hidden = !status.setup_required;
    $('#loginBox').hidden = status.setup_required;
    const me = await fetch('/api/admin/auth/me').then(async r => {
      if (!r.ok) return null;
      return r.json();
    });
    if (me && me.admin) setAdminSession(me.admin);
  } catch {
    $('#authMessage').textContent = 'ارتباط با سرور مدیریت برقرار نشد؛ وضعیت سرور را بررسی کن.';
  }
}
$('#bootstrapForm').onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  $('#authMessage').textContent = 'در حال ساخت حساب مالک...';
  try {
    const result = await request('/api/admin/auth/bootstrap',{method:'POST',body:JSON.stringify(data)});
    form.reset();
    setAdminSession(result.admin);
    $('#authMessage').textContent = 'حساب مالک ساخته شد. کلید راه‌اندازی دیگر برای ورود روزانه لازم نیست.';
  } catch(error) { $('#authMessage').textContent = error.message; }
};
$('#loginForm').onsubmit = async event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  $('#authMessage').textContent = 'در حال بررسی اطلاعات ورود...';
  try {
    const result = await request('/api/admin/auth/login',{method:'POST',body:JSON.stringify(data)});
    event.currentTarget.reset();
    setAdminSession(result.admin);
    $('#authMessage').textContent = 'ورود موفق بود.';
  } catch(error) { $('#authMessage').textContent = error.message; }
};
$('#logoutAdmin').onclick = async () => {
  try { await request('/api/admin/auth/logout',{method:'POST',body:'{}'}); }
  finally { setAdminSession(null); $('#loginBox').hidden=false; $('#bootstrapBox').hidden=true; }
};

$('#productForm').onsubmit = async event => {
  event.preventDefault();

  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  const imageFile = form.elements.image_file.files[0];
  delete data.image_file;
  const id = data.id;
  delete data.id;

  data.price_toman = Number(data.price_toman);
  data.cost_price_toman = data.cost_price_toman === '' ? null : Number(data.cost_price_toman);
  data.stock = Number(data.stock);
  data.category_id = data.category_id ? Number(data.category_id) : null;
  data.sale_price_toman =
    data.sale_price_toman === '' ? null : Number(data.sale_price_toman);

  const editing = Boolean(id);

  const submitButton = $('#submitProduct');
  submitButton.disabled = true;
  submitButton.textContent = imageFile ? 'در حال آپلود عکس و ذخیره...' : 'در حال ذخیره...';
  message(imageFile ? 'در حال آپلود عکس؛ لطفاً صفحه را نبند...' : 'در حال ذخیره محصول...');

  try {
    if (imageFile) {
      if (!['image/jpeg','image/png','image/webp'].includes(imageFile.type)) {
        throw new Error('فقط تصویر JPG، PNG یا WebP قابل قبول است.');
      }
      if (imageFile.size > 5 * 1024 * 1024) {
        throw new Error('حجم عکس باید حداکثر ۵ مگابایت باشد.');
      }
      const imageBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = () => reject(new Error('خواندن عکس انجام نشد.'));
        reader.readAsDataURL(imageFile);
      });
      const uploaded = await request('/api/admin/uploads/product', {
        method: 'POST',
        body: JSON.stringify({ image_base64: imageBase64, mime_type: imageFile.type })
      });
      data.image_url = uploaded.image_url;
    }

    await request(
      editing ? `/api/admin/products/${encodeURIComponent(id)}` : '/api/admin/products',
      {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(data)
      }
    );

    message(editing ? 'محصول ویرایش شد.' : 'محصول ثبت شد.');
    resetProductForm();
    await products();
  } catch (error) {
    message('ذخیره محصول انجام نشد: ' + error.message);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = editing ? 'ذخیره تغییرات' : 'ثبت محصول';
  }
};

function isProductActive(product) {
  return product.is_active === true || product.is_active === 'true' || product.is_active === 1;
}

function renderProductCard(p, archived = false) {
  const active = isProductActive(p);
  return `
    <div class="order">
      <b>${escapeHtml(p.name)}</b>
      <p>شناسه: ${escapeHtml(p.id)} | کد کالا: ${escapeHtml(p.sku || 'ندارد')}</p>
      <p>قیمت فروش: ${Number(p.price_toman).toLocaleString('fa-IR')} تومان</p>
      <p>قیمت خرید: ${p.cost_price_toman === null || p.cost_price_toman === undefined ? 'ثبت نشده' : Number(p.cost_price_toman).toLocaleString('fa-IR') + ' تومان'}</p>
      <p>تخفیف: ${p.sale_price_toman === null ? 'ندارد' : Number(p.sale_price_toman).toLocaleString('fa-IR') + ' تومان'}</p>
      <p>موجودی: ${Number(p.stock).toLocaleString('fa-IR')}</p>
      <p>دسته: ${escapeHtml(p.category_name || 'بدون دسته')}</p>
      <p>وضعیت: ${active ? 'فعال' : 'بایگانی‌شده'}</p>
      <div class="product-actions">
        ${archived
          ? (adminCan('products.archive') ? `<button type="button" data-restore="${escapeHtml(p.id)}" data-name="${escapeHtml(p.name)}">فعال‌سازی مجدد</button>` : '')
          : `
            ${adminCan('products.update') ? `<button type="button" data-edit="${escapeHtml(p.id)}">ویرایش محصول</button>` : ''}
            ${adminCan('products.archive') ? `<button type="button" data-toggle="${escapeHtml(p.id)}" data-active="1">غیرفعال‌کردن</button><button type="button" data-remove="${escapeHtml(p.id)}" data-name="${escapeHtml(p.name)}">انتقال به بایگانی</button>` : ''}
          `}
      </div>
    </div>
  `;
}

async function products() {
  try {
    const data = await request('/api/admin/products');
    if (!Array.isArray(data)) throw new Error('پاسخ فهرست محصولات معتبر نیست.');
    const activeProducts = data.filter(isProductActive);
    const archivedProducts = data.filter(p => !isProductActive(p));

    $('#products').innerHTML = activeProducts.map(p => renderProductCard(p)).join('')
      || 'محصول فعالی ثبت نشده است.';
    $('#archivedProducts').innerHTML = archivedProducts.map(p => renderProductCard(p, true)).join('')
      || 'بایگانی خالی است.';
    $('#archivedProductsCount').textContent = `(${archivedProducts.length.toLocaleString('fa-IR')})`;
  } catch (error) {
    $('#products').textContent = error.message;
    $('#archivedProducts').textContent = error.message;
  }
}

$('#products').addEventListener('click', async event => {
  const editButton = event.target.closest('[data-edit]');
  const toggleButton = event.target.closest('[data-toggle]');
  const removeButton = event.target.closest('[data-remove]');

  if (removeButton) {
    const id = removeButton.dataset.remove;
    const name = removeButton.dataset.name || 'این محصول';
    if (!confirm(`«${name}» به بایگانی محصولات منتقل شود؟ اطلاعات و سوابق سفارش‌ها حفظ می‌شوند.`)) return;
    try {
      await request(`/api/admin/products/${encodeURIComponent(id)}`, {method:'DELETE'});
      message('محصول به بایگانی منتقل شد؛ سوابق آن حفظ شده است.');
      await products();
    } catch (error) {
      message(error.message);
    }
    return;
  }

  if (editButton) {
    try {
      const data = await request('/api/admin/products');
      const p = data.find(x => String(x.id) === editButton.dataset.edit);
      if (!p) throw new Error('محصول پیدا نشد.');

      const form = $('#productForm');
      form.elements.id.value = p.id;
      form.elements.name.value = p.name || '';
      form.elements.category_id.value = p.category_id ?? '';
      form.elements.sku.value = p.sku || '';
      form.elements.price_toman.value = p.price_toman;
      form.elements.cost_price_toman.value = p.cost_price_toman ?? '';
      form.elements.sale_price_toman.value = p.sale_price_toman ?? '';
      form.elements.stock.value = p.stock;
      form.elements.image_url.value = p.image_url || '';
      if (p.image_url) {
        $('#imagePreview').src = p.image_url;
        $('#imagePreview').hidden = false;
      } else {
        $('#imagePreview').hidden = true;
        $('#imagePreview').removeAttribute('src');
      }
      form.elements.image_file.value = '';
      form.elements.description.value = p.description || '';

      $('#formTitle').textContent = 'ویرایش محصول';
      $('#submitProduct').textContent = 'ذخیره تغییرات';
      $('#cancelEdit').hidden = false;
      $('#submitProduct').hidden = !adminCan('products.update');
      form.scrollIntoView({behavior:'smooth', block:'start'});
      message('اطلاعات محصول برای ویرایش بارگذاری شد.');
    } catch (error) {
      message(error.message);
    }
    return;
  }

  if (toggleButton) {
    const id = toggleButton.dataset.toggle;
    const currentlyActive = toggleButton.dataset.active === '1';
    const action = currentlyActive ? 'غیرفعال' : 'فعال';

    if (!confirm(`${action} کردن این محصول انجام شود؟`)) return;

    try {
      await request(`/api/admin/products/${encodeURIComponent(id)}`, {
        method:'PATCH',
        body:JSON.stringify({is_active:!currentlyActive})
      });
      message(`محصول ${action} شد.`);
      await products();
    } catch (error) {
      message(error.message);
    }
  }
});


async function loadGatewayStatus() {
  const target = $('#gatewayStatus');
  if (!target) return;
  try {
    const data = await fetch('/api/payments/zarinpal/status').then(r => r.json());
    target.textContent = data.enabled
      ? 'درگاه زرین‌پال آماده است (' + (data.sandbox ? 'آزمایشی' : 'واقعی') + ').'
      : 'درگاه زرین‌پال فعلاً خاموش است. پس از انتشار سایت و تنظیمات محرمانه سرور فعال می‌شود.';
  } catch {
    target.textContent = 'وضعیت درگاه قابل دریافت نیست.';
  }
}

async function loadStoreSettings() {
  const form = $('#settingsForm');
  if (!form) return;

  try {
    const data = await request('/api/admin/store-settings');
    form.elements.bank_name.value = data.bank_name || '';
    form.elements.card_number.value = data.card_number || '';
    form.elements.cardholder_name.value = data.cardholder_name || '';
    form.elements.iban.value = data.iban || '';
    form.elements.payment_instructions.value = data.payment_instructions || '';
    form.elements.payment_enabled.checked = data.payment_enabled === true;
    form.elements.local_shipping_toman.value = data.local_shipping_toman ?? '';
    form.elements.nationwide_shipping_toman.value = data.nationwide_shipping_toman ?? '';
    await loadGatewayStatus();
    $('#settingsMessage').textContent = 'تنظیمات فعلی بارگذاری شد.';
  } catch (error) {
    $('#settingsMessage').textContent = error.message;
  }
}

$('#settingsForm').onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget;

  const data = {
    bank_name: form.elements.bank_name.value.trim(),
    card_number: form.elements.card_number.value.replace(/[\s-]/g, ''),
    cardholder_name: form.elements.cardholder_name.value.trim(),
    iban: form.elements.iban.value.trim(),
    payment_instructions: form.elements.payment_instructions.value.trim(),
    payment_enabled: form.elements.payment_enabled.checked,
    local_shipping_toman: form.elements.local_shipping_toman.value,
    nationwide_shipping_toman: form.elements.nationwide_shipping_toman.value
  };

  $('#settingsMessage').textContent = 'در حال ذخیره تنظیمات...';

  try {
    await request('/api/admin/store-settings', {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
    $('#settingsMessage').textContent = 'تنظیمات فروشگاه با موفقیت ذخیره شد.';
    await loadStoreSettings();
  } catch (error) {
    $('#settingsMessage').textContent = error.message;
  }
};

async function customers() {
  try {
    const data=await request('/api/admin/customers');
    if(!Array.isArray(data)) throw new Error('پاسخ فهرست مشتریان معتبر نیست.');
    $('#customers').innerHTML=data.map(customer=>`
      <div class="order">
        <b>${escapeHtml(customer.full_name)}</b>
        <p>شماره موبایل: ${escapeHtml(customer.phone)}</p>
        <p>تعداد سفارش: ${Number(customer.order_count).toLocaleString('fa-IR')}</p>
        <p>مجموع خریدهای غیرلغوشده: ${Number(customer.total_spent_toman).toLocaleString('fa-IR')} تومان</p>
        <p>وضعیت حساب: ${customer.is_active ? 'فعال' : 'غیرفعال'}</p>
        <p class="muted">عضویت از: ${new Date(customer.created_at).toLocaleDateString('fa-IR')}</p>
        ${adminCan('customers.manage') && Number(customer.order_count)===0 ? `<button type="button" data-customer-active="${escapeHtml(customer.id)}" data-next-active="${customer.is_active?'false':'true'}">${customer.is_active?'غیرفعال‌سازی حساب':'فعال‌سازی دوباره حساب'}</button>` : ''}
      </div>
    `).join('') || 'هنوز مشتری عضوی ثبت‌نام نکرده است.';
  } catch(error) { $('#customers').textContent=error.message; }
}

$('#customers').addEventListener('click',async event=>{
  const button=event.target.closest('[data-customer-active]');
  if(!button)return;
  const id=button.dataset.customerActive,active=button.dataset.nextActive==='true';
  if(!confirm(active?'این حساب مشتری دوباره فعال شود؟':'حساب این مشتری غیرفعال شود؟'))return;
  try{
    await request('/api/admin/customers/'+encodeURIComponent(id)+'/status',{method:'PATCH',body:JSON.stringify({is_active:active})});
    message(active?'حساب مشتری فعال شد.':'حساب مشتری غیرفعال شد؛ سوابق حذف نشده‌اند.');
    await customers();
  }catch(error){message(error.message);}
});

async function orders() {
  try {
    const data = await request('/api/admin/orders');
    if (!Array.isArray(data)) throw new Error('پاسخ سفارش‌ها معتبر نیست.');

    $('#orders').innerHTML = data.map(o => `
      <div class="order">
        <b>${escapeHtml(o.order_code)}</b> —
        ${escapeHtml(o.customer_name)} —
        ${escapeHtml(o.phone)}
        <p>${escapeHtml(o.city)}، ${escapeHtml(o.address)}</p>
        <p>جمع کالاها: ${Number(o.subtotal_toman).toLocaleString('fa-IR')} تومان</p>
        <p>هزینه ارسال: ${Number(o.shipping_toman).toLocaleString('fa-IR')} تومان</p>
        <p><b>مبلغ نهایی: ${Number(o.total_toman).toLocaleString('fa-IR')} تومان</b></p>
        <p>وضعیت سفارش: ${escapeHtml(o.status)} | پرداخت: ${escapeHtml(o.payment_status || 'نامشخص')}</p>
        <p>نوع مشتری: ${o.customer_id ? 'عضو AVELORA' : 'مهمان'} | تخفیف عضویت: ${Number(o.membership_discount_toman||0).toLocaleString('fa-IR')} تومان</p>
        <p>روش پرداخت: ${escapeHtml(o.payment_method || 'نامشخص')} | کد پیگیری: ${escapeHtml(o.payment_reference || 'ثبت نشده')}</p>
        <p class="muted">${(o.items || []).map(i =>
          `${escapeHtml(i.name)} × ${escapeHtml(i.quantity)}`
        ).join('، ')}</p>
        ${adminCan('orders.update') ? `
          <select id="s${escapeHtml(o.id)}">
            <option value="awaiting_payment" ${o.status === 'awaiting_payment' ? 'selected' : ''}>در انتظار پرداخت</option>
            <option value="paid" ${o.status === 'paid' ? 'selected' : ''}>پرداخت تأیید شد</option>
            <option value="preparing" ${o.status === 'preparing' ? 'selected' : ''}>در حال آماده‌سازی</option>
            <option value="shipped" ${o.status === 'shipped' ? 'selected' : ''}>ارسال شد</option>
            <option value="completed" ${o.status === 'completed' ? 'selected' : ''}>تکمیل شد</option>
            <option value="cancelled" ${o.status === 'cancelled' ? 'selected' : ''}>لغو شد</option>
          </select>
          <button type="button" data-status="${escapeHtml(o.id)}">ذخیره وضعیت</button>` : ''}
      </div>
    `).join('') || 'سفارشی ثبت نشده است.';
  } catch (error) {
    $('#orders').textContent = error.message;
  }
}

$('#orders').addEventListener('click', async event => {
  const button = event.target.closest('[data-status]');
  if (!button) return;

  const id = button.dataset.status;
  const select = document.getElementById(`s${id}`);
  if (!select) return;

  try {
    await request(`/api/admin/orders/${encodeURIComponent(id)}/status`, {
      method:'PATCH',
      body:JSON.stringify({status:select.value})
    });
    message('وضعیت سفارش به‌روزرسانی شد.');
    await orders();
  } catch (error) {
    message(error.message);
  }
});

$('#refresh').onclick = orders;
$('#refreshCustomers').onclick = customers;
$('#refreshProducts').onclick = products;
$('#archivedProducts').addEventListener('click', async event => {
  const button = event.target.closest('[data-restore]');
  if (!button) return;
  const id = button.dataset.restore;
  const name = button.dataset.name || 'این محصول';
  if (!confirm(`«${name}» دوباره در فهرست محصولات فعال قرار بگیرد؟`)) return;
  try {
    await request(`/api/admin/products/${encodeURIComponent(id)}`, {
      method:'PATCH',
      body:JSON.stringify({is_active:true})
    });
    message('محصول از بایگانی خارج و به فهرست فعال‌ها اضافه شد.');
    await products();
  } catch (error) {
    message(error.message);
  }
});

initializeAdminAuth();
