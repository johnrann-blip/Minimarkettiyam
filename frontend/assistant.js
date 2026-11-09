/* راهنمای خرید رایگان AVELORA؛ مبتنی بر کاتالوگ واقعی فروشگاه و بدون API پولی */
(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  let catalog = [];
  let settings = null;
  let loading = false;

  const launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.className = 'assistant-launcher';
  launcher.textContent = 'راهنمای خرید ✨';
  launcher.setAttribute('aria-expanded', 'false');
  launcher.setAttribute('aria-controls', 'aveloraAssistant');

  const panel = document.createElement('section');
  panel.id = 'aveloraAssistant';
  panel.className = 'assistant-panel';
  panel.setAttribute('aria-label', 'راهنمای خرید AVELORA');
  panel.innerHTML = `
    <header class="assistant-head">
      <div><strong>راهنمای خرید AVELORA</strong><small>پیشنهاد بر اساس محصولات موجود فروشگاه</small></div>
      <button type="button" class="assistant-close" aria-label="بستن">×</button>
    </header>
    <div class="assistant-messages" id="assistantMessages" role="log" aria-live="polite"></div>
    <div class="assistant-quick">
      <button type="button" data-prompt="یک کیف برای استفاده روزمره پیشنهاد بده">کیف روزمره</button>
      <button type="button" data-prompt="محصولات آرایشی موجود را نشان بده">لوازم آرایشی</button>
      <button type="button" data-prompt="روش ارسال و هزینه آن چطور است؟">ارسال سفارش</button>
    </div>
    <form class="assistant-form" id="assistantForm">
      <input id="assistantInput" maxlength="240" autocomplete="off" placeholder="دنبال چه محصولی هستی؟" aria-label="پیام شما">
      <button type="submit">ارسال</button>
    </form>
    <div class="assistant-disclaimer">راهنمای خودکار فروشگاه است؛ پاسخ‌ها فقط بر اساس اطلاعات ثبت‌شده ارائه می‌شوند.</div>
  `;

  document.body.append(launcher, panel);
  const messages = $('#assistantMessages');
  const input = $('#assistantInput');

  function say(text, who = 'bot') {
    const node = document.createElement('div');
    node.className = 'assistant-message ' + who;
    node.textContent = text;
    messages.appendChild(node);
    messages.scrollTop = messages.scrollHeight;
    return node;
  }

  function normalize(value) {
    return String(value || '').toLowerCase()
      .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')
      .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
      .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      .replace(/[\u064B-\u065F\u0670]/g, '')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  const bagWords = ['کیف', 'کیف دستی', 'کیف دوشی', 'کیف زنانه', 'کوله', 'اکسسوری'];
  const beautyWords = ['آرایشی', 'لوازم آرایش', 'زیبایی', 'رژ', 'ریمل', 'کرم', 'عطر', 'مراقبت پوست'];
  const stopWords = new Set(['میخوام','می خواهم','میخوام','میخواهم','دارید','دارین','لطفا','لطفاً','برای','یک','یه','از','با','را','رو','چه','چی','چطور','است','هست','موجود','محصول','محصولات','نشان','بده','پیشنهاد','کن','کنید','من','این','اون','که','و','در','به','قیمت','چنده','چند']);

  async function refreshCatalog() {
    if (loading) return;
    loading = true;
    try {
      const response = await fetch('/api/products', { cache: 'no-store' });
      if (!response.ok) throw new Error('catalog');
      const data = await response.json();
      catalog = Array.isArray(data) ? data : [];
    } finally {
      loading = false;
    }
  }

  async function refreshSettings() {
    try {
      const response = await fetch('/api/store-settings', { cache: 'no-store' });
      if (response.ok) settings = await response.json();
    } catch {}
  }

  function price(product) {
    const amount = Number(product.sale_price_toman ?? product.price_toman);
    return Number.isFinite(amount) ? new Intl.NumberFormat('fa-IR').format(amount) + ' تومان' : 'قیمت ثبت نشده';
  }

  function productCard(product) {
    const card = document.createElement('article');
    card.className = 'assistant-product';
    if (product.image_url) {
      const img = document.createElement('img');
      img.src = product.image_url;
      img.alt = product.name || 'تصویر محصول';
      img.loading = 'lazy';
      img.onerror = () => img.remove();
      card.appendChild(img);
    } else {
      const empty = document.createElement('div');
      empty.className = 'assistant-no-image';
      empty.textContent = '🛍️';
      card.appendChild(empty);
    }
    const details = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = product.name || 'محصول فروشگاه';
    const meta = document.createElement('small');
    meta.textContent = price(product) + ' · ' + (Number(product.stock) > 0 ? 'موجود' : 'ناموجود');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'مشاهده محصول';
    button.addEventListener('click', () => {
      const search = $('#search');
      if (search) {
        search.value = product.name || '';
        search.dispatchEvent(new Event('input', { bubbles: true }));
      }
      panel.classList.remove('open');
      launcher.setAttribute('aria-expanded', 'false');
      $('#products')?.scrollIntoView({ behavior: 'smooth' });
    });
    details.append(title, meta, button);
    card.appendChild(details);
    return card;
  }

  function showProducts(items, intro) {
    const node = say(intro);
    if (!items.length) return;
    const list = document.createElement('div');
    list.className = 'assistant-products';
    items.forEach(product => list.appendChild(productCard(product)));
    node.appendChild(list);
    messages.scrollTop = messages.scrollHeight;
  }

  function includesAny(text, words) {
    return words.some(word => text.includes(normalize(word)));
  }

  function findProducts(query) {
    const q = normalize(query);
    const wantsBags = includesAny(q, bagWords);
    const wantsBeauty = includesAny(q, beautyWords);
    const terms = q.split(' ').filter(word => word.length > 1 && !stopWords.has(word));
    let ranked = catalog.map(product => {
      const name = normalize(product.name);
      const description = normalize(product.description);
      const category = normalize(product.category_name);
      let score = 0;
      for (const term of terms) {
        if (name.includes(term)) score += 5;
        if (description.includes(term)) score += 2;
        if (category.includes(term)) score += 3;
      }
      if (wantsBags && (category.includes('کیف') || category.includes('اکسسوری'))) score += 8;
      if (wantsBeauty && (category.includes('آرایشی') || category.includes('زیبایی'))) score += 8;
      if (Number(product.stock) > 0) score += 1;
      return { product, score };
    }).filter(item => item.score > 0);
    ranked.sort((a, b) => b.score - a.score);
    if ((wantsBags || wantsBeauty) && ranked.length) {
      const categoryMatches = ranked.filter(item => item.score >= 8);
      if (categoryMatches.length) ranked = categoryMatches;
    }
    return ranked.slice(0, 3).map(item => item.product);
  }

  async function answer(raw) {
    const query = normalize(raw);
    if (!query) return;
    say(raw, 'user');
    const pending = say('دارم محصولات و اطلاعات فروشگاه را بررسی می‌کنم…');
    try {
      await Promise.all([refreshCatalog(), refreshSettings()]);
      pending.remove();

      if (includesAny(query, ['سلام','درود','وقت بخیر','خسته نباشی'])) {
        say('سلام، خوش آمدی 🌷 چه چیزی دنبالش هستی؟ می‌توانی درباره کیف‌ها، لوازم آرایشی، قیمت و موجودی محصولات بپرسی.');
        return;
      }

      if (includesAny(query, ['ارسال','پست','پیک','هزینه ارسال','زمان رسیدن'])) {
        const local = settings?.local_shipping_toman;
        const national = settings?.nationwide_shipping_toman;
        const fmt = value => value === null || value === undefined ? 'هنوز در فروشگاه تعیین نشده' : new Intl.NumberFormat('fa-IR').format(Number(value)) + ' تومان';
        say('هزینه ارسال داخل شهر: ' + fmt(local) + '\nهزینه ارسال به شهرهای دیگر: ' + fmt(national) + '\nزمان دقیق تحویل در اطلاعات فعلی فروشگاه ثبت نشده است. برای زمان ارسال می‌توانی با پشتیبانی فروشگاه هماهنگ کنی.');
        return;
      }

      if (includesAny(query, ['پرداخت','زرین پال','کارت به کارت','درگاه'])) {
        if (settings?.online_payment_enabled) say('پرداخت آنلاین در تنظیمات فروشگاه فعال گزارش شده است. هنگام ثبت سفارش، مسیر پرداخت امن فروشگاه نمایش داده می‌شود.');
        else if (settings?.payment_enabled) say('روش کارت‌به‌کارت در تنظیمات فروشگاه فعال است. اطلاعات پرداخت هنگام ثبت سفارش نمایش داده می‌شود.');
        else say('در حال حاضر روش پرداخت فعالی در تنظیمات فروشگاه گزارش نشده است؛ امکان ثبت سفارش تا فعال‌سازی پرداخت وجود ندارد.');
        return;
      }

      if (includesAny(query, ['موجودی','موجوده','دارید','قیمت','چنده','چند'])) {
        const matches = findProducts(query);
        if (matches.length) {
          showProducts(matches, 'این محصولات با پرسش تو بیشترین تطابق را در کاتالوگ فعلی دارند. قیمت و موجودی از اطلاعات ثبت‌شده فروشگاه خوانده شده‌اند:');
        } else {
          say('برای اینکه قیمت یا موجودی را دقیق بررسی کنم، نام محصول یا بخشی از نام آن را بنویس.');
        }
        return;
      }

      const matches = findProducts(query);
      if (matches.length) {
        showProducts(matches, 'این گزینه‌ها را بر اساس نام، توضیحات و دسته‌بندی محصولات پیدا کردم:');
      } else if (wantsBagsOrBeauty(query)) {
        say('در این دسته فعلاً محصول منطبق و قابل نمایش پیدا نکردم. شاید محصولات آن دسته هنوز در فروشگاه ثبت نشده باشند.');
      } else {
        say('هنوز محصول منطبقی در کاتالوگ پیدا نکردم. نام محصول، نوع کیف یا نام محصول آرایشی را دقیق‌تر بنویس. من فقط اطلاعات ثبت‌شده فروشگاه را اعلام می‌کنم و ویژگی یا قیمت حدس نمی‌زنم.');
      }
    } catch {
      pending.remove();
      say('فعلاً دریافت اطلاعات فروشگاه ممکن نیست. لطفاً کمی بعد دوباره تلاش کن.');
    }
  }

  function wantsBagsOrBeauty(query) {
    return includesAny(query, bagWords) || includesAny(query, beautyWords);
  }

  launcher.addEventListener('click', async () => {
    const opening = !panel.classList.contains('open');
    panel.classList.toggle('open', opening);
    launcher.setAttribute('aria-expanded', String(opening));
    if (opening && !messages.children.length) {
      say('سلام! من راهنمای خرید AVELORA هستم. می‌توانم محصولات موجود، قیمت، موجودی و اطلاعات ثبت‌شده ارسال را پیدا کنم. چه چیزی لازم داری؟');
      input.focus();
      try { await Promise.all([refreshCatalog(), refreshSettings()]); } catch {}
    }
  });

  panel.querySelector('.assistant-close').addEventListener('click', () => {
    panel.classList.remove('open');
    launcher.setAttribute('aria-expanded', 'false');
  });

  panel.querySelectorAll('[data-prompt]').forEach(button => {
    button.addEventListener('click', () => answer(button.dataset.prompt));
  });

  $('#assistantForm').addEventListener('submit', event => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) return;
    input.value = '';
    answer(value);
  });
})();
