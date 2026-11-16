'use strict';
const $=id=>document.getElementById(id);
const colorLabels={background:'پس‌زمینه صفحه',surface:'پس‌زمینه کارت‌ها',text:'رنگ نوشته‌ها',primary:'رنگ اصلی دکمه‌ها',navBackground:'پس‌زمینه منو',navText:'رنگ نوشته منو',accent:'رنگ تأکیدی'};
const defaults={colors:{background:'#fbf9f5',surface:'#ffffff',text:'#29221e',primary:'#3b281f',navBackground:'#3b281f',navText:'#ffffff',accent:'#b68a4c'},font:'Vazirmatn',logoUrl:'',heroImageUrl:'',backgroundImageUrl:'',sections:[{id:'hero',type:'hero',enabled:true,title:'استایل خاص، با AVELORA',text:'کیف، اکسسوری و زیبایی؛ انتخاب‌هایی برای درخشش هر روز تو'},{id:'products',type:'products',enabled:true,title:'محصولات'},{id:'feedback',type:'feedback',enabled:true,title:'نظرت برای ما ارزشمنده'},{id:'footer',type:'footer',enabled:true,title:'ارتباط با ما'}],promo:{enabled:false,title:'',text:'',imageUrl:'',linkUrl:'',buttonText:'مشاهده'}};
const labels={hero:'بنر اصلی',products:'ویترین محصولات',feedback:'دیدگاه مشتریان',footer:'پاورقی',custom:'بخش سفارشی'};
let config=structuredClone(defaults);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function request(url,options={}){const r=await fetch(url,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json','x-admin-request':'1',...(options.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'درخواست ناموفق بود.');return d;}
function setMessage(s){$('message').textContent=s;}
function renderColors(){$('colors').innerHTML=Object.entries(colorLabels).map(([k,label])=>'<label class="theme-field">'+label+'<span class="theme-color"><input data-color-text="'+k+'" value="'+esc(config.colors[k])+'" maxlength="7"><input type="color" data-color="'+k+'" value="'+esc(config.colors[k])+'"></span></label>').join('');}
function renderSections(){
 $('sections').innerHTML=config.sections.map((s,i)=>'<article class="theme-section-card" data-section="'+i+'"><div class="theme-section-head"><strong>'+labels[s.type]+'</strong><label><input type="checkbox" data-enabled="'+i+'" '+(s.enabled?'checked':'')+'> نمایش</label><span><button type="button" data-up="'+i+'" '+(i===0?'disabled':'')+'>↑</button><button type="button" data-down="'+i+'" '+(i===config.sections.length-1?'disabled':'')+'>↓</button><button type="button" data-remove="'+i+'">حذف</button></span></div><div class="theme-section-fields"><label>عنوان<input data-field="title" data-index="'+i+'" maxlength="100" value="'+esc(s.title)+'"></label><label>متن توضیحی<textarea data-field="text" data-index="'+i+'" maxlength="600" rows="2">'+esc(s.text)+'</textarea></label>'+(s.type==='custom'?'<label>نشانی تصویر<input data-field="imageUrl" data-index="'+i+'" maxlength="1000" value="'+esc(s.imageUrl)+'"></label><label>بارگذاری تصویر<input type="file" accept="image/jpeg,image/png,image/webp" data-section-file="'+i+'"></label><label>لینک دکمه<input data-field="linkUrl" data-index="'+i+'" maxlength="1000" value="'+esc(s.linkUrl)+'"></label><label>متن دکمه<input data-field="buttonText" data-index="'+i+'" maxlength="40" value="'+esc(s.buttonText||'مشاهده')+'"></label><label>رنگ پس‌زمینه<input data-field="backgroundColor" data-index="'+i+'" maxlength="7" placeholder="#ffffff" value="'+esc(s.backgroundColor||'')+'"></label>':'')+'</div></article>').join('');
}
function readForm(){
 config.logoUrl=$('logoUrl').value.trim();config.heroImageUrl=$('heroImageUrl').value.trim();config.backgroundImageUrl=$('backgroundImageUrl').value.trim();config.font=$('font').value;
 config.promo={enabled:$('promoEnabled').checked,title:$('promoTitle').value,text:$('promoText').value,imageUrl:$('promoImageUrl').value.trim(),linkUrl:$('promoLinkUrl').value.trim(),buttonText:$('promoButtonText').value||'مشاهده'};
 document.querySelectorAll('[data-color-text]').forEach(el=>config.colors[el.dataset.colorText]=el.value);
 document.querySelectorAll('[data-color]').forEach(el=>config.colors[el.dataset.color]=el.value);
 document.querySelectorAll('[data-field]').forEach(el=>{const item=config.sections[Number(el.dataset.index)];if(item)item[el.dataset.field]=el.dataset.field==='mobileOrder'?Number(el.value):el.value;});
 return config;
}
function fill(c){
 config={...structuredClone(defaults),...c,colors:{...defaults.colors,...c.colors},promo:{...defaults.promo,...c.promo},sections:Array.isArray(c.sections)?c.sections.map(s=>({...s})):structuredClone(defaults.sections)};
 $('logoUrl').value=config.logoUrl||'';$('heroImageUrl').value=config.heroImageUrl||'';$('backgroundImageUrl').value=config.backgroundImageUrl||'';$('font').value=config.font||'Vazirmatn';
 $('promoEnabled').checked=!!config.promo.enabled;$('promoTitle').value=config.promo.title||'';$('promoText').value=config.promo.text||'';$('promoImageUrl').value=config.promo.imageUrl||'';$('promoLinkUrl').value=config.promo.linkUrl||'';$('promoButtonText').value=config.promo.buttonText||'مشاهده';
 renderColors();renderSections();preview();
}
async function uploadImage(file){
 if(!file)return '';
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw new Error('عکس باید JPG، PNG یا WebP و حداکثر ۵ مگابایت باشد.');
 const base64=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]||'');r.onerror=()=>reject(new Error('خواندن تصویر ناموفق بود.'));r.readAsDataURL(file);});
 const d=await request('/api/admin/uploads/product',{method:'POST',body:JSON.stringify({image_base64:base64,mime_type:file.type})});return d.image_url;
}
async function uploadSelectedImages(){
 for(const [fileId,urlId] of [['logoFile','logoUrl'],['heroImageFile','heroImageUrl'],['backgroundImageFile','backgroundImageUrl'],['promoImageFile','promoImageUrl']]){
  const file=$(fileId).files[0];if(file){$(urlId).value=await uploadImage(file);$(fileId).value='';}
 }
 for(const el of document.querySelectorAll('[data-section-file]')){const file=el.files[0];if(file){const i=Number(el.dataset.sectionFile);config.sections[i].imageUrl=await uploadImage(file);el.value='';const input=document.querySelector('[data-field="imageUrl"][data-index="'+i+'"]');if(input)input.value=config.sections[i].imageUrl;}}
 readForm();
}
function preview(){
 readForm();const p=$('preview'),c=config.colors;
 const parts=['<div class="preview-nav" style="color:'+c.navText+';background:'+c.navBackground+'">'+(config.logoUrl?'<img class="theme-logo" src="'+esc(config.logoUrl)+'" alt="AVELORA">':'AVELORA')+'</div>'];
 for(const [sectionIndex,s] of config.sections.entries()){if(!s.enabled)continue;
  if(s.type==='hero')parts.push('<section class="preview-hero" data-mobile-order="'+Number(s.mobileOrder??sectionIndex)+'" style="--mobile-order:'+Number(s.mobileOrder??sectionIndex)+';background-image: style="background-image:'+(config.heroImageUrl?'linear-gradient(#0004,#0004),url('+JSON.stringify(config.heroImageUrl)+')':'linear-gradient(120deg,#f4eadc,#fffaf3)')+'"><h2>'+esc(s.title)+'</h2><p>'+esc(s.text)+'</p></section>');
  else if(s.type==='products')parts.push('<section class="preview-products" style="--mobile-order:'+Number(s.mobileOrder??sectionIndex)+'"><h2>'+esc(s.title)+'</h2><span>نمونه محصول</span><span>نمونه محصول</span></section>');
  else if(s.type==='feedback')parts.push('<section class="preview-feedback" style="--mobile-order:'+Number(s.mobileOrder??sectionIndex)+'"><h2>'+esc(s.title)+'</h2><p>دیدگاه مشتریان</p></section>');
  else if(s.type==='footer')parts.push('<section class="preview-footer" style="--mobile-order:'+Number(s.mobileOrder??sectionIndex)+'"><h2>'+esc(s.title)+'</h2><p>اطلاعات تماس و پیوندها</p></section>');
  else parts.push('<section class="preview-custom" style="--mobile-order:'+Number(s.mobileOrder??sectionIndex)+';background:'+esc(s.backgroundColor||c.surface)+'">'+(s.imageUrl?'<img src="'+esc(s.imageUrl)+'" alt="">':'')+'<h2>'+esc(s.title)+'</h2><p>'+esc(s.text)+'</p>'+(s.linkUrl?'<span>'+esc(s.buttonText||'مشاهده')+'</span>':'')+'</section>');
 }
 if(config.promo.enabled)parts.push('<section class="preview-promo"><h2>'+esc(config.promo.title)+'</h2><p>'+esc(config.promo.text)+'</p></section>');
 p.innerHTML=parts.join('');p.style.background=config.backgroundImageUrl?'linear-gradient(#ffffffb8,#ffffffb8),url("'+config.backgroundImageUrl.replace(/"/g,'%22')+'")':c.background;p.style.backgroundSize='cover';p.style.color=c.text;p.style.fontFamily=config.font+',Tahoma,sans-serif';
}
async function init(){try{const me=await request('/api/admin/auth/me');if(me.admin?.role!=='owner')throw new Error('فقط مالک فروشگاه اجازه مدیریت ظاهر را دارد.');const data=await request('/api/admin/theme');$('authStatus').textContent='دسترسی مالک تأیید شد.';$('editor').hidden=false;fill(data.draft_config||defaults);}catch(e){$('authStatus').textContent=e.message+' برای ادامه از پنل مدیریت وارد شو.';}}
$('colors').addEventListener('input',e=>{if(e.target.dataset.color){const t=document.querySelector('[data-color-text="'+e.target.dataset.color+'"]');if(t)t.value=e.target.value;}preview();});
$('colors').addEventListener('change',e=>{if(e.target.dataset.colorText){const c=document.querySelector('[data-color="'+e.target.dataset.colorText+'"]');if(/^#[0-9a-fA-F]{6}$/.test(e.target.value)&&c)c.value=e.target.value;}preview();});
$('sections').addEventListener('input',e=>{if(e.target.dataset.field){const item=config.sections[Number(e.target.dataset.index)];if(item)item[e.target.dataset.field]=e.target.value;}preview();});
$('sections').addEventListener('change',async e=>{
 if(e.target.dataset.enabled!==undefined){const item=config.sections[Number(e.target.dataset.enabled)];item.enabled=e.target.checked;item.desktopEnabled=e.target.checked;item.mobileEnabled=e.target.checked;renderSections();preview();}
 if(e.target.dataset.desktop!==undefined){config.sections[Number(e.target.dataset.desktop)].desktopEnabled=e.target.checked;preview();}
 if(e.target.dataset.mobile!==undefined){config.sections[Number(e.target.dataset.mobile)].mobileEnabled=e.target.checked;preview();}
 if(e.target.dataset.sectionFile!==undefined){try{const i=Number(e.target.dataset.sectionFile);config.sections[i].imageUrl=await uploadImage(e.target.files[0]);renderSections();preview();setMessage('تصویر بخش بارگذاری شد.');}catch(err){setMessage(err.message);}}
});
$('sections').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const i=Number(b.dataset.up??b.dataset.down??b.dataset.remove);if(b.dataset.remove!==undefined)config.sections.splice(i,1);else if(b.dataset.up!==undefined&&i>0)[config.sections[i-1],config.sections[i]]=[config.sections[i],config.sections[i-1]];else if(b.dataset.down!==undefined&&i<config.sections.length-1)[config.sections[i+1],config.sections[i]]=[config.sections[i],config.sections[i+1]];renderSections();preview();});
['logoUrl','heroImageUrl','backgroundImageUrl','font','promoEnabled','promoTitle','promoText','promoImageUrl','promoLinkUrl','promoButtonText'].forEach(id=>$(id).addEventListener('input',preview));
$('addSection').onclick=()=>{const type=$('newSection').value;if(config.sections.length>=20)return setMessage('حداکثر ۲۰ بخش مجاز است.');if(type!=='custom'&&config.sections.some(s=>s.type===type))return setMessage('این بخش از قبل در صفحه وجود دارد.');const id=type==='custom'?'custom-'+Date.now().toString(36):type;config.sections.push({id,type,enabled:true,title:type==='custom'?'عنوان بخش جدید':labels[type],text:'',imageUrl:'',linkUrl:'',buttonText:'مشاهده',backgroundColor:'',mobileOrder:config.sections.length,desktopEnabled:true,mobileEnabled:true});renderSections();preview();setMessage('بخش اضافه شد؛ عنوان و محتوایش را تنظیم کن.');};
$('saveDraft').onclick=async()=>{try{await uploadSelectedImages();const d=await request('/api/admin/theme/draft',{method:'PUT',body:JSON.stringify(readForm())});fill(d.draft_config);setMessage('پیش‌نویس با موفقیت ذخیره شد؛ هنوز برای مشتریان منتشر نشده است.');}catch(e){setMessage(e.message);}};
$('publish').onclick=async()=>{if(!confirm('قالب فعلی برای همه بازدیدکنندگان منتشر شود؟'))return;try{await uploadSelectedImages();await request('/api/admin/theme/draft',{method:'PUT',body:JSON.stringify(readForm())});await request('/api/admin/theme/publish',{method:'POST',body:'{}'});setMessage('قالب جدید منتشر شد. صفحه فروشگاه را تازه‌سازی کن.');}catch(e){setMessage(e.message);}};
$('reset').onclick=async()=>{if(!confirm('پیش‌نویس به قالب پایه بازگردد؟ نسخه منتشرشده تغییر نمی‌کند.'))return;try{const d=await request('/api/admin/theme/reset',{method:'POST',body:'{}'});fill(d.draft_config);setMessage('پیش‌نویس به قالب پایه بازگشت.');}catch(e){setMessage(e.message);}};
init();
