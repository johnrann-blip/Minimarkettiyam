const $ = s => document.querySelector(s);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  })[c]);
}

let key = sessionStorage.getItem('mm_admin_key') || '';
$('#key').value = key;

function headers() {
  return {
    'Content-Type':'application/json',
    'x-admin-key':key
  };
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {...headers(), ...(options.headers || {})}
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'درخواست انجام نشد.');
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
  $('#productForm [name="id"]').value = '';
  $('#formTitle').textContent = 'افزودن محصول';
  $('#submitProduct').textContent = 'ثبت محصول';
  $('#cancelEdit').hidden = true;
}

$('#cancelEdit').onclick = resetProductForm;

$('#saveKey').onclick = async () => {
  key = $('#key').value.trim();
  if (!key) {
    message('کلید مدیریت را وارد کن.');
    return;
  }
  sessionStorage.setItem('mm_admin_key', key);
  message('کلید ذخیره شد؛ در حال دریافت اطلاعات...');
  await Promise.all([products(), orders(), loadStoreSettings()]);
};

$('#productForm').onsubmit = async event => {
  event.preventDefault();

  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  const id = data.id;
  delete data.id;

  data.price_toman = Number(data.price_toman);
  data.stock = Number(data.stock);
  data.category_id = data.category_id ? Number(data.category_id) : null;
  data.sale_price_toman =
    data.sale_price_toman === '' ? null : Number(data.sale_price_toman);

  const editing = Boolean(id);

  try {
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
    message(error.message);
  }
};

async function products() {
  try {
    const data = await request('/api/admin/products');
    if (!Array.isArray(data)) throw new Error('پاسخ فهرست محصولات معتبر نیست.');

    $('#products').innerHTML = data.map(p => `
      <div class="order">
        <b>${escapeHtml(p.name)}</b>
        <p>شناسه: ${escapeHtml(p.id)} | کد کالا: ${escapeHtml(p.sku || 'ندارد')}</p>
        <p>قیمت: ${Number(p.price_toman).toLocaleString('fa-IR')} تومان</p>
        <p>تخفیف: ${
          p.sale_price_toman === null
            ? 'ندارد'
            : Number(p.sale_price_toman).toLocaleString('fa-IR') + ' تومان'
        }</p>
        <p>موجودی: ${Number(p.stock).toLocaleString('fa-IR')}</p>
        <p>دسته: ${escapeHtml(p.category_name || 'بدون دسته')}</p>
        <p>وضعیت: ${p.is_active ? 'فعال' : 'غیرفعال'}</p>
        <button type="button" data-edit="${escapeHtml(p.id)}">ویرایش</button>
        <button type="button" data-toggle="${escapeHtml(p.id)}" data-active="${p.is_active ? '1' : '0'}">
          ${p.is_active ? 'غیرفعال‌کردن' : 'فعال‌کردن'}
        </button>
      </div>
    `).join('') || 'هنوز محصولی ثبت نشده است.';
  } catch (error) {
    $('#products').textContent = error.message;
  }
}

$('#products').addEventListener('click', async event => {
  const editButton = event.target.closest('[data-edit]');
  const toggleButton = event.target.closest('[data-toggle]');

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
      form.elements.sale_price_toman.value = p.sale_price_toman ?? '';
      form.elements.stock.value = p.stock;
      form.elements.image_url.value = p.image_url || '';
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
        <p>وضعیت: ${escapeHtml(o.status)}</p>
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

$('#refresh').onclick = orders;
$('#refreshProducts').onclick = products;

categories();
