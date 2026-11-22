/* AVELORA luxury interactions. Additive only; no cart/auth handlers are replaced. */
(()=>{'use strict';
const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const touch=window.matchMedia?.('(pointer: coarse)').matches;
function navigation(){
 const header=document.querySelector('header.top'),brand=header?.querySelector('.brand');
 if(!header||!brand||header.querySelector('.avelora-luxury-nav'))return;
 const nav=document.createElement('nav');nav.className='avelora-luxury-nav';nav.setAttribute('aria-label','دسترسی اصلی AVELORA');
 [['کیف','[data-category="bags-accessories"]'],['زیبایی','[data-category="beauty"]'],['همه محصولات','#products'],['داستان ما','#aveloraBrandStory'],['ارتباط','#contact']].forEach(([label,target])=>{
  const a=document.createElement('a');a.textContent=label;a.href=target.startsWith('#')?target:'#products';
  if(!target.startsWith('#'))a.addEventListener('click',()=>{const item=document.querySelector(target);if(item){item.click();document.querySelector('#products')?.scrollIntoView({behavior:reduced?'auto':'smooth'});}});
  nav.append(a);
 });
 brand.insertAdjacentElement('afterend',nav);
}
function story(){
 if(document.getElementById('aveloraBrandStory'))return;
 const footer=document.getElementById('contact');if(!footer)return;
 const section=document.createElement('section');section.id='aveloraBrandStory';section.className='avelora-brand-story';section.setAttribute('aria-labelledby','aveloraStoryTitle');
 const copy=document.createElement('div'),kicker=document.createElement('span'),title=document.createElement('h2'),p=document.createElement('p'),mark=document.createElement('div'),word=document.createElement('span');
 kicker.className='story-kicker';kicker.textContent='BAGS • BEAUTY • MORE';title.id='aveloraStoryTitle';title.textContent='زیبایی، در انتخاب جزئیات معنا پیدا می‌کند.';
 p.textContent='در AVELORA هر انتخاب، بخشی از سبک شخصی شماست؛ از کیف‌هایی برای همراهی روزهای پرماجرا تا جزئیات زیبایی و اکسسوری‌هایی که امضای استایل شما می‌شوند. ما به انتخاب آگاهانه، کیفیت و تجربه خریدی دلنشین اهمیت می‌دهیم.';
 copy.append(kicker,title,p);mark.className='story-mark';mark.setAttribute('aria-hidden','true');word.textContent='AVELORA';mark.append(word);section.append(copy,mark);footer.parentNode.insertBefore(section,footer);
}
function tilt(el){
 if(el.dataset.avTiltReady)return;el.dataset.avTiltReady='1';el.classList.add('avelora-tilt');if(reduced||touch)return;
 let raf=0;const reset=()=>{if(raf)cancelAnimationFrame(raf);el.style.setProperty('--av-tilt-x','0deg');el.style.setProperty('--av-tilt-y','0deg');el.classList.remove('is-tilting')};
 el.addEventListener('pointermove',e=>{if(e.pointerType!=='mouse')return;const r=el.getBoundingClientRect(),x=(e.clientX-r.left)/Math.max(r.width,1),y=(e.clientY-r.top)/Math.max(r.height,1);if(raf)cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{el.style.setProperty('--av-tilt-x',((.5-x)*7).toFixed(2)+'deg');el.style.setProperty('--av-tilt-y',((y-.5)*7).toFixed(2)+'deg');el.classList.add('is-tilting')})},{passive:true});
 el.addEventListener('pointerleave',reset,{passive:true});el.addEventListener('blur',reset,true);
}
function cards(){document.querySelectorAll('.hero-visual,.category-entry,#productGrid .product').forEach(tilt)}
function init(){navigation();story();cards();const grid=document.getElementById('productGrid');if(grid&&window.MutationObserver)new MutationObserver(cards).observe(grid,{childList:true});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();