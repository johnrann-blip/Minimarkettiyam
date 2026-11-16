const $ = s => document.querySelector(s);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  })[c]);
}

function headers() {
  return {
    'Content-Type':'application/json',
    'x-admin-request':'1'
  };
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    credentials:'same-origin',
    ...options,
    headers: {...headers(), ...(options.headers || {})}
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data.error || 'درخواست انجام نشد.') + ' (کد ' + response.status + ')');
  return data;
}

function message(text) {
  $('#msg').textContent = text;
}

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
  $('#imagePreview').innerHTML = '';
  $('#productColors').innerHTML = '';
  window.currentProductImages=[];
  $('#productForm [name="id"]').value = '';
  $('#formTitle').textContent = 'افزودن محصول';
  $('#submitProduct').textContent = 'ثبت محصول';
  $('#cancelEdit').hidden = true;
}

$('#cancelEdit').onclick = resetProductForm;

// Show immediate feedback even if browser validation prevents form submission.
$('#submitProduct').addEventListener('click', () => {
  message('دکمه ذخیره انتخاب شد؛ در حال بررسی اطلاعات محصول...');
});

function addColorRow(color={name:'',stock:0}) {
  const row=document.createElement('div');
  row.className='product-color-row';
  row.innerHTML='<input type="text" maxlength="60" placeholder="نام رنگ (مثلاً مشکی)" aria-label="نام رنگ"><input type="number" min="0" step="1" placeholder="موجودی این رنگ" aria-label="موجودی رنگ"><button type="button" class="remove-product-color">حذف</button>';
  row.querySelector('input[type=text]').value=color.name||'';
  row.querySelector('input[type=number]').value=Number(color.stock)||0;
  row.querySelector('button').onclick=()=>row.remove();
  $('#productColors').append(row);
}
$('#addProductColor').onclick=()=>addColorRow();
function selectedColors(){
  return [...$('#productColors').querySelectorAll('.product-color-row')].map(row=>({
    name:row.querySelector('input[type=text]').value.trim(),
    stock:Number(row.querySelector('input[type=number]').value)
  })).filter(x=>x.name);
}
$('#imageFile').addEventListener('change',()=>{
  const files=[...$('#imageFile').files];
  if(files.length>12){message('حداکثر ۱۲ عکس برای هر محصول مجاز است.');$('#imageFile').value='';return;}
  if(files.some(file=>!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)){
    message('هر عکس باید JPG، PNG یا WebP و حداکثر ۵ مگابایت باشد.');$('#imageFile').value='';return;
  }
  $('#imagePreview').innerHTML=files.map(file=>'<img alt="پیش‌نمایش عکس محصول" style="max-width:100px;max-height:100px;object-fit:contain" src="'+URL.createObjectURL(file)+'">').join('');
  message(files.length+' عکس انتخاب شد.');
});

async function loadAdminWorkspace(admin) {
  $('#adminWorkspace').hidden = false;
  const owner = admin?.role === 'owner';
  const permissions = new Set(admin?.permissions || []);
  const can = permission => owner || permissions.has(permission);
  const productAccess = can('products.view') || can('products.create') || can('products.update') || can('products.archive');
  const orderAccess = can('orders.view') || can('orders.update');
  const customerAccess = can('customers.view') || can('customers.manage');
  // Store settings include bank/payment details; keep them owner-only.
  const settingsAccess = owner;
  $('#advertisingAdminLink').hidden = !owner;
  $('#feedbackAdmin').hidden = !owner;
  if(owner) loadFeedback();
  $('#managerAdmin').hidden = !owner;
  $('#productAdmin').hidden = !(can('products.create') || can('products.update'));
  $('#productsAdmin').hidden = !productAccess;
  $('#archiveAdmin').hidden = !can('products.archive');
  $('#ordersAdmin').hidden = !orderAccess;
  $('#customerAdmin').hidden = !customerAccess;
  $('#storeSettings').hidden = !settingsAccess;
  $('#loginPanel').hidden = true;
  $('#bootstrapPanel').hidden = true;
  message('ورود موفق بود؛ در حال دریافت اطلاعات مجاز...');
  const tasks = [];
  if (productAccess) tasks.push(categories(), products());
  if (orderAccess) tasks.push(orders());
  if (customerAccess) tasks.push(customers());
  if (settingsAccess) tasks.push(loadStoreSettings());
  if (owner) tasks.push(loadManagers(), advertisingSummary());
  await Promise.all(tasks);
}

