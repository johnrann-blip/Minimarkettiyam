(function applyAveloraTheme(){
  const safe=(tag,value)=>{const el=document.createElement(tag);el.textContent=value==null?'':String(value);return el;};
  const palettes={
    'black-gold':['#11100f','#b89455','#090909'],
    'warm-classic':['#f3eadc','#684632','#3d2b21'],
    'emerald-luxe':['#102b25','#c5a15b','#0a211c'],
    'rose-minimal':['#fffafa','#b87578','#fff4f2'],
    'navy-silver':['#eef1f5','#344b68','#17283e'],
    'charcoal-champagne':['#242321','#c8ae83','#191817']
  };
  const normalize=value=>String(value||'').trim().toLowerCase().replace(/[_\s]+/g,'-');
  function identifyDesign(theme,colors){
    const explicit=normalize(theme.designId||theme.design||theme.presetId||theme.preset||theme.templateId||theme.template);
    if(Object.prototype.hasOwnProperty.call(palettes,explicit))return explicit;
    const bg=normalize(colors.background),primary=normalize(colors.primary),nav=normalize(colors.navBackground);
    for(const [id,palette] of Object.entries(palettes)){
      if(bg===palette[0]&&primary===palette[1]&&nav===palette[2])return id;
    }
    return 'classic';
  }
  function applyColors(root,colors){
    const vars={background:'--theme-background',surface:'--theme-surface',text:'--theme-text',primary:'--theme-primary',navBackground:'--theme-nav-background',navText:'--theme-nav-text',accent:'--theme-accent'};
    Object.entries(vars).forEach(([key,name])=>{const value=colors[key];if(typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value))root.style.setProperty(name,value);});
  }
  function makePromo(promo){
    if(!promo||!promo.enabled)return null;
    const section=document.createElement('section');section.id='themePromo';section.className='theme-promo';
    if(promo.imageUrl){section.style.backgroundImage='linear-gradient(#0005,#0005),url("'+String(promo.imageUrl).replace(/"/g,'%22')+'")';section.style.backgroundSize='cover';section.style.backgroundPosition='center';}
    if(promo.title)section.append(safe('h2',promo.title));
    if(promo.text)section.append(safe('p',promo.text));
    if(promo.linkUrl){const link=safe('a',promo.buttonText||'مشاهده');link.href=promo.linkUrl;link.rel='noopener';section.append(link);}
    return section;
  }
  function makeCustom(item,index){
    const section=document.createElement('section');section.className='theme-custom-section';section.dataset.themeSection=item.id||String(index);
    section.style.order=String(index);section.style.setProperty('--mobile-order',String(Number(item.mobileOrder??index)));
    section.classList.toggle('theme-mobile-hidden',item.mobileEnabled===false);
    section.classList.toggle('theme-desktop-hidden',item.desktopEnabled===false);
    if(item.backgroundColor&&/^#[0-9a-f]{3,8}$/i.test(item.backgroundColor))section.style.backgroundColor=item.backgroundColor;
    if(item.imageUrl){const img=safe('img','');img.src=item.imageUrl;img.alt=item.title||'تصویر بخش';img.loading='lazy';section.append(img);}
    if(item.title)section.append(safe('h2',item.title));
    if(item.text)section.append(safe('p',item.text));
    if(item.linkUrl){const link=safe('a',item.buttonText||'مشاهده');link.href=item.linkUrl;link.rel='noopener';section.append(link);}
    return section;
  }
  async function run(){
    const response=await fetch('/api/theme',{cache:'no-store'});
    if(!response.ok)throw new Error('Theme API returned '+response.status);
    const theme=await response.json();
    if(!theme||typeof theme!=='object')throw new Error('Invalid theme response');
    const root=document.documentElement,body=document.body,colors=theme.colors||{};
    const design=identifyDesign(theme,colors);
    root.dataset.aveloraDesign=design;body.dataset.aveloraDesign=design;
    body.classList.add('avelora-theme-active');
    applyColors(root,colors);
    const fonts={Vazirmatn:'Vazirmatn,Tahoma,sans-serif',Tahoma:'Tahoma,sans-serif',Arial:'Arial,sans-serif',Georgia:'Georgia,serif'};
    if(fonts[theme.font])root.style.setProperty('--theme-font',fonts[theme.font]);
    if(theme.logoUrl){
      document.querySelectorAll('.brand,.footer-logo').forEach(brand=>{
        const img=safe('img','');img.className='theme-logo';img.src=theme.logoUrl;img.alt='AVELORA';brand.replaceChildren(img);
      });
    }
    if(theme.backgroundImageUrl)body.style.backgroundImage='linear-gradient(#ffffffb8,#ffffffb8),url("'+String(theme.backgroundImageUrl).replace(/"/g,'%22')+'")';
    const hero=document.querySelector('.hero-editorial');
    const products=document.querySelector('main#products');
    const feedback=document.querySelector('#customer-feedback');
    const footer=document.querySelector('footer#contact');
    const homeAd=document.querySelector('#homeAdSlot');
    if(theme.heroImageUrl){const img=hero&&hero.querySelector('.hero-visual img');if(img)img.src=theme.heroImageUrl;}
    const heroTrack=document.getElementById('heroTrack'),heroDots=document.getElementById('heroDots');
    const slides=(Array.isArray(theme.heroSlides)?theme.heroSlides:[]).filter(s=>s&&s.enabled!==false&&s.imageUrl).slice(0,10);
    if(heroTrack&&slides.length){
      heroTrack.replaceChildren();
      slides.forEach((slide,index)=>{
        const card=document.createElement('article');card.className='hero-slide';card.dataset.slide=String(index);
        const img=document.createElement('img');img.src=slide.imageUrl;img.alt=slide.title||'بنر AVELORA';img.loading=index===0?'eager':'lazy';if(index===0)img.fetchPriority='high';card.append(img);
        const overlay=document.createElement('div');overlay.className='hero-slide-copy';
        if(slide.title){const title=safe('h2',slide.title);overlay.append(title);}
        if(slide.text)overlay.append(safe('p',slide.text));
        if(slide.linkUrl){const link=safe('a',slide.buttonText||'همین حالا خرید کنید');link.href=slide.linkUrl;link.className='primary';overlay.append(link);}
        card.append(overlay);heroTrack.append(card);
      });
      if(heroDots){heroDots.replaceChildren();slides.forEach((slide,index)=>{const dot=document.createElement('button');dot.type='button';dot.className='hero-dot'+(index===0?' active':'');dot.setAttribute('aria-label','رفتن به بنر '+(index+1));dot.addEventListener('click',()=>heroTrack.children[index]?.scrollIntoView({behavior:'smooth',block:'nearest',inline:'start'}));heroDots.append(dot);});}
      const updateDots=()=>{const width=heroTrack.clientWidth||1;const index=Math.max(0,Math.min(slides.length-1,Math.round(heroTrack.scrollLeft/width)));heroDots?.querySelectorAll('button').forEach((dot,i)=>dot.classList.toggle('active',i===index));};
      heroTrack.addEventListener('scroll',()=>requestAnimationFrame(updateDots),{passive:true});
      const move=delta=>{const width=heroTrack.clientWidth||1;heroTrack.scrollBy({left:delta*width,behavior:'smooth'});};
      document.getElementById('heroPrev')?.addEventListener('click',()=>move(-1));
      document.getElementById('heroNext')?.addEventListener('click',()=>move(1));
      if(slides.length>1){let startX=0;heroTrack.addEventListener('touchstart',e=>{startX=e.touches[0].clientX;},{passive:true});heroTrack.addEventListener('touchend',e=>{const delta=e.changedTouches[0].clientX-startX;if(Math.abs(delta)>45)move(delta>0?-1:1);},{passive:true});}
    }else if(heroTrack&&theme.heroImageUrl){
      heroTrack.innerHTML='<article class="hero-slide"><img src="'+String(theme.heroImageUrl).replace(/"/g,'%22')+'" alt="بنر AVELORA"></article>';
    }
    const sections=Array.isArray(theme.sections)?theme.sections:[];
    const find=type=>sections.find(item=>item&&item.type===type);
    const heroSection=find('hero'),productSection=find('products'),feedbackSection=find('feedback'),footerSection=find('footer');
    const heroTitle=hero&&hero.querySelector('h1');if(heroTitle&&heroSection&&heroSection.title)heroTitle.textContent=heroSection.title;
    const heroCopy=hero&&hero.querySelector('.hero-copy p');if(heroCopy&&heroSection&&heroSection.text)heroCopy.textContent=heroSection.text;
    const productTitle=products&&products.querySelector('.section-head h2');if(productTitle&&productSection&&productSection.title)productTitle.textContent=productSection.title;
    const feedbackTitle=feedback&&feedback.querySelector('h2');if(feedbackTitle&&feedbackSection&&feedbackSection.title)feedbackTitle.textContent=feedbackSection.title;
    const feedbackCopy=feedback&&feedback.querySelector('.feedback-intro p');if(feedbackCopy&&feedbackSection&&feedbackSection.text)feedbackCopy.textContent=feedbackSection.text;
    const footerAbout=document.getElementById('footerAbout');if(footerAbout&&footerSection&&footerSection.text)footerAbout.textContent=footerSection.text;
    const wrapper=document.createElement('div');wrapper.id='themeSectionsRoot';wrapper.className='avelora-dynamic-sections';
    const core={hero,products,feedback,footer};
    const ordered=sections.length>0;
    if(ordered){
      const first=hero||products||feedback||footer||homeAd;
      if(first&&first.parentNode)first.parentNode.insertBefore(wrapper,first);
      const used=new Set();
      sections.forEach((item,index)=>{
        if(!item||item.enabled===false)return;
        if(item.type==='custom'){wrapper.append(makeCustom(item,index));return;}
        const node=core[item.type];
        if(node&&!used.has(node)){node.hidden=false;node.style.order=String(index);node.style.setProperty('--mobile-order',String(Number(item.mobileOrder??index)));node.classList.toggle('theme-mobile-hidden',item.mobileEnabled===false);node.classList.toggle('theme-desktop-hidden',item.desktopEnabled===false);wrapper.append(node);used.add(node);}
        if(item.type==='hero'&&homeAd&&!used.has(homeAd)){wrapper.append(homeAd);used.add(homeAd);}
      });
      // Keep essential storefront areas visible even when an older theme config omits them.
      [hero,products,feedback,footer].forEach(node=>{if(node&&!used.has(node)){node.hidden=false;node.style.order='999';node.classList.remove('theme-mobile-hidden','theme-desktop-hidden');wrapper.append(node);used.add(node);}});
      if(homeAd&&!used.has(homeAd))wrapper.append(homeAd);
    }
    const promo=makePromo(theme.promo);
    if(promo){if(ordered){const before=products&&wrapper.contains(products)?products:null;if(before)wrapper.insertBefore(promo,before);else wrapper.append(promo);}else if(hero&&hero.parentNode)hero.insertAdjacentElement('afterend',promo);else body.insertBefore(promo,products||footer||null);}
    root.dataset.aveloraTheme='published';
    body.dataset.aveloraThemeStatus='loaded';
  }
  run().catch(error=>{
    document.body.dataset.aveloraThemeStatus='fallback';
    console.error('[AVELORA theme] Theme could not be applied:',error);
  });
})();