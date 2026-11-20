'use strict';
const $=id=>document.getElementById(id);
const colorLabels={background:'پس‌زمینه صفحه',surface:'پس‌زمینه کارت‌ها',text:'رنگ نوشته‌ها',primary:'رنگ اصلی دکمه‌ها',navBackground:'پس‌زمینه منو',navText:'رنگ نوشته منو',accent:'رنگ تأکیدی'};
const defaults={designId:'classic',colors:{background:'#fbf9f5',surface:'#ffffff',text:'#29221e',primary:'#3b281f',navBackground:'#3b281f',navText:'#ffffff',accent:'#b68a4c'},font:'Vazirmatn',logoUrl:'',heroImageUrl:'',heroSlides:[],backgroundImageUrl:'',sections:[{id:'hero',type:'hero',enabled:true,title:'استایل خاص، با AVELORA',text:'کیف، اکسسوری و زیبایی؛ انتخاب‌هایی برای درخشش هر روز تو'},{id:'products',type:'products',enabled:true,title:'محصولات'},{id:'feedback',type:'feedback',enabled:true,title:'نظرت برای ما ارزشمنده'},{id:'footer',type:'footer',enabled:true,title:'ارتباط با ما'}],promo:{enabled:false,title:'',text:'',imageUrl:'',linkUrl:'',buttonText:'مشاهده'}};

