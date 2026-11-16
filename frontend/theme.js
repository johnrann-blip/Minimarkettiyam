(async function applyAveloraTheme(){
  const safe=(tag,text)=>{const el=document.createElement(tag);el.textContent=text||'';return el;};
  try{
    const response=await fetch('/api/theme',{cache:'no-store'});
    if(!response.ok)return;
    const theme=await response.json();
    const root=document.documentElement,colors=theme.colors||{};
    const vars={background:'--theme-background',surface:'--theme-surface',text:'--theme-text',primary:'--theme-primary',navBackground:'--theme-nav-background',navText:'--theme-nav-text',accent:'--theme-accent'};
    Object.entries(vars).forEach(([key,name])=>{if(/^#[0-9a-f]{6}$/i.test(colors[key]||''))root.style.setProperty(name,colors[key]);});
    const fonts={Vazirmatn:'Vazirmatn,Tahoma,sans-serif',Tahoma:'Tahoma,sans-serif',Arial:'Arial,sans-serif',Georgia:'Georgia,serif'};
    if(fonts[theme.font])root.style.setProperty('--theme-font',fonts[theme.font]);
    if(theme.logoUrl){const brand=document.querySelector('.brand');if(brand){brand.replaceChildren();const img=safe('img','');img.className='theme-logo';img.src=theme.logoUrl;img.alt='AVELORA';brand.append(img);}}
    if(theme.backgroundImageUrl)document.body.style.backgroundImage='linear-gradient(#ffffffb8,#ffffffb8),url("'+String(theme.backgroundImageUrl).replace(/"/g,'%22')+'")';
    const hero=document.querySelector('.hero-editorial'),products=document.querySelector('main#products'),footer=document.querySelector('footer#contact'),feedback=document.querySelector('#customer-feedback'),homeAd=document.querySelector('#homeAdSlot');
    if(theme.heroImageUrl){const img=hero?.querySelector('.hero-visual img');if(img)img.src=theme.heroImageUrl;}
    const heroTitle=hero?.querySelector('h1');if(heroTitle){const section=theme.sections?.find(x=>x.type==='hero');if(section?.title)heroTitle.textContent=section.title;}
    const heroCopy=hero?.querySelector('.hero-copy p');if(heroCopy){const section=theme.sections?.find(x=>x.type==='hero');if(section?.text)heroCopy.textContent=section.text;}
    const productTitle=products?.querySelector('.section-head h2');const productSection=theme.sections?.find(x=>x.type==='products');if(productTitle&&productSection?.title)productTitle.textContent=productSection.title;
    const feedbackTitle=feedback?.querySelector('h2');const feedbackSection=theme.sections?.find(x=>x.type==='feedback');if(feedbackTitle&&feedbackSection?.title)feedbackTitle.textContent=feedbackSection.title;
    if(feedback&&footer)footer.insertBefore(feedback,footer.firstChild);
    let promo=null;
    if(theme.promo?.enabled){promo=document.createElement('section');promo.id='themePromo';promo.className='theme-promo';promo.append(safe('h2',theme.promo.title),safe('p',theme.promo.text));if(theme.promo.imageUrl){promo.style.backgroundImage='linear-gradient(#0004,#0004),url("'+String(theme.promo.imageUrl).replace(/"/g,'%22')+'")';promo.style.backgroundSize='cover';promo.style.backgroundPosition='center';}if(theme.promo.linkUrl){const a=safe('a',theme.promo.buttonText||'مشاهده');a.href=theme.promo.linkUrl;a.rel='noopener';promo.append(a);}}
    const wrapper=document.createElement('div');wrapper.id='themeSectionsRoot';
    const first=hero||homeAd||products;if(first?.parentNode)first.parentNode.insertBefore(wrapper,first);
    const core={hero,products,feedback,footer};
    for(const item of (Array.isArray(theme.sections)?theme.sections:[])){
      if(item.type==='custom'){
        const block=document.createElement('section');block.className='theme-custom-section';block.dataset.themeSection=item.id;
        if(item.backgroundColor)block.style.backgroundColor=item.backgroundColor;
        if(item.imageUrl){const img=safe('img','');img.src=item.imageUrl;img.alt=item.title||'تصویر بخش';img.loading='lazy';block.append(img);}
        if(item.title)block.append(safe('h2',item.title));
        if(item.text)block.append(safe('p',item.text));
        if(item.linkUrl){const a=safe('a',item.buttonText||'مشاهده');a.href=item.linkUrl;a.rel='noopener';block.append(a);}
        if(item.enabled!==false)wrapper.append(block);
        continue;
      }
      const node=core[item.type];if(!node)continue;
      node.hidden=item.enabled===false;
      if(item.enabled!==false)wrapper.append(node);
      if(item.type==='hero'&&homeAd&&homeAd.parentNode)wrapper.append(homeAd);
    }
    if(promo){const before=wrapper.querySelector('main#products');if(before)wrapper.insertBefore(promo,before);else wrapper.append(promo);}
    if(wrapper.childNodes.length)root.dataset.aveloraTheme='published';
  }catch(error){/* Keep the built-in storefront usable if a theme cannot load. */}
})();