async function advertisingSummary() {
  try {
    const data=await request('/api/admin/advertising/summary');
    const link=$('#advertisingAdminLink');
    link.textContent=data.pending_requests
      ? 'مدیریت تبلیغات — '+Number(data.pending_requests).toLocaleString('fa-IR')+' درخواست جدید'
      : 'مدیریت تبلیغات و درخواست‌های همکاری';
  } catch {}
}

async function checkAdminSession() {
  try {
    const data = await request('/api/admin/auth/me');
    if (!data.admin) throw new Error('نشست مدیریت معتبر نیست.');
    await loadAdminWorkspace(data.admin);
  } catch {
    $('#adminWorkspace').hidden = true;
    $('#loginPanel').hidden = false;
    await refreshSetupStatus();
  }
}

async function refreshSetupStatus() {
  try {
    const status = await request('/api/admin/auth/status');
    const setupRequired = status.setup_required === true;
    $('#bootstrapPanel').hidden = !setupRequired;
    $('#loginPanel').hidden = setupRequired;
    $('#authMessage').textContent = setupRequired
      ? 'هنوز حساب مالک ساخته نشده است. ابتدا حساب مالک را با کلید محرمانه سرور راه‌اندازی کن.'
      : 'با نام کاربری و رمز عبور فعلی وارد شو.';
  } catch (error) {
    // Do not show the ordinary login form when setup status is unknown.
    // This prevents a failed/stale status request from misleading the owner.
    $('#bootstrapPanel').hidden = true;
    $('#loginPanel').hidden = true;
    $('#authMessage').textContent = 'وضعیت راه‌اندازی مدیریت دریافت نشد؛ ورود را حدس نزن. اتصال سرور را بررسی کن. ' + error.message;
  }
}

$('#loginForm').onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget;
  $('#authMessage').textContent = 'در حال بررسی اطلاعات ورود...';
  try {
    const data = await request('/api/admin/auth/login', {method:'POST', body:JSON.stringify({
      username:form.elements.username.value.trim(),
      password:form.elements.password.value
    })});
    form.reset();
    await loadAdminWorkspace(data.admin);
  } catch(error) { $('#authMessage').textContent = error.message; }
};

$('#bootstrapForm').onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (form.elements.password.value !== form.elements.password_confirm.value) {
    $('#authMessage').textContent = 'تکرار رمز عبور با رمز اصلی یکسان نیست.';
    return;
  }
  $('#authMessage').textContent = 'در حال ساخت حساب مالک...';
  try {
    const data = await request('/api/admin/auth/bootstrap', {method:'POST', body:JSON.stringify({
      admin_api_key:form.elements.admin_api_key.value,
      username:form.elements.username.value.trim(),
      display_name:form.elements.display_name.value.trim(),
      password:form.elements.password.value
    })});
    const createdUsername = data.admin?.username || form.elements.username.value.trim();
    form.reset();
    $('#bootstrapPanel').hidden = true;
    $('#loginPanel').hidden = false;
    $('#loginForm').elements.username.value = createdUsername;
    $('#loginForm').elements.password.value = '';
    $('#authMessage').textContent = 'حساب مالک با موفقیت ساخته شد. اکنون با نام کاربری و رمز عبوری که تعیین کردی وارد شو.';
    $('#loginForm').elements.password.focus();
  } catch(error) { $('#authMessage').textContent = error.message; }
};

$('#logoutButton').onclick = async () => {
  try { await request('/api/admin/auth/logout', {method:'POST',body:'{}'}); }
  catch(error) { message(error.message); }
  $('#adminWorkspace').hidden = true;
  $('#loginPanel').hidden = false;
  await refreshSetupStatus();
};