const luxuryPresets=[
 {id:'black-gold',name:'مشکی و طلایی',tag:'BLACK GOLD',description:'شکوه جسورانه با تضاد عمیق و جزئیات طلایی',font:'Vazirmatn',colors:{background:'#11100f',surface:'#1d1a17',text:'#f5eee2',primary:'#b89455',navBackground:'#090909',navText:'#f5e6c8',accent:'#d6b36b'},sections:[{id:'hero',type:'hero',enabled:true,title:'درخشش، امضای انتخاب تو',text:'کالکشن منتخب AVELORA؛ ظرافتی که دیده می‌شود'},{id:'products',type:'products',enabled:true,title:'منتخب‌های خاص برای تو'},{id:'feedback',type:'feedback',enabled:true,title:'تجربه مشتریان ما'},{id:'footer',type:'footer',enabled:true,title:'همراه تو در انتخابی خاص'}]},
 {id:'warm-classic',name:'کرم و قهوه‌ای',tag:'WARM CLASSIC',description:'گرمای لوکس، آرامش و اصالت در هر جزئیات',font:'Vazirmatn',colors:{background:'#f3eadc',surface:'#fffaf2',text:'#39291f',primary:'#684632',navBackground:'#3d2b21',navText:'#fff7eb',accent:'#b58a60'},sections:[{id:'hero',type:'hero',enabled:true,title:'زیبایی در سادگیِ ماندگار',text:'انتخاب‌هایی دلنشین برای سبک زندگی تو'},{id:'products',type:'products',enabled:true,title:'تازه‌های AVELORA'},{id:'feedback',type:'feedback',enabled:true,title:'صدای همراهان ما'},{id:'footer',type:'footer',enabled:true,title:'با ما در ارتباط باش'}]},
 {id:'emerald-luxe',name:'زمردی و طلایی',tag:'EMERALD LUXE',description:'رنگی عمیق و اشرافی با درخشش ظریف طلایی',font:'Vazirmatn',colors:{background:'#102b25',surface:'#183a31',text:'#f1ead9',primary:'#c5a15b',navBackground:'#0a211c',navText:'#f7edda',accent:'#d5b66f'},sections:[{id:'hero',type:'hero',enabled:true,title:'انتخابی به رنگ تمایز',text:'زیبایی و کیفیت در مجموعه‌ای از انتخاب‌های خاص'},{id:'products',type:'products',enabled:true,title:'ویترین منتخب زمردی'},{id:'feedback',type:'feedback',enabled:true,title:'آنچه مشتریان می‌گویند'},{id:'footer',type:'footer',enabled:true,title:'ارتباط با AVELORA'}]},
 {id:'rose-minimal',name:'سفید و رزگلد',tag:'ROSE MINIMAL',description:'مینیمال، روشن و لطیف با امضای رزگلد',font:'Vazirmatn',colors:{background:'#fffafa',surface:'#ffffff',text:'#493b3c',primary:'#b87578',navBackground:'#fff4f2',navText:'#593e40',accent:'#c58e88'},sections:[{id:'hero',type:'hero',enabled:true,title:'زیبایی، ساده و بی‌زمان',text:'جزئیات دوست‌داشتنی برای هر روز و هر مناسبت'},{id:'products',type:'products',enabled:true,title:'محبوب‌ترین انتخاب‌ها'},{id:'feedback',type:'feedback',enabled:true,title:'نظر همراهان AVELORA'},{id:'footer',type:'footer',enabled:true,title:'کنار تو هستیم'}]},
 {id:'navy-silver',name:'سرمه‌ای و نقره‌ای',tag:'NAVY SILVER',description:'وقار مدرن با ترکیب سرمه‌ای و نقره‌ای',font:'Vazirmatn',colors:{background:'#eef1f5',surface:'#ffffff',text:'#202c3d',primary:'#344b68',navBackground:'#17283e',navText:'#f4f6fa',accent:'#aab8c8'},sections:[{id:'hero',type:'hero',enabled:true,title:'وقار در انتخاب، تفاوت در استایل',text:'مجموعه‌ای از محصولات خاص برای سلیقه‌های دقیق'},{id:'products',type:'products',enabled:true,title:'کالکشن منتخب'},{id:'feedback',type:'feedback',enabled:true,title:'تجربه خرید از AVELORA'},{id:'footer',type:'footer',enabled:true,title:'راه‌های ارتباط با ما'}]},
 {id:'charcoal-champagne',name:'زغالی و شامپاینی',tag:'CHARCOAL CHAMPAGNE',description:'لوکس معاصر با تونالیته گرم و درخشش شامپاینی',font:'Vazirmatn',colors:{background:'#242321',surface:'#302e2a',text:'#f4eee3',primary:'#c8ae83',navBackground:'#191817',navText:'#f7f0e5',accent:'#ddc69e'},sections:[{id:'hero',type:'hero',enabled:true,title:'لحظه‌ای برای انتخاب متفاوت',text:'کالکشن‌هایی چشم‌نواز برای سلیقه‌ای خاص'},{id:'products',type:'products',enabled:true,title:'انتخاب‌های ویژه'},{id:'feedback',type:'feedback',enabled:true,title:'داستان رضایت مشتریان'},{id:'footer',type:'footer',enabled:true,title:'با AVELORA همراه بمان'}]}
];
const labels={hero:'بنر اصلی',products:'ویترین محصولات',feedback:'دیدگاه مشتریان',footer:'پاورقی',custom:'بخش سفارشی'};
let config=structuredClone(defaults);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function request(url,options={}){const r=await fetch(url,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json','x-admin-request':'1',...(options.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'درخواست ناموفق بود.');return d;}
function setMessage(s){$('message').textContent=s;}
function renderHeroSlides(){
 const host=$('heroSlidesEditor');if(!host)return;
 host.innerHTML=config.heroSlides.map((s,i)=>'<article class="hero-slide-admin" data-hero-slide="'+i+'">'+(s.imageUrl?'<img src="'+esc(s.imageUrl)+'" alt="پیش‌نمایش بنر '+(i+1)+'">':'<p>هنوز تصویری انتخاب نشده است.</p>')+'<label class="slide-enabled"><input type="checkbox" data-slide-enabled="'+i+'" '+(s.enabled!==false?'checked':'')+'> نمایش این بنر در سایت</label><label>تصویر باکیفیت بنر<input type="file" accept="image/jpeg,image/png,image/webp" data-hero-slide-file="'+i+'"></label><label>عنوان<input data-hero-slide-field="title" data-index="'+i+'" maxlength="120" value="'+esc(s.title||'')+'"></label><label>توضیح کوتاه<textarea data-hero-slide-field="text" data-index="'+i+'" maxlength="400">'+esc(s.text||'')+'</textarea></label><label>لینک مقصد<input data-hero-slide-field="linkUrl" data-index="'+i+'" maxlength="1000" value="'+esc(s.linkUrl||'')+'" placeholder="/#products"></label><label>متن دکمه<input data-hero-slide-field="buttonText" data-index="'+i+'" maxlength="40" value="'+esc(s.buttonText||'همین حالا خرید کنید')+'"></label><div class="slide-actions"><button type="button" data-slide-up="'+i+'" '+(i===0?'disabled':'')+'>بالا</button><button type="button" data-slide-down="'+i+'" '+(i===config.heroSlides.length-1?'disabled':'')+'>پایین</button><button type="button" data-slide-remove="'+i+'">حذف بنر</button></div></article>').join('')||'<p class="muted">هنوز بنری اضافه نشده است.</p>';
}
function renderColors(){$('colors').innerHTML=Object.entries(colorLabels).map(([k,label])=>'<label class="theme-field">'+label+'<span class="theme-color"><input data-color-text="'+k+'" value="'+esc(config.colors[k])+'" maxlength="7"><input type="color" data-color="'+k+'" value="'+esc(config.colors[k])+'"></span></label>').join('');}
function renderSections(){
 $('sections').innerHTML=config.sections.map((s,i)=>'<article class="theme-section-card" data-section="'+i+'"><div class="theme-section-head"><strong>'+labels[s.type]+'</strong><span class="theme-section-toggles"><label><input type="checkbox" data-enabled="'+i+'" '+(s.enabled?'checked':'')+'> کلی</label><label><input type="checkbox" data-desktop="'+i+'" '+(s.desktopEnabled!==false?'checked':'')+'> دسکتاپ</label><label><input type="checkbox" data-mobile="'+i+'" '+(s.mobileEnabled!==false?'checked':'')+'> موبایل</label></span><span><button type="button" data-up="'+i+'" '+(i===0?'disabled':'')+'>↑</button><button type="button" data-down="'+i+'" '+(i===config.sections.length-1?'disabled':'')+'>↓</button><button type="button" data-remove="'+i+'">حذف</button></span></div><div class="theme-section-fields"><label>عنوان<input data-field="title" data-index="'+i+'" maxlength="100" value="'+esc(s.title)+'"></label><label>متن توضیحی<textarea data-field="text" data-index="'+i+'" maxlength="600" rows="2">'+esc(s.text)+'</textarea></label>'+(s.type==='custom'?'<label>نشانی تصویر<input data-field="imageUrl" data-index="'+i+'" maxlength="1000" value="'+esc(s.imageUrl)+'"></label><label>بارگذاری تصویر<input type="file" accept="image/jpeg,image/png,image/webp" data-section-file="'+i+'"></label><label>لینک دکمه<input data-field="linkUrl" data-index="'+i+'" maxlength="1000" value="'+esc(s.linkUrl)+'"></label><label>متن دکمه<input data-field="buttonText" data-index="'+i+'" maxlength="40" value="'+esc(s.buttonText||'مشاهده')+'"></label><label>رنگ پس‌زمینه<input data-field="backgroundColor" data-index="'+i+'" maxlength="7" placeholder="#ffffff" value="'+esc(s.backgroundColor||'')+'"></label>':'')+'<label>ترتیب نمایش در موبایل<input type="number" min="0" max="30" data-field="mobileOrder" data-index="'+i+'" value="'+Number(s.mobileOrder??i)+'"></label></div></article>').join('');
}
function readForm(){
 config.logoUrl=$('logoUrl').value.trim();config.heroImageUrl=$('heroImageUrl').value.trim();config.backgroundImageUrl=$('backgroundImageUrl').value.trim();config.font=$('font').value;
 config.promo={enabled:$('promoEnabled').checked,title:$('promoTitle').value,text:$('promoText').value,imageUrl:$('promoImageUrl').value.trim(),linkUrl:$('promoLinkUrl').value.trim(),buttonText:$('promoButtonText').value||'مشاهده'};
 document.querySelectorAll('[data-color-text]').forEach(el=>config.colors[el.dataset.colorText]=el.value);
 document.querySelectorAll('[data-color]').forEach(el=>config.colors[el.dataset.color]=el.value);
 const matchingPreset=luxuryPresets.find(p=>['background','primary','navBackground'].every(key=>String(config.colors[key]||'').toLowerCase()===String(p.colors[key]||'').toLowerCase()));
 config.designId=matchingPreset?matchingPreset.id:'classic';
 updateSelectedPreset();
 document.querySelectorAll('[data-field]').forEach(el=>{const item=config.sections[Number(el.dataset.index)];if(item)item[el.dataset.field]=el.dataset.field==='mobileOrder'?Number(el.value):el.value;});
 return config;
}
function fill(c){
 config={...structuredClone(defaults),...c,heroSlides:Array.isArray(c.heroSlides)?c.heroSlides.map(s=>({...s})):[],colors:{...defaults.colors,...c.colors},promo:{...defaults.promo,...c.promo},sections:Array.isArray(c.sections)?c.sections.map(s=>({...s})):structuredClone(defaults.sections)};
 $('logoUrl').value=config.logoUrl||'';$('heroImageUrl').value=config.heroImageUrl||'';$('backgroundImageUrl').value=config.backgroundImageUrl||'';$('font').value=config.font||'Vazirmatn';
 $('promoEnabled').checked=!!config.promo.enabled;$('promoTitle').value=config.promo.title||'';$('promoText').value=config.promo.text||'';$('promoImageUrl').value=config.promo.imageUrl||'';$('promoLinkUrl').value=config.promo.linkUrl||'';$('promoButtonText').value=config.promo.buttonText||'مشاهده';
 renderColors();renderSections();renderHeroSlides();updateSelectedPreset();preview();
}

function updateSelectedPreset(){
 const active=config.designId||'classic';
 document.querySelectorAll('[data-preset-card]').forEach(card=>{
  const selected=card.dataset.presetCard===active;
  card.classList.toggle('selected',selected);
  const button=card.querySelector('[data-apply-preset]');
  if(button)button.setAttribute('aria-pressed',selected?'true':'false');
 });
}
function validateThemeConfig(){
 const current=readForm();
 const invalidColor=Object.entries(current.colors).find(([,value])=>!/^#[0-9a-f]{6}$/i.test(String(value||'')));
 if(invalidColor)throw new Error('رنگ «'+(colorLabels[invalidColor[0]]||invalidColor[0])+'» باید یک کد HEX شش‌رقمی معتبر باشد.');
 if(current.sections.length<2||current.sections.length>20)throw new Error('چیدمان باید حداقل ۲ و حداکثر ۲۰ بخش داشته باشد.');
 const ids=current.sections.map(section=>String(section.id||''));
 if(new Set(ids).size!==ids.length)throw new Error('شناسه بخش‌ها تکراری است؛ بخش تکراری را حذف و دوباره تلاش کن.');
 if(current.heroSlides.length>10)throw new Error('حداکثر ۱۰ بنر قابل ثبت است.');
 return current;
}
function renderPresets(){
 const host=$('luxuryPresets');if(!host)return;
 host.innerHTML=luxuryPresets.map(p=>'<article class="preset-card" data-preset-card="'+p.id+'"><div class="preset-art"><div class="preset-art-nav"></div><div class="preset-art-hero"><i></i><b></b><span></span></div><div class="preset-art-products"><i></i><i></i><i></i></div></div><div class="preset-card-body"><div class="preset-card-title"><strong>'+p.name+'</strong><small>'+p.tag+'</small></div><p>'+p.description+'</p><div class="preset-swatches"><i></i><i></i><i></i><i></i><i></i></div><button type="button" data-apply-preset="'+p.id+'" aria-pressed="false">انتخاب این قالب</button></div></article>').join('');
 updateSelectedPreset();
}
function applyPreset(id){
 const preset=luxuryPresets.find(p=>p.id===id);if(!preset)return;
 if(!confirm('قالب «'+preset.name+'» بارگذاری شود؟ تغییرات ذخیره‌نشده فرم جایگزین می‌شود؛ تصاویر و لوگوی فعلی حفظ خواهند شد.'))return;
 readForm();
 const keep={logoUrl:config.logoUrl,heroImageUrl:config.heroImageUrl,heroSlides:structuredClone(config.heroSlides),backgroundImageUrl:config.backgroundImageUrl,promo:structuredClone(config.promo)};
 fill({...structuredClone(defaults),designId:preset.id,colors:{...preset.colors},font:preset.font,sections:structuredClone(preset.sections),...keep});
 document.querySelectorAll('[data-preset-card]').forEach(card=>card.classList.toggle('selected',card.dataset.presetCard===id));
 setMessage('قالب «'+preset.name+'» بارگذاری شد. برای اعمال روی سایت، پیش‌نویس را ذخیره و سپس در صورت اطمینان منتشر کن.');
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
 readForm();
 const p=$('preview'),c=config.colors;
 p.dataset.design=config.designId||'classic';
 p.className='theme-preview'+(p.classList.contains('preview-mobile')?' preview-mobile':'');
 const mobile=p.classList.contains('preview-mobile');
 const safeCssUrl=value=>{const url=String(value||'').trim();return (/^https:\/\/[^\s"'()]+$/i.test(url)||/^\/uploads\/[A-Za-z0-9._~/%?&=+-]+$/.test(url))?'url('+JSON.stringify(url)+')':'';};
 const logo=config.logoUrl?'<img class="theme-logo" src="'+esc(config.logoUrl)+'" alt="AVELORA">':'<b>AVELORA</b><small>BAGS · BEAUTY · MORE</small>';
 const products='<div class="preview-product-grid"><article><i></i><b>محصول منتخب</b><small>قیمت محصول</small></article><article><i></i><b>تازه‌های فروشگاه</b><small>قیمت محصول</small></article><article><i></i><b>انتخاب ویژه</b><small>قیمت محصول</small></article></div>';
 const parts=['<header class="preview-nav">'+logo+'<span>خانه　 محصولات　 درباره ما　 ♡　 سبد خرید</span></header>'];
 for(const [i,s] of config.sections.entries()){
  if(!s.enabled||(mobile&&s.mobileEnabled===false)||(!mobile&&s.desktopEnabled===false))continue;
  const order=Number(s.mobileOrder??i);
  if(s.type==='hero')parts.push('<section class="preview-hero" data-preview-order="'+order+'"><div><small>کالکشن منتخب AVELORA</small><h2>'+esc(s.title)+'</h2><p>'+esc(s.text)+'</p><button>مشاهده مجموعه</button></div><figure>✦</figure></section>');
  else if(s.type==='products')parts.push('<section class="preview-products" data-preview-order="'+order+'"><small>THE AVELORA EDIT</small><h2>'+esc(s.title)+'</h2>'+products+'</section>');
  else if(s.type==='feedback')parts.push('<section class="preview-feedback" data-preview-order="'+order+'"><h2>'+esc(s.title)+'</h2><p>«تجربه‌ای دلنشین از انتخاب تا دریافت سفارش»</p></section>');
  else if(s.type==='footer')parts.push('<section class="preview-footer" data-preview-order="'+order+'"><b>AVELORA</b><p>'+esc(s.title)+'</p><small>BAGS · BEAUTY · MORE</small></section>');
  else parts.push('<section class="preview-custom" data-preview-order="'+order+'" data-preview-background="'+esc(s.backgroundColor||c.surface)+'">'+(s.imageUrl?'<img src="'+esc(s.imageUrl)+'" alt="">':'')+'<h2>'+esc(s.title)+'</h2><p>'+esc(s.text)+'</p></section>');
 }
 if(config.promo.enabled)parts.push('<section class="preview-promo"><h2>'+esc(config.promo.title)+'</h2><p>'+esc(config.promo.text)+'</p></section>');
 p.innerHTML=parts.join('');
 const visibleSlides=config.heroSlides.filter(slide=>slide&&slide.enabled!==false&&slide.imageUrl);
 if(visibleSlides.length){const gallery=document.createElement('div');gallery.className='preview-slide-gallery';gallery.setAttribute('aria-label','پیش‌نمایش تصاویر اسلایدر');visibleSlides.forEach((slide,index)=>{const item=document.createElement('figure');const image=document.createElement('img');image.src=slide.imageUrl;image.alt=slide.title||('بنر '+(index+1));const caption=document.createElement('figcaption');caption.textContent=slide.title||('بنر '+(index+1));item.append(image,caption);gallery.append(item);});p.insertBefore(gallery,p.querySelector('.preview-products')||null);}
 p.querySelectorAll('[data-preview-order]').forEach(el=>el.style.setProperty('--mobile-order',String(Number(el.dataset.previewOrder)||0)));
 const hero=p.querySelector('.preview-hero'),heroImage=safeCssUrl(config.heroImageUrl);
 if(hero&&heroImage)hero.style.backgroundImage='linear-gradient(#0003,#0003),'+heroImage;
 p.querySelectorAll('[data-preview-background]').forEach(el=>{const color=el.dataset.previewBackground;if(/^#[0-9a-f]{6}$/i.test(color))el.style.backgroundColor=color;});
 p.style.setProperty('--preview-bg',c.background);p.style.setProperty('--preview-text',c.text);
 p.style.setProperty('--preview-nav',c.navBackground);p.style.setProperty('--preview-nav-text',c.navText);
 p.style.setProperty('--preview-surface',c.surface);p.style.setProperty('--preview-primary',c.primary);p.style.setProperty('--preview-accent',c.accent);
 const backgroundImage=safeCssUrl(config.backgroundImageUrl);
 p.style.background=backgroundImage?'linear-gradient(#ffffffb8,#ffffffb8),'+backgroundImage:c.background;
 p.style.color=c.text;p.style.fontFamily=config.font+',Tahoma,sans-serif';
 updateSelectedPreset();
}
async function init(){try{const me=await request('/api/admin/auth/me');if(me.admin?.role!=='owner')throw new Error('فقط مالک فروشگاه اجازه مدیریت ظاهر را دارد.');const data=await request('/api/admin/theme');$('authStatus').textContent='دسترسی مالک تأیید شد.';$('editor').hidden=false;fill(data.draft_config||defaults);const published=data.published_config?.designId||'classic',draft=config.designId||'classic';setMessage(published===draft?'قالب انتخاب‌شده با نسخه منتشرشده هماهنگ است.':'پیش‌نویس با قالب منتشرشده متفاوت است؛ برای اعمال تغییرات، ابتدا ذخیره و سپس انتشار را انتخاب کن.');}catch(e){$('authStatus').textContent=e.message+' برای ادامه از پنل مدیریت وارد شو.';}}
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
$('addHeroSlide').onclick=()=>{if(config.heroSlides.length>=10)return setMessage('حداکثر ۱۰ بنر قابل ثبت است.');config.heroSlides.push({id:'slide-'+Date.now().toString(36),enabled:true,imageUrl:'',title:'',text:'',linkUrl:'/#products',buttonText:'همین حالا خرید کنید'});renderHeroSlides();setMessage('اسلاید جدید اضافه شد؛ تصویرش را بارگذاری کن.');};
$('heroSlidesEditor').addEventListener('input',e=>{if(e.target.dataset.heroSlideField){const s=config.heroSlides[Number(e.target.dataset.index)];if(s)s[e.target.dataset.heroSlideField]=e.target.value;}});
$('heroSlidesEditor').addEventListener('change',async e=>{if(e.target.dataset.slideEnabled!==undefined){const i=Number(e.target.dataset.slideEnabled);if(config.heroSlides[i])config.heroSlides[i].enabled=e.target.checked;setMessage('وضعیت نمایش بنر تغییر کرد؛ برای اعمال، ذخیره پیش‌نویس و انتشار را انجام بده.');preview();}if(e.target.dataset.heroSlideFile!==undefined){const i=Number(e.target.dataset.heroSlideFile);try{const url=await uploadImage(e.target.files[0]);if(url){config.heroSlides[i].imageUrl=url;renderHeroSlides();setMessage('تصویر بنر بارگذاری شد. برای اعمال، ذخیره و انتشار را انجام بده.');}}catch(err){setMessage(err.message);}}});
$('heroSlidesEditor').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const i=Number(b.dataset.slideUp??b.dataset.slideDown??b.dataset.slideRemove);if(b.dataset.slideRemove!==undefined)config.heroSlides.splice(i,1);else if(b.dataset.slideUp!==undefined&&i>0)[config.heroSlides[i-1],config.heroSlides[i]]=[config.heroSlides[i],config.heroSlides[i-1]];else if(b.dataset.slideDown!==undefined&&i<config.heroSlides.length-1)[config.heroSlides[i+1],config.heroSlides[i]]=[config.heroSlides[i],config.heroSlides[i+1]];renderHeroSlides();});
$('addSection').onclick=()=>{const type=$('newSection').value;if(config.sections.length>=20)return setMessage('حداکثر ۲۰ بخش مجاز است.');if(type!=='custom'&&config.sections.some(s=>s.type===type))return setMessage('این بخش از قبل در صفحه وجود دارد.');const id=type==='custom'?'custom-'+Date.now().toString(36):type;config.sections.push({id,type,enabled:true,title:type==='custom'?'عنوان بخش جدید':labels[type],text:'',imageUrl:'',linkUrl:'',buttonText:'مشاهده',backgroundColor:'',mobileOrder:config.sections.length,desktopEnabled:true,mobileEnabled:true});renderSections();preview();setMessage('بخش اضافه شد؛ عنوان و محتوایش را تنظیم کن.');};
$('saveDraft').onclick=async()=>{try{validateThemeConfig();await uploadSelectedImages();const d=await request('/api/admin/theme/draft',{method:'PUT',body:JSON.stringify(readForm())});fill(d.draft_config);setMessage('پیش‌نویس با موفقیت ذخیره شد؛ هنوز برای مشتریان منتشر نشده است.');}catch(e){setMessage(e.message);}};
$('publish').onclick=async()=>{if(!confirm('قالب فعلی برای همه بازدیدکنندگان منتشر شود؟'))return;try{validateThemeConfig();await uploadSelectedImages();await request('/api/admin/theme/draft',{method:'PUT',body:JSON.stringify(readForm())});await request('/api/admin/theme/publish',{method:'POST',body:'{}'});setMessage('قالب جدید منتشر شد. صفحه فروشگاه را تازه‌سازی کن.');}catch(e){setMessage(e.message);}};
$('reset').onclick=async()=>{if(!confirm('پیش‌نویس به قالب پایه بازگردد؟ نسخه منتشرشده تغییر نمی‌کند.'))return;try{const d=await request('/api/admin/theme/reset',{method:'POST',body:'{}'});fill(d.draft_config);setMessage('پیش‌نویس به قالب پایه بازگشت.');}catch(e){setMessage(e.message);}};
renderPresets();
$('luxuryPresets').addEventListener('click',e=>{const b=e.target.closest('[data-apply-preset]');if(b)applyPreset(b.dataset.applyPreset);});
init();

document.querySelectorAll('[data-preview]').forEach(button=>button.addEventListener('click',()=>{$('preview').classList.toggle('preview-mobile',button.dataset.preview==='mobile');document.querySelectorAll('[data-preview]').forEach(b=>b.disabled=b===button);preview();}));
