const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const toman=value=>new Intl.NumberFormat('fa-IR').format(Number(value||0))+' تومان';
const headers={'Content-Type':'application/json','x-admin-request':'1'};
async function api(url,options={}){
 const response=await fetch(url,{credentials:'same-origin',...options,headers:{...headers,...(options.headers||{})}});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.error||'درخواست انجام نشد.');
 return data;
}
function say(value){$('#message').textContent=value;}
function localDate(date){
 const pad=n=>String(n).padStart(2,'0');
 return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate())+'T'+pad(date.getHours())+':'+pad(date.getMinutes());
}
const modelNames={daily:'روزانه',cpm:'به‌ازای هر هزار نمایش',cpc:'به‌ازای هر کلیک',custom:'استعلام و توافق'};
async function loadPackages(){
 const items=await api('/api/admin/advertising/packages');
 $('#packages').innerHTML=items.map(x=>'<article class="card" data-package="'+esc(x.id)+'"><b>'+esc(x.title)+'</b><p class="muted">'+esc(x.description)+'</p><div class="grid"><label>روش قیمت‌گذاری<select data-model>'+Object.entries(modelNames).map(([k,v])=>'<option value="'+k+'" '+(x.pricing_model===k?'selected':'')+'>'+v+'</option>').join('')+'</select></label><label>نرخ (تومان)<input data-rate type="number" min="0" step="1" value="'+(x.rate_toman??'')+'" placeholder="خالی = استعلام قیمت"></label><label><span>وضعیت</span><select data-active><option value="true" '+(x.is_active?'selected':'')+'>فعال</option><option value="false" '+(!x.is_active?'selected':'')+'>غیرفعال</option></select></label></div><button type="button" data-save-package>ذخیره تعرفه</button></article>').join('')||'جایگاهی تعریف نشده است.';
}
async function loadRequests(){
 const items=await api('/api/admin/advertising/requests');
 $('#requests').innerHTML=items.map(x=>{
  const campaign=x.campaign_id?'<p>کمپین: #'+esc(x.campaign_id)+' | نمایش: '+Number(x.impressions||0).toLocaleString('fa-IR')+' | کلیک: '+Number(x.clicks||0).toLocaleString('fa-IR')+'</p>':'';
  const canPublish=x.status==='approved'&&x.payment_status==='paid'&&!x.campaign_id;
  const now=new Date(),end=new Date(Date.now()+7*86400000);
  const campaignForm=canPublish?'<form class="campaign-form" data-campaign-form="'+esc(x.id)+'"><h4>ساخت کمپین پس از تأیید پرداخت</h4><label>عنوان تبلیغ<input name="title" maxlength="160" value="'+esc(x.business_name)+'" required></label><label>لینک تصویر تبلیغ (HTTPS)<input name="image_url" type="url" value="'+esc(x.creative_url||'')+'" required></label><label>لینک مقصد (HTTPS)<input name="target_url" type="url" value="'+esc(x.target_url||x.website_url||'')+'" required></label><div class="row"><label>شروع<input name="starts_at" type="datetime-local" value="'+localDate(now)+'" required></label><label>پایان<input name="ends_at" type="datetime-local" value="'+localDate(end)+'" required></label></div><button type="submit">ساخت و زمان‌بندی کمپین</button></form>':'';
  return '<article class="card" data-request="'+esc(x.id)+'"><b>'+esc(x.business_name)+' — '+esc(x.request_code)+'</b><p>درخواست‌دهنده: '+esc(x.advertiser_name)+' | تماس: '+esc(x.phone)+'</p><p>ایمیل: '+esc(x.email||'ثبت نشده')+' | حوزه: '+esc(x.industry||'ثبت نشده')+'</p><p>جایگاه: '+esc(x.package_title)+' | مدت: '+esc(x.duration_days)+' روز</p><p>بودجه مدنظر: '+(x.budget_toman===null?'اعلام نشده':toman(x.budget_toman))+' | برآورد ثبت‌شده: '+(x.quote_toman===null?'نیازمند اعلام قیمت':toman(x.quote_toman))+'</p><p>هدف: '+(x.target_impressions||'—')+' نمایش / '+(x.target_clicks||'—')+' کلیک</p><p>وب‌سایت: '+(x.website_url?'<a href="'+esc(x.website_url)+'" target="_blank" rel="noopener">مشاهده</a>':'ثبت نشده')+' | تصویر: '+(x.creative_url?'<a href="'+esc(x.creative_url)+'" target="_blank" rel="noopener">مشاهده</a>':'ثبت نشده')+' | مقصد: '+(x.target_url?'<a href="'+esc(x.target_url)+'" target="_blank" rel="noopener">مشاهده</a>':'ثبت نشده')+'</p><p>'+esc(x.message||'بدون توضیح')+'</p>'+campaign+'<div class="grid"><label>وضعیت درخواست<select data-status><option value="pending" '+(x.status==='pending'?'selected':'')+'>در انتظار بررسی</option><option value="quoted" '+(x.status==='quoted'?'selected':'')+'>قیمت اعلام شد</option><option value="approved" '+(x.status==='approved'?'selected':'')+'>تأیید شد</option><option value="rejected" '+(x.status==='rejected'?'selected':'')+'>رد شد</option></select></label><label>مبلغ نهایی (تومان)<input data-quote type="number" min="0" step="1" value="'+(x.quote_toman??'')+'" placeholder="قیمت را وارد کنید"></label><label>وضعیت پرداخت<select data-payment><option value="unpaid" '+(x.payment_status==='unpaid'?'selected':'')+'>پرداخت تأیید نشده</option><option value="paid" '+(x.payment_status==='paid'?'selected':'')+'>وجه دریافت و بررسی شد</option></select></label></div><label>یادداشت مدیریت<textarea data-notes rows="2">'+esc(x.admin_notes||'')+'</textarea></label><button type="button" data-save-request>ذخیره وضعیت و مبلغ</button>'+campaignForm+'</article>';
 }).join('')||'هنوز درخواست تبلیغاتی ثبت نشده است.';
}
async function loadCampaigns(){
 const items=await api('/api/admin/advertising/campaigns');
 $('#campaigns').innerHTML=items.map(x=>'<article class="card"><b>'+esc(x.title)+'</b><p>برند: '+esc(x.business_name)+' | جایگاه: '+esc(x.package_title)+'</p><p>نمایش: '+Number(x.impressions).toLocaleString('fa-IR')+' / '+(x.target_impressions?Number(x.target_impressions).toLocaleString('fa-IR'):'بدون سقف')+' | کلیک: '+Number(x.clicks).toLocaleString('fa-IR')+' / '+(x.target_clicks?Number(x.target_clicks).toLocaleString('fa-IR'):'بدون سقف')+'</p><p>از '+new Date(x.starts_at).toLocaleString('fa-IR')+' تا '+new Date(x.ends_at).toLocaleString('fa-IR')+'</p><div class="row"><select data-campaign-status="'+esc(x.id)+'"><option value="scheduled" '+(x.status==='scheduled'?'selected':'')+'>زمان‌بندی‌شده</option><option value="active" '+(x.status==='active'?'selected':'')+'>فعال</option><option value="paused" '+(x.status==='paused'?'selected':'')+'>متوقف</option><option value="completed" '+(x.status==='completed'?'selected':'')+'>پایان‌یافته</option></select><button type="button" data-save-campaign="'+esc(x.id)+'">ذخیره وضعیت</button></div></article>').join('')||'هنوز کمپینی منتشر نشده است.';
}
async function refresh(){try{await Promise.all([loadPackages(),loadRequests(),loadCampaigns()]);say('اطلاعات تبلیغات به‌روز شد.');}catch(error){say(error.message);}}
document.addEventListener('click',async event=>{
 const packageButton=event.target.closest('[data-save-package]');
 if(packageButton){
  const card=packageButton.closest('[data-package]');
  try{await api('/api/admin/advertising/packages/'+card.dataset.package,{method:'PATCH',body:JSON.stringify({pricing_model:card.querySelector('[data-model]').value,rate_toman:card.querySelector('[data-rate]').value,is_active:card.querySelector('[data-active]').value==='true'})});say('تعرفه ذخیره شد.');await loadPackages();}catch(error){say(error.message);}
 }
 const requestButton=event.target.closest('[data-save-request]');
 if(requestButton){
  const card=requestButton.closest('[data-request]');
  try{await api('/api/admin/advertising/requests/'+card.dataset.request,{method:'PATCH',body:JSON.stringify({status:card.querySelector('[data-status]').value,payment_status:card.querySelector('[data-payment]').value,quote_toman:card.querySelector('[data-quote]').value,admin_notes:card.querySelector('[data-notes]').value})});say('درخواست به‌روزرسانی شد.');await loadRequests();}catch(error){say(error.message);}
 }
 const campaignButton=event.target.closest('[data-save-campaign]');
 if(campaignButton){
  const select=document.querySelector('[data-campaign-status="'+campaignButton.dataset.saveCampaign+'"]');
  try{await api('/api/admin/advertising/campaigns/'+campaignButton.dataset.saveCampaign,{method:'PATCH',body:JSON.stringify({status:select.value})});say('وضعیت کمپین ذخیره شد.');await loadCampaigns();}catch(error){say(error.message);}
 }
});
document.addEventListener('submit',async event=>{
 const form=event.target.closest('[data-campaign-form]');
 if(!form)return;
 event.preventDefault();
 const data=Object.fromEntries(new FormData(form).entries());
 data.starts_at=new Date(data.starts_at).toISOString();data.ends_at=new Date(data.ends_at).toISOString();
 try{await api('/api/admin/advertising/requests/'+form.dataset.campaignForm+'/campaign',{method:'POST',body:JSON.stringify(data)});say('کمپین با موفقیت زمان‌بندی شد.');await refresh();}catch(error){say(error.message);}
});
(async()=>{
 try{const result=await api('/api/admin/auth/me');if(result.admin?.role!=='owner'){say('این بخش فقط برای مالک فروشگاه در دسترس است.');return;}await refresh();}
 catch(error){say('برای دسترسی، ابتدا از پنل مدیریت وارد حساب مالک شو. '+error.message);}
})();