$('#changePasswordForm').onsubmit = async event => {
  event.preventDefault();
  const form=event.currentTarget;
  if(form.elements.new_password.value!==form.elements.new_password_confirm.value){
    $('#passwordMessage').textContent='تکرار رمز جدید یکسان نیست.';
    return;
  }
  const button=form.querySelector('button[type="submit"]');
  button.disabled=true;
  $('#passwordMessage').textContent='در حال تغییر رمز عبور...';
  try{
    const result=await request('/api/admin/auth/password',{method:'POST',body:JSON.stringify({
      current_password:form.elements.current_password.value,
      new_password:form.elements.new_password.value
    })});
    form.reset();
    $('#passwordMessage').textContent=result.message||'رمز عبور تغییر کرد.';
  }catch(error){$('#passwordMessage').textContent=error.message;}
  finally{button.disabled=false;}
};

$('#productForm').onsubmit = async event => {
  event.preventDefault();
  const form=event.currentTarget;
  const data=Object.fromEntries(new FormData(form).entries());
  const imageFiles=[...form.elements.image_file.files];
  delete data.image_file;
  const id=data.id;delete data.id;
  data.price_toman=Number(data.price_toman);
  data.cost_price_toman=data.cost_price_toman===''?null:Number(data.cost_price_toman);
  data.stock=Number(data.stock);
  data.category_id=data.category_id?Number(data.category_id):null;
  data.sale_price_toman=data.sale_price_toman===''?null:Number(data.sale_price_toman);
  data.colors=selectedColors();
  const editing=Boolean(id), button=$('#submitProduct');
  button.disabled=true;button.textContent='در حال آپلود عکس‌ها و ذخیره...';
  try{
    const uploaded=[];
    for(const file of imageFiles){
      const base64=await new Promise((resolve,reject)=>{
        const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');
        reader.onerror=()=>reject(new Error('خواندن عکس انجام نشد.'));reader.readAsDataURL(file);
      });
      const result=await request('/api/admin/uploads/product',{method:'POST',body:JSON.stringify({image_base64:base64,mime_type:file.type})});
      uploaded.push(result.image_url);
    }
    const existing=window.currentProductImages||[];
    data.images=uploaded.length?([...existing,...uploaded].slice(0,12)):existing;
    if(data.image_url&&!data.images.length)data.images=[data.image_url];
    if(!data.images.length)delete data.images;
    await request(editing?'/api/admin/products/'+encodeURIComponent(id):'/api/admin/products',{
      method:editing?'PATCH':'POST',body:JSON.stringify(data)
    });
    window.currentProductImages=[];
    message(editing?'محصول ویرایش شد.':'محصول ثبت شد.');
    resetProductForm();await products();
  }catch(error){message('ذخیره محصول انجام نشد: '+error.message);}
  finally{button.disabled=false;button.textContent=editing?'ذخیره تغییرات':'ثبت محصول';}
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
      <p>قیمت ویژه مدیر: ${p.sale_price_toman === null ? 'فعال نیست' : Number(p.sale_price_toman).toLocaleString('fa-IR') + ' تومان'}</p>
      <p>موجودی: ${Number(p.stock).toLocaleString('fa-IR')}</p>
      <p>دسته: ${escapeHtml(p.category_name || 'بدون دسته')}</p>
      <p>وضعیت: ${active ? 'فعال' : 'بایگانی‌شده'}</p>
      <div class="product-actions">
        ${archived
          ? `<button type="button" data-restore="${escapeHtml(p.id)}" data-name="${escapeHtml(p.name)}">فعال‌سازی مجدد</button>`
          : `
            <button type="button" data-edit="${escapeHtml(p.id)}">ویرایش محصول</button>
            <button type="button" data-toggle="${escapeHtml(p.id)}" data-active="1">غیرفعال‌کردن</button>
            <button type="button" data-remove="${escapeHtml(p.id)}" data-name="${escapeHtml(p.name)}">انتقال به بایگانی</button>
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
      window.currentProductImages=(p.images||[]).map(x=>x.image_url);
      $('#imagePreview').innerHTML=window.currentProductImages.map(url=>'<img alt="عکس فعلی محصول" style="max-width:100px;max-height:100px;object-fit:contain" src="'+escapeHtml(url)+'">').join('');
      $('#productColors').innerHTML='';
      (p.colors||[]).forEach(color=>addColorRow(color));
      form.elements.image_file.value = '';
      form.elements.description.value = p.description || '';

      $('#formTitle').textContent = 'ویرایش محصول';
      $('#submitProduct').textContent = 'ذخیره تغییرات';
      $('#cancelEdit').hidden = false;
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
    form.elements.footer_about.value = data.footer_about || '';
    form.elements.footer_support_phone.value = data.footer_support_phone || '';
    form.elements.footer_support_email.value = data.footer_support_email || '';
    form.elements.footer_instagram_url.value = data.footer_instagram_url || '';
    form.elements.footer_whatsapp_phone.value = data.footer_whatsapp_phone || '';
    form.elements.footer_bale_url.value = data.footer_bale_url || '';
    form.elements.footer_telegram_url.value = data.footer_telegram_url || '';
    form.elements.footer_address.value = data.footer_address || '';
    form.elements.footer_hours.value = data.footer_hours || '';
    form.elements.policy_terms.value = data.policy_terms || '';
    form.elements.policy_privacy.value = data.policy_privacy || '';
    form.elements.policy_shipping.value = data.policy_shipping || '';
    form.elements.policy_returns.value = data.policy_returns || '';
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
    nationwide_shipping_toman: form.elements.nationwide_shipping_toman.value,
    footer_about: form.elements.footer_about.value.trim(),
    footer_support_phone: form.elements.footer_support_phone.value.trim(),
    footer_support_email: form.elements.footer_support_email.value.trim(),
    footer_instagram_url: form.elements.footer_instagram_url.value.trim(),
    footer_whatsapp_phone: form.elements.footer_whatsapp_phone.value.trim(),
    footer_bale_url: form.elements.footer_bale_url.value.trim(),
    footer_telegram_url: form.elements.footer_telegram_url.value.trim(),
    footer_address: form.elements.footer_address.value.trim(),
    footer_hours: form.elements.footer_hours.value.trim(),
    policy_terms: form.elements.policy_terms.value.trim(),
    policy_privacy: form.elements.policy_privacy.value.trim(),
    policy_shipping: form.elements.policy_shipping.value.trim(),
    policy_returns: form.elements.policy_returns.value.trim()
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

const managerPermissions = [
  ['products.view','مشاهده محصولات'],['products.create','ثبت محصول'],['products.update','ویرایش محصول'],
  ['products.archive','بایگانی محصول'],['products.upload','آپلود عکس محصول'],
  ['orders.view','مشاهده سفارش‌ها'],['orders.update','تغییر وضعیت سفارش'],
  ['customers.view','مشاهده مشتریان'],['customers.manage','مدیریت مشتریان'],
  
  ['audit.view','مشاهده گزارش فعالیت مدیران']
];

async function loadManagers() {
  try {
    const data = await request('/api/admin/auth/managers');
    $('#managerList').innerHTML = data.map(manager => `
      <div class="order">
        <b>${escapeHtml(manager.display_name)} (@${escapeHtml(manager.username)})</b>
        <p>وضعیت: ${manager.is_active ? 'فعال' : 'غیرفعال'}</p>
        <p>مجوزها: ${(manager.permissions || []).map(p => escapeHtml(managerPermissions.find(x => x[0] === p)?.[1] || p)).join('، ') || 'بدون مجوز'}</p>
        <p class="muted">آخرین ورود: ${manager.last_login_at ? new Date(manager.last_login_at).toLocaleString('fa-IR') : 'هنوز وارد نشده'}</p>
        <button type="button" data-manager-toggle="${escapeHtml(manager.id)}" data-active="${manager.is_active ? '1' : '0'}">${manager.is_active ? 'غیرفعال‌کردن حساب' : 'فعال‌کردن حساب'}</button>
      </div>
    `).join('') || 'هنوز حساب مدیریتی دیگری ساخته نشده است.';
  } catch(error) { $('#managerList').textContent = error.message; }
}

$('#managerForm').onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const permissions = [...form.querySelectorAll('[name="permissions"]:checked')].map(x => x.value);
  try {
    await request('/api/admin/auth/managers', {method:'POST',body:JSON.stringify({
      username:form.elements.username.value.trim(),
      display_name:form.elements.display_name.value.trim(),
      password:form.elements.password.value,
      permissions
    })});
    form.reset();
    $('#managerMessage').textContent = 'حساب مدیر با موفقیت ساخته شد.';
    await loadManagers();
  } catch(error) { $('#managerMessage').textContent = error.message; }
};

$('#managerList').addEventListener('click', async event => {
  const button = event.target.closest('[data-manager-toggle]');
  if (!button) return;
  const active = button.dataset.active === '1';
  try {
    await request('/api/admin/auth/managers/' + encodeURIComponent(button.dataset.managerToggle), {
      method:'PATCH',body:JSON.stringify({is_active:!active})
    });
    await loadManagers();
  } catch(error) { $('#managerMessage').textContent = error.message; }
});

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
        <p class="muted">عضویت از: ${new Date(customer.created_at).toLocaleDateString('fa-IR')}</p>
      </div>
    `).join('') || 'هنوز مشتری عضوی ثبت‌نام نکرده است.';
  } catch(error) { $('#customers').textContent=error.message; }
}

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
        <p>نوع مشتری: ${o.customer_id ? 'عضو AVELORA' : 'مهمان'} | تخفیف ثبت‌شده: ${Number(o.membership_discount_toman||0).toLocaleString('fa-IR')} تومان</p>
        <p>روش پرداخت: ${escapeHtml(o.payment_method || 'نامشخص')} | کد پیگیری: ${escapeHtml(o.payment_reference || 'ثبت نشده')}</p>
        <p class="muted">${(o.items || []).map(i =>
          `${escapeHtml(i.name)} × ${escapeHtml(i.quantity)}`
        ).join('، ')}</p>
        <select id="s${escapeHtml(o.id)}">
          <option value="awaiting_payment" ${o.status === 'awaiting_payment' ? 'selected' : ''}>در انتظار پرداخت</option>
          <option value="paid" ${o.status === 'paid' ? 'selected' : ''}>پرداخت تأیید شد</option>
          <option value="preparing" ${o.status === 'preparing' ? 'selected' : ''}>در حال آماده‌سازی</option>
          <option value="shipped" ${o.status === 'shipped' ? 'selected' : ''}>ارسال شد</option>
          <option value="completed" ${o.status === 'completed' ? 'selected' : ''}>تکمیل شد</option>
          <option value="cancelled" ${o.status === 'cancelled' ? 'selected' : ''}>لغو شد</option>
        </select>
        <button type="button" data-status="${escapeHtml(o.id)}">ذخیره وضعیت</button>
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

