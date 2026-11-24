
const $=s=>document.querySelector(s);
function safeStorageGet(key,fallback=null){try{return localStorage.getItem(key)??fallback}catch{return fallback}}
function safeStorageSet(key,value){try{localStorage.setItem(key,value);return true}catch{return false}}
function safeStorageRemove(key){try{localStorage.removeItem(key);return true}catch{return false}}
let products=[],cart=(()=>{try{const value=JSON.parse(safeStorageGet('mm_cart','[]'));return Array.isArray(value)?value:[]}catch{return []}})(),category='',storeSettings=null,adCampaigns={home_banner:[],product_feed:[],category_banner:[]};
function getVisitorId(){
  const key='avelora_visitor_id';
  let id=safeStorageGet(key);
  if(!/^[a-f0-9]{32,64}$/i.test(id||'')){
    const bytes=new Uint8Array(24);
    if(window.crypto?.getRandomValues)window.crypto.getRandomValues(bytes);
    else for(let i=0;i<bytes.length;i++)bytes[i]=Math.floor(Math.random()*256);
    id=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
    safeStorageSet(key,id);
  }
  return id;
}
const visitorId=getVisitorId();
const visitorHeaders={'X-Avelora-Visitor':visitorId};
const toman=n=>new Intl.NumberFormat('fa-IR').format(Number(n))+' تومان';
document.querySelector('.mobile-menu')?.addEventListener('click',()=>{
 const target=document.querySelector('#products');
 target?.scrollIntoView({behavior:'smooth',block:'start'});
});
function renderCategoryImages(){
 document.querySelectorAll('.category-entry').forEach(button=>{
  const slug=button.dataset.category;const product=products.find(p=>p.category_slug===slug&&p.image_url);
  if(product){const image=document.createElement('img');image.src=product.image_url;image.alt=button.querySelector('strong')?.textContent||'تصویر دسته‌بندی';image.loading='lazy';button.querySelector('.category-entry-image')?.replaceChildren(image);}
 });
}
function selectCategory(value){
  category=value;
  $('#categories').querySelectorAll('button').forEach(button=>
    button.classList.toggle('active',button.dataset.category===value)
  );
  document.querySelectorAll('.category-entry').forEach(button=>
    button.classList.toggle('active',button.dataset.category===value)
  );
  loadProducts();
}
async function loadCategories(){
  try{
    const response=await fetch('/api/categories');
    if(!response.ok)throw new Error('دریافت دسته‌بندی‌ها ناموفق بود.');
    const cats=await response.json();
    if(!Array.isArray(cats))throw new Error('پاسخ دسته‌بندی‌ها معتبر نیست.');
    const ordered=cats.filter(item=>item&&item.slug).slice(0,8);
    const tiles=document.querySelector('.category-entry-grid');
    if(tiles)tiles.innerHTML=ordered.map(item=>'<button class="category-entry" type="button" data-category="'+escapeHtml(item.slug)+'"><span class="category-entry-image"></span><strong>'+escapeHtml(item.name)+'</strong></button>').join('');
    $('#categories').innerHTML='<button class="active" data-category="">همه محصولات</button>'+
      ordered.map(item=>'<button type="button" data-category="'+escapeHtml(item.slug)+'">'+escapeHtml(item.name)+'</button>').join('');
    $('#categories').querySelectorAll('button').forEach(button=>
      button.addEventListener('click',()=>selectCategory(button.dataset.category))
    );
    renderCategoryImages();
  }catch(error){
    $('#categories').innerHTML='<span class="category-error">دسته‌بندی‌ها بارگذاری نشدند.</span>';
  }
}
document.querySelector('.category-entry-grid')?.addEventListener('click',event=>{
 const button=event.target.closest('.category-entry');if(!button)return;
 selectCategory(button.dataset.category);$('#products').scrollIntoView({behavior:'smooth',block:'start'});
});
async function loadProducts(){
  const q=$('#search').value.trim();
  const p=new URLSearchParams();
  if(category)p.set('category',category);
  if(q)p.set('q',q);
  try{
    const response=await fetch('/api/products?'+p,{headers:visitorHeaders});
    const data=await response.json();
    if(!response.ok||!Array.isArray(data))throw new Error(data.error||'پاسخ محصولات معتبر نیست.');
    products=data;
    renderCategoryImages();
    cart=cart.map(line=>{const p=products.find(x=>String(x.id)===String(line.product_id));return p?{...line,name:p.name,price:Number(p.sale_price_toman??p.price_toman)}:line;});
    safeStorageSet('mm_cart',JSON.stringify(cart));
    renderProducts();
    renderCart();
    if(typeof updateCheckout==='function')updateCheckout();
  }catch{
    products=[];
    $('#productGrid').innerHTML='<p>دریافت محصولات با مشکل روبه‌رو شد. اتصال اینترنت را بررسی و دوباره تلاش کن.</p>';
  }
}
function renderAdBanner(campaign){
  return '<a class="advertising-banner" href="/api/advertising/click/'+encodeURIComponent(campaign.id)+'" target="_blank" rel="sponsored noopener noreferrer"><span class="advertising-label">تبلیغ</span><img src="'+escapeHtml(campaign.image_url)+'" alt="'+escapeHtml(campaign.title)+'" loading="lazy"><span class="advertising-title">'+escapeHtml(campaign.title)+'</span></a>';
 }
