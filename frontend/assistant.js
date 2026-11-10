/* AVELORA Smart Shopping Assistant
 * Catalog-grounded Persian shopping guide. No paid AI API, no invented product facts.
 */
(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const state = { catalog: [], settings: null, categories: [], busy: false, greeted: false };
  const money = value => new Intl.NumberFormat('fa-IR').format(Number(value) || 0);
  const normalize = value => String(value || '').toLowerCase()
    .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

  const words = {
    bags: ['کیف', 'کیف دستی', 'کیف دوشی', 'کیف زنانه', 'کوله', 'کیف پول'],
    beauty: ['آرایشی', 'لوازم آرایش', 'زیبایی', 'رژ', 'ریمل', 'کرم', 'عطر', 'مراقبت پوست', 'مراقبت مو'],
    accessory: ['اکسسوری', 'زیور', 'گردنبند', 'دستبند', 'گوشواره', 'عینک', 'کمربند'],
    greeting: ['سلام', 'درود', 'وقت بخیر', 'خسته نباشی'],
    shipping: ['ارسال', 'پست', 'پیک', 'هزینه ارسال', 'زمان رسیدن', 'تحویل'],
    payment: ['پرداخت', 'زرین پال', 'کارت به کارت', 'درگاه', 'پرداخت آنلاین'],
    return: ['مرجوع', 'تعویض', 'بازگشت', 'پس دادن', 'ضمانت', 'خرابی'],
    order: ['سفارش من', 'پیگیری سفارش', 'کد سفارش', 'سفارشم', 'وضعیت سفارش'],
    compare: ['مقایسه', 'فرق', 'تفاوت', 'کدام بهتر', 'کدوم بهتر'],
    budget: ['ارزان', 'اقتصادی', 'بودجه', 'زیر', 'تا سقف', 'قیمت مناسب'],
    gift: ['هدیه', 'کادو', 'تولد', 'ولنتاین', 'روز مادر'],
    help: ['پشتیبانی', 'تماس', 'ارتباط با شما', 'اپراتور', 'مشاور انسانی']
  };
  const stopWords = new Set(['میخوام','می خواهم','میخواهم','میخوام','میخواهم','دارید','دارین','لطفا','لطفاً','برای','یک','یه','از','با','را','رو','چه','چی','چطور','است','هست','موجود','محصول','محصولات','نشان','بده','پیشنهاد','کن','کنید','من','این','اون','که','و','در','به','قیمت','چنده','چند','مناسب','میباشد','می‌شه','میشه']);

  const launcher = document.createElement('button');
  launcher.type = 'button'; launcher.className = 'assistant-launcher';
  launcher.textContent = 'مشاور هوشمند خرید ✨';
  launcher.setAttribute('aria-expanded', 'false');
  launcher.setAttribute('aria-controls', 'aveloraAssistant');

  const panel = document.createElement('section');
  panel.id = 'aveloraAssistant'; panel.className = 'assistant-panel';
  panel.setAttribute('aria-label', 'راهنمای خرید AVELORA؛ مشاور هوشمند');
  panel.innerHTML = `
    <header class="assistant-head">
      <div class="assistant-brand"><span class="assistant-mark">A</span><div><strong>مشاور خرید AVELORA</strong><small>همراه انتخاب هوشمندانه تو</small></div></div>
      <button type="button" class="assistant-close" aria-label="بستن پنجره">×</button>
    </header>
    <div class="assistant-trust">پیشنهادها بر اساس کاتالوگ و اطلاعات واقعی فروشگاه</div>
    <div class="assistant-messages" id="assistantMessages" role="log" aria-live="polite" aria-relevant="additions"></div>
    <div class="assistant-quick" aria-label="پرسش‌های پیشنهادی">
      <button type="button" data-prompt="برای استفاده روزمره کیف پیشنهاد بده">کیف روزمره</button>
      <button type="button" data-prompt="یک هدیه شیک پیشنهاد بده">انتخاب هدیه</button>
      <button type="button" data-prompt="محصولات آرایشی موجود را نشان بده">زیبایی و آرایش</button>
      <button type="button" data-prompt="روش و هزینه ارسال چیست؟">ارسال سفارش</button>
    </div>
    <form class="assistant-form" id="assistantForm">
      <input id="assistantInput" maxlength="240" autocomplete="off" placeholder="مثلاً کیف مشکی تا ۲ میلیون..." aria-label="پیام شما">
      <button type="submit" aria-label="ارسال پیام">ارسال</button>
    </form>
    <div class="assistant-disclaimer">راهنمای خودکار فروشگاه؛ اطلاعات نامشخص را حدس نمی‌زند.</div>
  `;
  document.body.append(launcher, panel);
  const messages = $('#assistantMessages'), input = $('#assistantInput');

  function has(text, list) { return list.some(item => text.includes(normalize(item))); }
  function say(text, who = 'bot') {
    const node = document.createElement('div'); node.className = 'assistant-message ' + who;
    node.textContent = text; messages.appendChild(node); messages.scrollTop = messages.scrollHeight; return node;
  }
  function addLinks(parent, links) {
    const wrap = document.createElement('div'); wrap.className = 'assistant-contact-links';
    links.filter(x => x.href).forEach(item => {
      const a = document.createElement('a'); a.href = item.href; a.textContent = item.label;
      if (/^https?:/.test(item.href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      wrap.appendChild(a);
    });
    if (wrap.childElementCount) parent.appendChild(wrap);
  }
  async function loadData() {
    const [products, settings, categories] = await Promise.all([
      fetch('/api/products', { cache: 'no-store' }).then(r => { if (!r.ok) throw Error('products'); return r.json(); }),
      fetch('/api/store-settings', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/categories', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).catch(() => [])
    ]);
    state.catalog = Array.isArray(products) ? products : [];
    state.settings = settings; state.categories = Array.isArray(categories) ? categories : [];
  }
  function currentPrice(p) { return Number(p.sale_price_toman ?? p.price_toman); }
  function priceText(p) { return Number.isFinite(currentPrice(p)) ? money(currentPrice(p)) + ' تومان' : 'قیمت ثبت نشده'; }
  function stockText(p) { return Number(p.stock) > 0 ? 'موجود' : 'ناموجود'; }
  function budgetFrom(text) {
    const match = text.match(/(?:زیر|تا سقف|حداکثر|بودجه|تا)\s*([\d,.]+)/);
    if (!match) return null;
    let n = Number(match[1].replace(/,/g, ''));
    if (!Number.isFinite(n)) return null;
    if (/میلیون/.test(text)) n *= 1000000;
    else if (/هزار/.test(text)) n *= 1000;
    else if (n > 0 && n < 100000) n *= 1000;
    return n;
  }
  function classify(text) {
    return {
      bags: has(text, words.bags), beauty: has(text, words.beauty), accessory: has(text, words.accessory),
      gift: has(text, words.gift), budget: budgetFrom(text),
      compare: has(text, words.compare), shipping: has(text, words.shipping),
      payment: has(text, words.payment), returns: has(text, words.return),
      order: has(text, words.order), support: has(text, words.help),
      greeting: has(text, words.greeting)
    };
  }
  function rankProducts(text, intent) {
    const terms = text.split(' ').filter(w => w.length > 1 && !stopWords.has(w));
    const ranked = state.catalog.map(p => {
      const name = normalize(p.name), desc = normalize(p.description), category = normalize(p.category_name);
      let score = 0; const reasons = [];
      terms.forEach(term => {
        if (name.includes(term)) score += 7;
        if (category.includes(term)) score += 5;
        if (desc.includes(term)) score += 2;
      });
      if (intent.bags && /کیف|کوله/.test(category + ' ' + name)) { score += 10; reasons.push('هم‌دسته با کیف و استفاده روزمره'); }
      if (intent.beauty && /آرایش|زیبایی|پوست|مو/.test(category + ' ' + name)) { score += 10; reasons.push('مرتبط با محصولات زیبایی'); }
      if (intent.accessory && /اکسسوری|زیور|گردنبند|دستبند|گوشواره/.test(category + ' ' + name)) { score += 10; reasons.push('مرتبط با اکسسوری'); }
      if (intent.gift) { score += 1; reasons.push('گزینه‌ای برای بررسی به‌عنوان هدیه'); }
      const inStock = Number(p.stock) > 0;
      if (inStock) { score += 3; reasons.push('موجودی ثبت‌شده دارد'); }
      if (intent.budget !== null && Number.isFinite(currentPrice(p))) {
        if (currentPrice(p) <= intent.budget) { score += 8; reasons.push('در محدوده بودجه اعلام‌شده'); }
        else score -= 12;
      }
      return { p, score, reasons, inStock };
    }).filter(x => x.score > 0);
    ranked.sort((a,b) => b.score-a.score || Number(b.inStock)-Number(a.inStock));
    return ranked.slice(0, 4);
  }
  function renderProductCard(item, index) {
    const p = item.p, card = document.createElement('article'); card.className = 'assistant-product';
    if (p.image_url) {
      const img = document.createElement('img'); img.src = p.image_url; img.alt = p.name || 'تصویر محصول';
      img.loading = 'lazy'; img.onerror = () => img.remove(); card.appendChild(img);
    } else { const no = document.createElement('div'); no.className = 'assistant-no-image'; no.textContent = '✧'; card.appendChild(no); }
    const body = document.createElement('div'); body.className = 'assistant-product-info';
    const title = document.createElement('strong'); title.textContent = p.name || 'محصول AVELORA';
    const meta = document.createElement('small'); meta.textContent = priceText(p) + ' · ' + stockText(p);
    const reason = document.createElement('small'); reason.className = 'assistant-reason';
    reason.textContent = item.reasons.slice(0,2).join(' · ') || 'مطابق جست‌وجوی شما';
    const actions = document.createElement('div'); actions.className = 'assistant-product-actions';
    const view = document.createElement('button'); view.type = 'button'; view.textContent = 'مشاهده محصول';
    view.addEventListener('click', () => {
      const target = document.querySelector('[data-open-product="' + CSS.escape(String(p.id)) + '"]');
      if (target) target.click();
      else { const search = $('#search'); if (search) { search.value = p.name || ''; search.dispatchEvent(new Event('input', {bubbles:true})); } panel.classList.remove('open'); }
    });
    const compare = document.createElement('button'); compare.type = 'button'; compare.className = 'assistant-compare-add'; compare.textContent = 'مقایسه';
    compare.addEventListener('click', () => addCompare(item));
    actions.append(view, compare); body.append(title, meta, reason, actions); card.appendChild(body); return card;
  }
  const compareItems = [];
  function addCompare(item) {
    if (compareItems.some(x => String(x.p.id) === String(item.p.id))) { say('این محصول از قبل به فهرست مقایسه اضافه شده است.'); return; }
    if (compareItems.length >= 3) { say('برای مقایسه دقیق، حداکثر سه محصول را انتخاب کن.'); return; }
    compareItems.push(item); say('«' + item.p.name + '» به مقایسه اضافه شد. ' + compareItems.length + ' از ۳ محصول انتخاب شده.');
    if (compareItems.length >= 2) showCompare();
  }
  function showCompare() {
    const node = say('مقایسه محصولات انتخاب‌شده:');
    const table = document.createElement('div'); table.className = 'assistant-compare-table';
    compareItems.forEach(({p}) => {
      const row = document.createElement('div'); row.className = 'assistant-compare-row';
      const name = document.createElement('strong'); name.textContent = p.name;
      const price = document.createElement('span'); price.textContent = 'قیمت: ' + priceText(p);
      const stock = document.createElement('span'); stock.textContent = 'موجودی: ' + stockText(p);
      const cat = document.createElement('span'); cat.textContent = 'دسته: ' + (p.category_name || 'ثبت نشده');
      row.append(name, price, stock, cat); table.appendChild(row);
    });
    node.appendChild(table);
    const clear = document.createElement('button'); clear.type='button'; clear.className='assistant-clear-compare'; clear.textContent='شروع مقایسه جدید';
    clear.addEventListener('click',()=>{compareItems.length=0;say('فهرست مقایسه پاک شد. محصولات تازه‌ای انتخاب کن.');});
    node.appendChild(clear);
  }
  function showProducts(items, intro) {
    const node = say(intro);
    if (!items.length) return;
    const list = document.createElement('div'); list.className = 'assistant-products';
    items.forEach((item, i) => list.appendChild(renderProductCard(item, i)));
    node.appendChild(list); messages.scrollTop = messages.scrollHeight;
  }
  function contactLinks(settings) {
    if (!settings) return [];
    return [
      {label:'تماس تلفنی',href:settings.footer_support_phone ? 'tel:' + settings.footer_support_phone : ''},
      {label:'واتساپ',href:settings.footer_whatsapp_phone ? 'https://wa.me/' + String(settings.footer_whatsapp_phone).replace(/\D/g,'') : ''},
      {label:'اینستاگرام',href:settings.footer_instagram_url || ''},
      {label:'تلگرام',href:settings.footer_telegram_url || ''},
      {label:'ایمیل',href:settings.footer_support_email ? 'mailto:' + settings.footer_support_email : ''}
    ];
  }
  function answerInfo(text, intent) {
    const s = state.settings || {};
    if (intent.shipping) {
      const fmt = v => v === null || v === undefined ? 'در تنظیمات ثبت نشده' : money(v) + ' تومان';
      const node = say('هزینه ارسال طبق تنظیمات فعلی فروشگاه:\nارسال داخل شهر: ' + fmt(s.local_shipping_toman) + '\nارسال به شهرهای دیگر: ' + fmt(s.nationwide_shipping_toman) + '\nزمان تحویل در اطلاعات موجود مشخص نشده؛ برای زمان دقیق با پشتیبانی هماهنگ کن.');
      addLinks(node, contactLinks(s)); return true;
    }
    if (intent.payment) {
      let message = 'روش پرداخت بر اساس وضعیت فعلی فروشگاه: ';
      if (s.online_payment_enabled) message += 'پرداخت آنلاین در تنظیمات فعال گزارش شده است.';
      else if (s.payment_enabled) message += 'روش پرداخت ثبت‌شده فروشگاه فعال است.';
      else message += 'روش پرداخت فعالی گزارش نشده است. برای اطمینان از وضعیت سفارش با پشتیبانی هماهنگ کن.';
      const node = say(message); addLinks(node, contactLinks(s)); return true;
    }
    if (intent.returns) {
      const policy = s.policy_returns || s.policy_shipping || '';
      const node = say(policy ? 'اطلاعات ثبت‌شده درباره مرجوعی و ارسال:\n' + policy : 'جزئیات شرایط تعویض و مرجوعی هنوز در تنظیمات عمومی فروشگاه ثبت نشده است؛ برای پاسخ قطعی با پشتیبانی تماس بگیر.');
      addLinks(node, contactLinks(s)); return true;
    }
    if (intent.order) {
      const node = say('پیگیری خودکار سفارش از داخل دستیار هنوز فعال نشده است. برای استعلام وضعیت سفارش، شماره سفارش و شماره موبایلی را که با آن خرید کرده‌ای فقط از راه ارتباطی رسمی فروشگاه برای پشتیبانی ارسال کن. اطلاعات خصوصی را در این گفت‌وگو وارد نکن.');
      addLinks(node, contactLinks(s)); return true;
    }
    if (intent.support) {
      const node = say('برای ارتباط با پشتیبانی، از راه‌های ثبت‌شده فروشگاه استفاده کن. اگر اطلاعاتی ثبت نشده باشد، لینک مربوط نمایش داده نمی‌شود.');
      addLinks(node, contactLinks(s)); return true;
    }
    return false;
  }
  async function respond(raw) {
    const text = normalize(raw); if (!text || state.busy) return;
    say(raw, 'user'); state.busy = true;
    const pending = say('در حال بررسی کاتالوگ و اطلاعات فروشگاه…');
    try {
      if (!state.catalog.length) await loadData();
      pending.remove();
      const intent = classify(text);
      if (intent.greeting) { say('سلام، خوش آمدی 🌷 بگو دنبال چه چیزی هستی؛ می‌توانم محصولات واقعی، قیمت، موجودی و اطلاعات ثبت‌شده فروشگاه را بررسی کنم.'); return; }
      if (answerInfo(text, intent)) return;
      const matches = rankProducts(text, intent);
      if (matches.length) {
        let intro = 'این گزینه‌ها را بر اساس دسته‌بندی، نام، توضیحات، موجودی و بودجه‌ای که گفتی مرتب کردم:';
        if (intent.budget !== null) intro = 'گزینه‌های منطبق با بودجه حدود ' + money(intent.budget) + ' تومان:';
        if (intent.gift) intro = 'برای هدیه، این گزینه‌های موجود را بررسی کن. سلیقه و بودجه‌ات می‌تواند انتخاب را دقیق‌تر کند:';
        if (intent.compare) intro = 'برای مقایسه، دو یا چند محصول را با دکمه «مقایسه» انتخاب کن:';
        showProducts(matches, intro);
      } else if (intent.bags || intent.beauty || intent.accessory) {
        say('در کاتالوگ فعلی محصول منطبق پیدا نکردم. ممکن است محصولی در این دسته هنوز ثبت نشده باشد یا نام دیگری داشته باشد. نام دقیق‌تر یا بودجه‌ات را بنویس.');
      } else {
        say('برای راهنمایی دقیق‌تر، نوع محصول، رنگ، کاربرد یا بودجه‌ات را بنویس. مثلاً «کیف دوشی مشکی تا ۲ میلیون تومان». فقط ویژگی‌هایی را اعلام می‌کنم که در اطلاعات فروشگاه ثبت شده باشند.');
      }
    } catch {
      pending.remove(); say('فعلاً دریافت اطلاعات فروشگاه ممکن نیست. لطفاً کمی بعد دوباره تلاش کن.');
    } finally { state.busy = false; }
  }
  launcher.addEventListener('click', async () => {
    const open = !panel.classList.contains('open'); panel.classList.toggle('open', open);
    launcher.setAttribute('aria-expanded', String(open));
    if (open && !state.greeted) {
      state.greeted = true;
      say('سلام! من مشاور خرید AVELORA هستم. می‌توانم محصولات، قیمت و موجودی را بررسی کنم و در انتخاب و مقایسه کمکت کنم. چه چیزی لازم داری؟');
      input.focus(); try { await loadData(); } catch {}
    }
  });
  panel.querySelector('.assistant-close').addEventListener('click', () => { panel.classList.remove('open'); launcher.setAttribute('aria-expanded','false'); });
  panel.querySelectorAll('[data-prompt]').forEach(button => button.addEventListener('click', () => respond(button.dataset.prompt)));
  $('#assistantForm').addEventListener('submit', event => { event.preventDefault(); const value=input.value.trim(); if (!value) return; input.value=''; respond(value); });
})();
