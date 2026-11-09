
const $=s=>document.querySelector(s);let products=[],cart=JSON.parse(localStorage.getItem('mm_cart')||'[]'),category='',storeSettings=null;
const toman=n=>new Intl.NumberFormat('fa-IR').format(Number(n))+' تومان';
async function loadCategories(){try{const r=await fetch('/api/categories');if(!r.ok)throw new Error();const cats=await r.json();$('#categories').innerHTML='<button class="active" data-category="">همه</button>'+cats.map(c=>`<button data-category="${escapeHtml(c.slug)}">${escapeHtml(c.name)}</button>`).join('');$('#categories').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{category=b.dataset.category;$('#categories').querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));loadProducts()}))}catch{}}
async function loadProducts(){const q=$('#search').value.trim();const p=new URLSearchParams();if(category)p.set('category',category);if(q)p.set('q',q);try{products=await fetch('/api/products?'+p).then(r=>r.json());renderProducts()}catch{$('#productGrid').innerHTML='<p>ارتباط با فروشگاه برقرار نشد.</p>'}}
function renderProducts(){
  $('#productGrid').innerHTML=products.length?products.map(p=>`<article class="product">
    <button type="button" class="product-view" data-open-product="${escapeHtml(p.id)}" aria-label="مشاهده مشخصات ${escapeHtml(p.name)}">
      ${p.image_url?`<img class="product-image" src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" loading="lazy">`:'<div class="placeholder">👜</div>'}
      <div class="product-info"><h3>${escapeHtml(p.name)}</h3><div class="price">${toman(p.sale_price_toman??p.price_toman)}</div>${p.sale_price_toman? `<span class="old">${toman(p.price_toman)}</span>`:''}<div class="stock">${p.stock>0?'موجود در انبار':'ناموجود'}</div></div>
    </button>
    <button class="add" type="button" ${p.stock<1?'disabled':''} data-add-cart="${escapeHtml(p.id)}">افزودن به سبد</button>
  </article>`).join(''):'<p>هنوز محصولی برای نمایش ثبت نشده است.</p>';
}
$('#productGrid').addEventListener('click',event=>{
  const addButton=event.target.closest?.('[data-add-cart]');
  if(addButton){if(!addButton.disabled)addCart(addButton.dataset.addCart);return}
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
  const image=p.image_url
    ? `<img class="detail-image product-image" src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}">`
    : '<div class="placeholder detail-placeholder">👜</div>';
  $('#productDialogContent').innerHTML=`
    ${image}
    <div class="detail-copy">
      <span class="eyebrow">${escapeHtml(p.category_name||'محصول AVELORA')}</span>
      <h2>${escapeHtml(p.name)}</h2>
      <div class="price detail-price">${toman(p.sale_price_toman??p.price_toman)}</div>
      ${p.sale_price_toman?`<span class="old">${toman(p.price_toman)}</span>`:''}
      <p class="detail-description">${escapeHtml(p.description||'توضیحاتی برای این محصول ثبت نشده است.')}</p>
      <p class="stock">${p.stock>0?'موجود در انبار':'ناموجود'}</p>
      <button class="primary" type="button" data-detail-add="${escapeHtml(p.id)}" ${p.stock<1?'disabled':''}>افزودن به سبد خرید</button>
    </div>`;
  const add=$('#productDialogContent').querySelector('[data-detail-add]');
  add.addEventListener('click',()=>{addCart(p.id);$('#productDialog').close()});
  $('#productDialog').showModal();
}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function addCart(id){id=String(id);const p=products.find(x=>String(x.id)===id);if(!p)return;const line=cart.find(x=>String(x.product_id)===id);if(line)line.quantity=Math.min(20,line.quantity+1);else cart.push({product_id:id,name:p.name,price:Number(p.sale_price_toman??p.price_toman),quantity:1});saveCart()}
function saveCart(){localStorage.setItem('mm_cart',JSON.stringify(cart));$('#cartCount').textContent=tomanCount(cart.reduce((a,x)=>a+x.quantity,0));renderCart();if(typeof updateCheckout==='function')updateCheckout()}
function tomanCount(n){return new Intl.NumberFormat('fa-IR').format(n)}
function renderCart(){$('#cartItems').innerHTML=cart.map(x=>`<div class="cart-line"><span>${escapeHtml(x.name)} × ${tomanCount(x.quantity)}<br><small>${toman(x.price*x.quantity)}</small></span><button data-remove-cart="${escapeHtml(x.product_id)}">حذف</button></div>`).join('')||'<p>سبد خرید خالی است.</p>';$('#cartTotal').textContent=toman(cart.reduce((a,x)=>a+x.price*x.quantity,0))}
$('#cartItems').addEventListener('click',event=>{
  const button=event.target.closest?.('[data-remove-cart]');
  if(button)removeCart(button.dataset.removeCart);
});
function removeCart(id){cart=cart.filter(x=>String(x.product_id)!==String(id));saveCart()}
function toggleCart(show){$('#cartPanel').classList.toggle('hidden',!show);$('#scrim').classList.toggle('hidden',!show)}
$('#cartOpen').addEventListener('click',()=>toggleCart(true));
$('#cartClose').addEventListener('click',()=>toggleCart(false));
$('#scrim').addEventListener('click',()=>toggleCart(false));
$('#search').addEventListener('input',()=>loadProducts());
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
  if(storeSettings.payment_enabled!==true){summary.textContent='پرداخت فروشگاه هنوز فعال نشده است؛ امکان ثبت سفارش فعلاً وجود ندارد.';button.disabled=true;return}
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
async function loadStoreSettings(){
  try{
    const r=await fetch('/api/store-settings');
    const data=await r.json();
    if(!r.ok)throw new Error(data.error||'دریافت تنظیمات فروشگاه ناموفق بود.');
    storeSettings=data;
    renderPaymentDetails();
  }catch(error){
    storeSettings=null;
    $('#checkoutSummary').textContent=error.message||'دریافت تنظیمات فروشگاه ناموفق بود.';
  }
  updateCheckout();
}
$('#orderForm').elements.delivery_method.addEventListener('change',updateCheckout);
$('#orderForm').onsubmit=async e=>{
  e.preventDefault();
  if(!cart.length){$('#orderMessage').textContent='سبد خرید خالی است.';return}
  updateCheckout();
  if($('#submitOrder').disabled){$('#orderMessage').textContent='ابتدا تنظیمات پرداخت و ارسال فروشگاه باید تکمیل شود.';return}
  const f=new FormData(e.target);
  const customer={name:f.get('name'),phone:f.get('phone'),province:f.get('province'),city:f.get('city'),address:f.get('address'),postal_code:f.get('postal_code')};
  const payload={customer,items:cart.map(x=>({product_id:x.product_id,quantity:x.quantity})),delivery_method:f.get('delivery_method'),note:f.get('note')};
  $('#orderMessage').textContent='در حال ثبت سفارش...';
  $('#submitOrder').disabled=true;
  try{
    const fingerprint=JSON.stringify(payload);
    let pending=null;
    try{pending=JSON.parse(localStorage.getItem('mm_pending_order')||'null')}catch{}
    if(!pending||pending.fingerprint!==fingerprint){
      const key=crypto.randomUUID?crypto.randomUUID():
        Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');
      pending={key,fingerprint};
      localStorage.setItem('mm_pending_order',JSON.stringify(pending));
    }
    const r=await fetch('/api/orders',{method:'POST',headers:{
      'Content-Type':'application/json',
      'Idempotency-Key':pending.key
    },body:JSON.stringify(payload)});
    const data=await r.json();
    if(!r.ok)throw new Error(data.error||'ثبت سفارش انجام نشد');
    $('#orderMessage').textContent=`سفارش ${data.order_code} ثبت شد. جمع کالاها: ${toman(data.subtotal_toman)}؛ هزینه ارسال: ${toman(data.shipping_toman)}؛ مبلغ نهایی: ${toman(data.total_toman)}. لطفاً مبلغ را به حساب اعلام‌شده در بخش اطلاعات پرداخت واریز کنید.`;
    localStorage.removeItem('mm_pending_order');
    cart=[];saveCart();e.target.reset();
  }catch(error){
    $('#orderMessage').textContent=error.message;
  }
  updateCheckout();
};
loadCategories();loadProducts();saveCart();loadStoreSettings();
