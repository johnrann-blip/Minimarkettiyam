(async function applyAveloraTheme(){
  try{
    const response=await fetch('/api/theme',{cache:'no-store'});
    if(!response.ok)return;
    const theme=await response.json();
    const root=document.documentElement,colors=theme.colors||{};
    const vars={background:'--theme-background',surface:'--theme-surface',text:'--theme-text',primary:'--theme-primary',navBackground:'--theme-nav-background',navText:'--theme-nav-text',accent:'--theme-accent'};
    Object.entries(vars).forEach(([key,name])=>{if(/^#[0-9a-f]{6}$/i.test(colors[key]||''))root.style.setProperty(name,colors[key]);});
    const fonts={Vazirmatn:'Vazirmatn,Tahoma,sans-serif',Tahoma:'Tahoma,sans-serif',Arial:'Arial,sans-serif',Georgia:'Georgia,serif'};
    if(fonts[theme.font])root.style.setProperty('--theme-font',fonts[theme.font]);
    if(theme.logoUrl){const brand=document.querySelector('.brand');if(brand){brand.innerHTML='<img class="theme-logo" src="'+String(theme.logoUrl).replace(/"/g,'%22')+'" alt="AVELORA"><small>BAGS • BEAUTY • MORE</small>';}}
    if(theme.backgroundImageUrl)document.body.style.backgroundImage='linear-gradient(#ffffffb8,#ffffffb8),url("'+String(theme.backgroundImageUrl).replace(/"/g,'%22')+'")';
    if(theme.heroImageUrl){const hero=document.querySelector('.hero-visual img');if(hero)hero.src=theme.heroImageUrl;}
    const nodes={hero:document.querySelector('.hero-editorial'),products:document.querySelector('main#products'),feedback:document.querySelector('#customer-feedback'),footer:document.querySelector('footer#contact')};
    if(theme.promo?.enabled){let promo=document.getElementById('themePromo');if(!promo){promo=document.createElement('section');promo.id='themePromo';promo.className='theme-promo';}const title=document.createElement('h2');title.textContent=theme.promo.title||'';const copy=document.createElement('p');copy.textContent=theme.promo.text||'';promo.replaceChildren(title,copy);if(theme.promo.imageUrl){promo.style.backgroundImage='linear-gradient(#0004,#0004),url("'+String(theme.promo.imageUrl).replace(/"/g,'%22')+'")';promo.style.backgroundSize='cover';promo.style.backgroundPosition='center';}if(theme.promo.linkUrl){const a=document.createElement('a');a.href=theme.promo.linkUrl;a.textContent=theme.promo.buttonText||'مشاهده';a.rel='noopener';promo.append(a);}nodes.promo=promo;}
    const parent=nodes.hero?.parentNode;
    if(parent&&Array.isArray(theme.sections)){let anchor=nodes.hero;for(const item of theme.sections){const node=nodes[item.type];if(!node)continue;node.hidden=item.enabled===false;if(item.enabled!==false){if(anchor&&anchor.parentNode===parent){anchor.after(node);anchor=node;}else{parent.append(node);anchor=node;}}}}
    if(theme.promo?.enabled&&nodes.promo&&nodes.products){nodes.products.before(nodes.promo);}
    root.dataset.aveloraTheme='published';
  }catch(error){/* The storefront remains usable with its built-in theme. */}
})();
