const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const toman=value=>new Intl.NumberFormat('fa-IR').format(Number(value))+' تومان';
let packages=[];
async function loadContact(){
 const target=document.getElementById('adContact');
 try{
  const response=await fetch('/api/store-settings');const data=await response.json();
  if(!response.ok)throw new Error();
  const links=[];
  if(data.footer_whatsapp_phone)links.push('<a href="https://wa.me/'+encodeURIComponent(data.footer_whatsapp_phone)+'" target="_blank" rel="noopener noreferrer">واتساپ</a>');
  if(data.footer_support_phone)links.push('<a href="tel:'+encodeURIComponent(data.footer_support_phone)+'">تلفن '+escapeHtml(data.footer_support_phone)+'</a>');
  if(data.footer_support_email)links.push('<a href="mailto:'+encodeURIComponent(data.footer_support_email)+'">ایمیل '+escapeHtml(data.footer_support_email)+'</a>');
  for(const [key,label] of [['footer_instagram_url','اینستاگرام'],['footer_telegram_url','تلگرام'],['footer_bale_url','بله']]){
   if(data[key]){try{const url=new URL(data[key]);if(url.protocol==='https:'&&url.hostname)links.push('<a href="'+escapeHtml(url.toString())+'" target="_blank" rel="noopener noreferrer">'+label+'</a>');}catch{}}
  }
  target.innerHTML=links.length?'برای هماهنگی درباره درخواست، از راه‌های رسمی زیر استفاده کنید: '+links.join(' · '):'در حال حاضر فرم ثبت درخواست، راه اصلی ارسال پیشنهاد تبلیغاتی است. کد پیگیری را پس از ثبت نگه دارید.';
 }catch{target.textContent='برای شروع همکاری، فرم درخواست تبلیغات را تکمیل کنید.';}
}
async function loadPackages(){
 const target=document.getElementById('adPackages'),select=document.getElementById('adPackageSelect');
 try{
  const response=await fetch('/api/advertising/packages');
  const data=await response.json();
  if(!response.ok||!Array.isArray(data))throw new Error(data.error||'دریافت جایگاه‌ها انجام نشد.');
  packages=data;
  target.innerHTML=data.map(item=>{
   const pricing=item.rate_toman===null?'تعرفه پس از بررسی':item.pricing_model==='daily'?toman(item.rate_toman)+' به‌ازای هر روز':item.pricing_model==='cpm'?toman(item.rate_toman)+' به‌ازای هر هزار نمایش':item.pricing_model==='cpc'?toman(item.rate_toman)+' به‌ازای هر کلیک':'استعلام قیمت';
   return '<article class="ad-package"><h3>'+escapeHtml(item.title)+'</h3><p>'+escapeHtml(item.description)+'</p><div class="ad-price">'+escapeHtml(pricing)+'</div></article>';
  }).join('')||'<p>در حال حاضر جایگاه تبلیغاتی فعالی برای سفارش وجود ندارد.</p>';
  select.innerHTML='<option value="">انتخاب جایگاه</option>'+data.map(x=>'<option value="'+escapeHtml(x.id)+'">'+escapeHtml(x.title)+'</option>').join('');
 }catch(error){target.textContent=error.message;select.innerHTML='<option value="">جایگاه‌ها در دسترس نیستند</option>';}
}
document.getElementById('adRequestForm').addEventListener('submit',async event=>{
 event.preventDefault();
 const form=event.currentTarget,button=form.querySelector('button[type="submit"]'),message=document.getElementById('adRequestMessage');
 const data=Object.fromEntries(new FormData(form).entries());
 for(const key of ['target_impressions','target_clicks','budget_toman'])if(data[key]==='')delete data[key];
 button.disabled=true;message.textContent='در حال ثبت درخواست...';
 try{
  const response=await fetch('/api/advertising/requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const result=await response.json();
  if(!response.ok)throw new Error(result.error||'ثبت درخواست انجام نشد.');
  message.textContent='درخواست شما با کد '+result.request.request_code+' ثبت شد. '+result.message;
  form.reset();
 }catch(error){message.textContent=error.message;}
 finally{button.disabled=false;}
});
loadPackages();loadContact();