$('#refreshManagers').onclick = loadManagers;
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


async function loadFeedback(){
  if($('#feedbackAdmin').hidden)return;
  try{
    const status=$('#feedbackStatus').value||'pending';
    const data=await request('/api/admin/feedback?status='+encodeURIComponent(status));
    if(!Array.isArray(data))throw new Error('پاسخ دیدگاه‌ها معتبر نیست.');
    $('#feedbackList').innerHTML=data.map(item=>'<article class="order"><b>'+escapeHtml(item.display_name)+'</b> — '+
      (item.feedback_type==='suggestion'?'پیشنهاد':'نظر')+'<p>'+escapeHtml(item.message)+'</p><p class="muted">وضعیت: '+
      escapeHtml(item.status)+' | '+new Date(item.created_at).toLocaleString('fa-IR')+'</p>'+
      (item.status==='pending'?'<div class="row"><button type="button" data-feedback-action="approved" data-feedback-id="'+escapeHtml(item.id)+'">تأیید و انتشار</button><button type="button" data-feedback-action="rejected" data-feedback-id="'+escapeHtml(item.id)+'">رد دیدگاه</button></div>':'')+
      '</article>').join('')||'دیدگاهی در این فهرست وجود ندارد.';
  }catch(error){$('#feedbackList').textContent=error.message;}
}
$('#refreshFeedback').addEventListener('click',loadFeedback);
$('#feedbackStatus').addEventListener('change',loadFeedback);
$('#feedbackList').addEventListener('click',async event=>{
  const button=event.target.closest('[data-feedback-action]');
  if(!button)return;
  button.disabled=true;
  try{
    await request('/api/admin/feedback/'+encodeURIComponent(button.dataset.feedbackId),{
      method:'PATCH',body:JSON.stringify({status:button.dataset.feedbackAction})
    });
    message(button.dataset.feedbackAction==='approved'?'دیدگاه تأیید و منتشر شد.':'دیدگاه رد شد.');
    await loadFeedback();
  }catch(error){message(error.message);button.disabled=false;}
});

checkAdminSession();