function renderAdvertisingSlots(){
  const home=document.getElementById('homeAdSlot');
  const categorySlot=document.getElementById('categoryAdSlot');
  if(home){home.innerHTML=adCampaigns.home_banner.map(renderAdBanner).join('');home.hidden=!adCampaigns.home_banner.length;}
  if(categorySlot){categorySlot.innerHTML=adCampaigns.category_banner.map(renderAdBanner).join('');categorySlot.hidden=!adCampaigns.category_banner.length;}
}
async function toggleProductLike(id,button){
  if(button.disabled)return;
  button.disabled=true;
  try{
    const response=await fetch('/api/engagement/products/'+encodeURIComponent(id)+'/like',{method:'POST',headers:visitorHeaders});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'ثبت لایک انجام نشد.');
    const product=products.find(item=>String(item.id)===String(id));
    if(product){product.liked=data.liked;product.likes_count=data.likes_count;}
    button.classList.toggle('is-liked',data.liked);
    button.setAttribute('aria-pressed',String(data.liked));
    button.setAttribute('aria-label',data.liked?'حذف لایک':'لایک محصول');
    button.querySelector('span').textContent=data.liked?'♥':'♡';
    button.querySelector('b').textContent=new Intl.NumberFormat('fa-IR').format(data.likes_count);
  }catch(error){alert(error.message)}
  finally{button.disabled=false}
}

function renderProducts(){
  const cards=products.map(p=>`<article class="product">
    <button type="button" class="product-view" data-open-product="${escapeHtml(p.id)}" aria-label="مشاهده مشخصات ${escapeHtml(p.name)}">
      ${p.image_url?`<img class="product-image" src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" loading="lazy">`:'<div class="placeholder">👜</div>'}
      <div class="product-info"><h3>${escapeHtml(p.name)}</h3><div class="price">${toman(p.sale_price_toman??p.price_toman)}</div>${p.sale_price_toman? `<span class="old">${toman(p.price_toman)}</span>`:''}<div class="stock">${p.stock>0?'موجود در انبار':'ناموجود'}</div></div>
    </button>
    <div class="product-engagement">
      <button type="button" class="product-like ${p.liked?'is-liked':''}" data-like-product="${escapeHtml(p.id)}" aria-pressed="${p.liked?'true':'false'}" aria-label="${p.liked?'حذف لایک':'لایک محصول'}">
        <span aria-hidden="true">${p.liked?'♥':'♡'}</span><b>${new Intl.NumberFormat('fa-IR').format(Number(p.likes_count)||0)}</b><small>پسند</small>
      </button>
    </div>
    <button class="add" type="button" ${p.stock<1?'disabled':''} data-add-cart="${escapeHtml(p.id)}">افزودن به سبد</button>
  </article>`);
  const sponsored=adCampaigns.product_feed[0];
  if(sponsored){
    const card='<article class="product sponsored-product"><a class="sponsored-product-link" href="/api/advertising/click/'+encodeURIComponent(sponsored.id)+'" target="_blank" rel="sponsored noopener noreferrer"><span class="advertising-label">تبلیغ</span><img class="product-image" src="'+escapeHtml(sponsored.image_url)+'" alt="'+escapeHtml(sponsored.title)+'" loading="lazy"><div class="product-info"><h3>'+escapeHtml(sponsored.title)+'</h3><span>مشاهده معرفی</span></div></a></article>';
    cards.splice(Math.min(3,cards.length),0,card);
  }
  $('#productGrid').innerHTML=cards.length?cards.join(''):'<p>هنوز محصولی برای نمایش ثبت نشده است.</p>';
}
async function loadAdvertising(){
  const placements=['home_banner','product_feed','category_banner'];
  const results=await Promise.all(placements.map(async placement=>{
    try{const response=await fetch('/api/advertising/campaigns/'+placement,{headers:visitorHeaders});if(!response.ok)return [placement,[]];const data=await response.json();return [placement,Array.isArray(data)?data:[]];}
    catch{return [placement,[]];}
  }));
  for(const [placement,campaigns] of results)adCampaigns[placement]=campaigns;
  renderAdvertisingSlots();renderProducts();
}
$('#productGrid').addEventListener('click',event=>{
  const likeButton=event.target.closest?.('[data-like-product]');
  if(likeButton){toggleProductLike(likeButton.dataset.likeProduct,likeButton);return}
  const addButton=event.target.closest?.('[data-add-cart]');
  if(addButton){if(!addButton.disabled){const p=products.find(x=>String(x.id)===addButton.dataset.addCart);if(p)openProductDetails(p)}return}
  const viewButton=event.target.closest?.('[data-open-product]');
  if(viewButton){
    const product=products.find(p=>String(p.id)===String(viewButton.dataset.openProduct));
    if(product)openProductDetails(product);
  }
});
$('#productDialogClose').addEventListener('click',()=>$('#productDialog').close());
$('#productDialog').addEventListener('click',event=>{
  if(event.target===$('#productDialog'))$('#productDialog').close();
});
document.addEventListener('error',event=>{
  const img=event.target;
  if(img instanceof HTMLImageElement&&img.classList.contains('product-image')){
    const fallback=document.createElement('div');
    fallback.className='placeholder';
    fallback.textContent='👜';
    img.replaceWith(fallback);
  }
},true);
function openProductDetails(p){
  const images=(p.images||[]).map(x=>x.image_url).filter(Boolean);
  if(!images.length&&p.image_url)images.push(p.image_url);
  const colors=p.colors||[];
  const first=images[0]||'';
  const gallery=images.length
    ? '<div class="detail-gallery"><img id="detailMainImage" class="detail-image product-image" src="'+escapeHtml(first)+'" alt="'+escapeHtml(p.name)+'">'+
      (images.length>1?'<div class="detail-thumbnails">'+images.map((url,i)=>'<button type="button" data-detail-image="'+i+'" aria-label="نمایش عکس '+(i+1)+'"><img src="'+escapeHtml(url)+'" alt=""></button>').join('')+'</div>':'')+'</div>'
    : '<div class="placeholder detail-placeholder">👜</div>';
  $('#productDialogContent').innerHTML=gallery+'<div class="detail-copy">'+
    '<span class="eyebrow">'+escapeHtml(p.category_name||'محصول AVELORA')+'</span>'+
    '<h2>'+escapeHtml(p.name)+'</h2><div class="price detail-price">'+toman(p.sale_price_toman??p.price_toman)+'</div>'+
    (p.sale_price_toman?'<span class="old">'+toman(p.price_toman)+'</span>':'')+
    '<p class="detail-description">'+escapeHtml(p.description||'توضیحاتی برای این محصول ثبت نشده است.')+'</p>'+
    (colors.length?'<label>انتخاب رنگ<select id="detailColor"><option value="">انتخاب رنگ</option>'+colors.map(c=>'<option value="'+escapeHtml(c.id)+'" '+(Number(c.stock)<1?'disabled':'')+'>'+escapeHtml(c.name)+' — '+(Number(c.stock)>0?'موجودی '+Number(c.stock).toLocaleString('fa-IR'):'ناموجود')+'</option>').join('')+'</select></label>':'')+
    '<label>تعداد<input id="detailQuantity" type="number" min="1" max="20" value="1"></label>'+
    '<p id="detailStock" class="stock">'+(colors.length?'ابتدا رنگ را انتخاب کن.':(p.stock>0?'موجود در انبار':'ناموجود'))+'</p>'+
    '<button class="primary" type="button" data-detail-add="'+escapeHtml(p.id)+'" '+(p.stock<1?'disabled':'')+'>افزودن به سبد خرید</button></div>';
  const colorSelect=$('#detailColor'), quantity=$('#detailQuantity'), add=$('#productDialogContent').querySelector('[data-detail-add]');
  const update=()=>{
    const selected=colors.find(c=>String(c.id)===String(colorSelect?.value));
    const available=selected?Number(selected.stock):Number(p.stock);
    $('#detailStock').textContent=colors.length?(selected?'موجودی '+selected.stock.toLocaleString('fa-IR')+' عدد':'ابتدا رنگ را انتخاب کن.'):(available>0?'موجود در انبار':'ناموجود');
    add.disabled=available<1||(colors.length&&!selected);
    quantity.max=String(Math.min(20,available||20));
    if(Number(quantity.value)>Number(quantity.max))quantity.value=quantity.max;
  };
  colorSelect?.addEventListener('change',update);quantity.addEventListener('input',update);
  $('#productDialogContent').querySelectorAll('[data-detail-image]').forEach(button=>button.addEventListener('click',()=>{
    $('#detailMainImage').src=images[Number(button.dataset.detailImage)];
  }));
  add.addEventListener('click',()=>{
    const selected=colors.find(c=>String(c.id)===String(colorSelect?.value));
    const qty=Math.max(1,Math.min(20,Number(quantity.value)||1));
    addCart(p.id,selected?.id??null,selected?.name??'',qty);$('#productDialog').close();
  });
  $('#productDialog').showModal();update();
}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function addCart(id,colorId=null,colorName='',qty=1){
  id=String(id);const p=products.find(x=>String(x.id)===id);if(!p)return;
  const key=x=>String(x.product_id)===id&&String(x.color_id??'')===String(colorId??'');
  const line=cart.find(key);
  if(line)line.quantity=Math.min(20,line.quantity+qty);
  else cart.push({product_id:id,color_id:colorId,color_name:colorName,name:p.name,price:Number(p.sale_price_toman??p.price_toman),quantity:qty});
  saveCart();
}
function saveCart(){safeStorageSet('mm_cart',JSON.stringify(cart));$('#cartCount').textContent=tomanCount(cart.reduce((a,x)=>a+x.quantity,0));renderCart();if(typeof updateCheckout==='function')updateCheckout()}
function tomanCount(n){return new Intl.NumberFormat('fa-IR').format(n)}
function renderCart(){$('#cartItems').innerHTML=cart.map((x,i)=>'<div class="cart-line"><span>'+escapeHtml(x.name)+(x.color_name?' — رنگ '+escapeHtml(x.color_name):'')+' × '+tomanCount(x.quantity)+'<br><small>'+toman(x.price*x.quantity)+'</small></span><div><button data-cart-minus="'+i+'" type="button">−</button><button data-cart-plus="'+i+'" type="button">+</button><button data-remove-cart="'+i+'" type="button">حذف</button></div></div>').join('')||'<p>سبد خرید خالی است.</p>';$('#cartTotal').textContent=toman(cart.reduce((a,x)=>a+x.price*x.quantity,0))}
$('#cartItems').addEventListener('click',event=>{
  const remove=event.target.closest?.('[data-remove-cart]');
  const plus=event.target.closest?.('[data-cart-plus]');
  const minus=event.target.closest?.('[data-cart-minus]');
  if(remove)removeCart(Number(remove.dataset.removeCart));
  if(plus||minus){const i=Number((plus||minus).dataset[plus?'cartPlus':'cartMinus']);if(cart[i]){cart[i].quantity=Math.max(1,Math.min(20,cart[i].quantity+(plus?1:-1)));saveCart();}}
});
function removeCart(index){cart.splice(index,1);saveCart()}
function toggleCart(show){$('#cartPanel').classList.toggle('hidden',!show);$('#scrim').classList.toggle('hidden',!show)}
$('#cartOpen').addEventListener('click',()=>toggleCart(true));
$('#cartClose').addEventListener('click',()=>toggleCart(false));
$('#scrim').addEventListener('click',()=>toggleCart(false));
let productSearchTimer=null;
function scheduleProductSearch(){clearTimeout(productSearchTimer);productSearchTimer=setTimeout(()=>loadProducts(),250)}
$('#search').addEventListener('input',scheduleProductSearch);
const headerSearch=document.getElementById('headerSearch');
if(headerSearch)headerSearch.addEventListener('input',()=>{$('#search').value=headerSearch.value;scheduleProductSearch();});
document.getElementById('mobileCart')?.addEventListener('click',()=>document.getElementById('cartOpen')?.click());
function normalizeMobile(value){
  let phone=String(value??'').replace(/[۰-۹٠-٩]/g,d=>{
    const code=d.charCodeAt(0);
    return String(code>=0x06F0&&code<=0x06F9?code-0x06F0:code-0x0660);
  }).trim().replace(/[\s-]/g,'');
  if(phone.startsWith('+98'))phone='0'+phone.slice(3);
  else if(phone.startsWith('0098'))phone='0'+phone.slice(4);
  return phone;
}
function selectedShipping(){
  if(!storeSettings)return null;
  const method=$('#orderForm').elements.delivery_method.value;
  const value=method==='local'?storeSettings.local_shipping_toman:storeSettings.nationwide_shipping_toman;
  return value===null||value===undefined||value===''?null:Number(value);
}
function updateCheckout(){
  const summary=$('#checkoutSummary');
  const button=$('#submitOrder');
  const shipping=selectedShipping();
  const subtotal=cart.reduce((sum,item)=>sum+Number(item.price)*Number(item.quantity),0);
  if(!storeSettings){summary.textContent='تنظیمات فروشگاه دریافت نشد. فعلاً امکان ثبت سفارش وجود ندارد.';button.disabled=true;return}
  if(storeSettings.payment_enabled!==true&&storeSettings.online_payment_enabled!==true){summary.textContent='هیچ روش پرداختی برای فروشگاه فعال نیست؛ امکان ثبت سفارش فعلاً وجود ندارد.';button.disabled=true;return}
  if(shipping===null||!Number.isSafeInteger(shipping)||shipping<0){summary.textContent='تعرفه روش ارسال انتخاب‌شده هنوز توسط مدیر تعیین نشده است.';button.disabled=true;return}
  summary.textContent=`جمع کالاها: ${toman(subtotal)} | هزینه ارسال: ${toman(shipping)} | مبلغ نهایی: ${toman(subtotal+shipping)}`;
  button.disabled=cart.length===0;
}
function renderPaymentDetails(){
  const box=$('#paymentDetails');
  if(!storeSettings||storeSettings.payment_enabled!==true){box.hidden=true;box.textContent='';return}
  const rows=[];
  if(storeSettings.bank_name)rows.push(`<div>بانک: ${escapeHtml(storeSettings.bank_name)}</div>`);
  if(storeSettings.card_number)rows.push(`<div>شماره کارت: <b>${escapeHtml(storeSettings.card_number)}</b></div>`);
  if(storeSettings.cardholder_name)rows.push(`<div>به نام: ${escapeHtml(storeSettings.cardholder_name)}</div>`);
  if(storeSettings.iban)rows.push(`<div>شماره شبا: ${escapeHtml(storeSettings.iban)}</div>`);
  if(storeSettings.payment_instructions)rows.push(`<div>${escapeHtml(storeSettings.payment_instructions)}</div>`);
  box.innerHTML='<strong>اطلاعات پرداخت کارت‌به‌کارت</strong>'+rows.join('');
  box.hidden=rows.length===0;
}

async function loadCustomerFeedback(){
  const box=document.getElementById('customerFeedbackList');
  if(!box)return;
  try{
    const response=await fetch('/api/engagement/reviews');
    const data=await response.json();
    if(!response.ok||!Array.isArray(data))throw new Error();
    box.innerHTML=data.length?data.map(item=>'<article class="customer-feedback-card">'+
      '<div class="customer-feedback-meta"><strong>'+escapeHtml(item.display_name)+'</strong><span>'+
      (item.feedback_type==='suggestion'?'پیشنهاد مشتری':'نظر مشتری')+'</span></div><p>'+
      escapeHtml(item.message)+'</p><small>'+new Date(item.created_at).toLocaleDateString('fa-IR')+
      '</small></article>').join(''):'<p class="feedback-empty">هنوز دیدگاه تأییدشده‌ای ثبت نشده است. اولین نفر باش و نظرت را با ما به اشتراک بگذار.</p>';
  }catch{box.textContent='دریافت دیدگاه‌ها در حال حاضر ممکن نیست.';}
}
const feedbackForm=document.getElementById('customerFeedbackForm');
if(feedbackForm){
  feedbackForm.addEventListener('submit',async event=>{
    event.preventDefault();
    const button=feedbackForm.querySelector('button[type=submit]');
    const status=document.getElementById('feedbackMessage');
    const body=Object.fromEntries(new FormData(feedbackForm).entries());
    button.disabled=true;status.textContent='در حال ثبت دیدگاه...';
    try{
      const response=await fetch('/api/engagement/reviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||'ثبت دیدگاه انجام نشد.');
      feedbackForm.reset();status.textContent=data.message||'دیدگاهت پس از بررسی نمایش داده می‌شود.';
    }catch(error){status.textContent=error.message;}
    finally{button.disabled=false;}
  });
}

function renderFooterSettings(data){
  const setLink=(id,url)=>{
    const node=document.getElementById(id);
    if(!node)return false;
    if(!url){node.hidden=true;node.removeAttribute('href');return false;}
    node.href=url;node.hidden=false;return true;
  };
  const safeSocial=value=>{
    try{const u=new URL(String(value||''));return u.protocol==='https:'?u.href:'';}catch{return '';}
  };
  const links=[];
  links.push(setLink('footerInstagram',safeSocial(data.footer_instagram_url)));
  const whatsapp=String(data.footer_whatsapp_phone||'').replace(/[^0-9]/g,'');
  links.push(setLink('footerWhatsapp',whatsapp?('https://wa.me/'+whatsapp):''));
  links.push(setLink('footerBale',safeSocial(data.footer_bale_url)));
  links.push(setLink('footerTelegram',safeSocial(data.footer_telegram_url)));
  const phone=String(data.footer_support_phone||'').trim();
  const phoneLink=phone.replace(/[^0-9+]/g,'');
  const phoneVisible=setLink('footerPhone',phoneLink?('tel:'+phoneLink):'');
  const phoneText=document.getElementById('footerPhoneText');
  if(phoneText)phoneText.textContent=phone;
  const email=String(data.footer_support_email||'').trim();
  const emailVisible=setLink('footerEmail',email?'mailto:'+email:'');
  const emailText=document.getElementById('footerEmailText');
  if(emailText)emailText.textContent=email;
  const about=document.getElementById('footerAbout');
  if(about&&data.footer_about)about.textContent=data.footer_about;
  const address=document.getElementById('footerAddress');
  if(address){address.textContent=data.footer_address?'نشانی: '+data.footer_address:'';address.hidden=!data.footer_address;}
  const hours=document.getElementById('footerHours');
  if(hours){hours.textContent=data.footer_hours?'ساعات پاسخ‌گویی: '+data.footer_hours:'';hours.hidden=!data.footer_hours;}
  const fallback=document.getElementById('footerContactFallback');
  if(fallback)fallback.hidden=links.some(Boolean)||phoneVisible||emailVisible||!!data.footer_address||!!data.footer_hours;
}
async function loadStoreSettings(){
  try{
    const r=await fetch('/api/store-settings');
    const data=await r.json();
    if(!r.ok)throw new Error(data.error||'دریافت تنظیمات فروشگاه ناموفق بود.');
    storeSettings=data;
    renderPaymentDetails();
    renderFooterSettings(data);
  }catch(error){
    storeSettings=null;
    $('#checkoutSummary').textContent=error.message||'دریافت تنظیمات فروشگاه ناموفق بود.';
  }
  updateCheckout();
}
const policyTitles = {
  terms: 'قوانین و مقررات خرید',
  privacy: 'حریم خصوصی',
  shipping: 'شرایط ارسال و تحویل',
  returns: 'تعویض و مرجوعی'
};
let storePolicies = null;
async function loadStorePolicies(){
  try{
    const response=await fetch('/api/store-policies');
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'دریافت راهنمای فروشگاه ناموفق بود.');
    storePolicies=data;
  }catch{
    storePolicies=null;
  }
}
document.querySelectorAll('[data-policy]').forEach(link=>{
  link.addEventListener('click',event=>{
    event.preventDefault();
    const key=link.dataset.policy;
    const dialog=document.getElementById('policyDialog');
    const title=document.getElementById('policyDialogTitle');
    const body=document.getElementById('policyDialogBody');
    if(!dialog||!title||!body||!policyTitles[key])return;
    title.textContent=policyTitles[key];
    const content=storePolicies&&String(storePolicies['policy_'+key]||'').trim();
    body.textContent=content||'این بخش هنوز توسط مدیریت فروشگاه تکمیل و منتشر نشده است.';
    if(!dialog.open)dialog.showModal();
  });
});
document.getElementById('policyDialogClose')?.addEventListener('click',()=>{
  document.getElementById('policyDialog')?.close();
});
document.getElementById('policyDialog')?.addEventListener('click',event=>{
  if(event.target===event.currentTarget)event.currentTarget.close();
});
$('#orderForm').elements.delivery_method.addEventListener('change',updateCheckout);
$('#orderForm').onsubmit=async e=>{
  e.preventDefault();
  if(!cart.length){$('#orderMessage').textContent='سبد خرید خالی است.';return}
  updateCheckout();
  if($('#submitOrder').disabled){$('#orderMessage').textContent='ابتدا تنظیمات پرداخت و ارسال فروشگاه باید تکمیل شود.';return}
  const f=new FormData(e.target);
  const customer={name:f.get('name'),phone:f.get('phone'),province:f.get('province'),city:f.get('city'),address:f.get('address'),postal_code:f.get('postal_code')};
  const payload={customer,items:cart.map(x=>({product_id:x.product_id,color_id:x.color_id??null,quantity:x.quantity})),delivery_method:f.get('delivery_method'),note:f.get('note')};
  $('#orderMessage').textContent='در حال ثبت سفارش...';
  $('#submitOrder').disabled=true;
  try{
    const fingerprint=JSON.stringify(payload);
    let pending=null;
    try{pending=JSON.parse(safeStorageGet('mm_pending_order','null'))}catch{}
    if(!pending||pending.fingerprint!==fingerprint){
      const key=crypto.randomUUID?crypto.randomUUID():
        Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');
      pending={key,fingerprint};
      safeStorageSet('mm_pending_order',JSON.stringify(pending));
    }
    const r=await fetch('/api/orders',{method:'POST',headers:{
      'Content-Type':'application/json',
      'Idempotency-Key':pending.key
    },body:JSON.stringify(payload)});
    const data=await r.json();
    if(!r.ok)throw new Error(data.error||'ثبت سفارش انجام نشد');
    if(storeSettings.online_payment_enabled===true){
      $('#orderMessage').textContent='سفارش ثبت شد؛ در حال ساخت لینک امن پرداخت زرین‌پال...';
      const paymentResponse=await fetch('/api/payments/zarinpal/request',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({order_code:data.order_code,phone:normalizeMobile(customer.phone)})
      });
      const paymentData=await paymentResponse.json().catch(()=>({}));
      if(!paymentResponse.ok||!paymentData.redirect_url){
        throw new Error(`سفارش ${data.order_code} ثبت شد، اما لینک پرداخت ساخته نشد. دوباره با همین سبد تلاش کن؛ سفارش تکراری ثبت نمی‌شود. ${paymentData.error||''}`);
      }
      window.location.assign(paymentData.redirect_url);
      return;
    }
    $('#orderMessage').textContent=`سفارش ${data.order_code} ثبت شد. جمع کالاها: ${toman(data.subtotal_toman)}؛ هزینه ارسال: ${toman(data.shipping_toman)}؛ مبلغ نهایی: ${toman(data.total_toman)}. لطفاً مبلغ را به حساب اعلام‌شده در بخش اطلاعات پرداخت واریز کنید.`;
    safeStorageRemove('mm_pending_order');
    cart=[];saveCart();e.target.reset();
  }catch(error){
    $('#orderMessage').textContent=error.message;
  }
  updateCheckout();
};
loadCategories();loadProducts();loadAdvertising();loadCustomerFeedback();saveCart();loadStoreSettings();loadStorePolicies();

(function showPaymentResult(){
  const params=new URLSearchParams(location.search);
  const status=params.get('payment');
  const order=params.get('order');
  if(!status)return;
  const message=$('#orderMessage');
  if(message){
    message.textContent=status==='success'
      ? 'پرداخت سفارش '+(order||'')+' توسط زرین‌پال تأیید شد. سفارش در پنل مدیریت ثبت شده است.'
      : 'پرداخت سفارش '+(order||'')+' تکمیل یا تأیید نشد. اگر مبلغ از حسابت کسر شده، پیش از پرداخت دوباره با پشتیبانی فروشگاه تماس بگیر.';
  }
  if(status==='success'){
    cart=[];localStorage.removeItem('mm_pending_order');saveCart();
  }
  params.delete('payment');params.delete('order');
  const query=params.toString();
  history.replaceState({},'',location.pathname+(query?'?'+query:'')+location.hash);
})();


document.addEventListener('avelora:auth-changed',()=>loadProducts());
