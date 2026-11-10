'use strict';
const express = require('express');
const SITE = 'https://avelorashop.ir';
const CATEGORY_COPY = {
  'bags-accessories': {title:'خرید کیف و اکسسوری زنانه',description:'مدل‌های کیف و اکسسوری زنانه را در ویترین AVELORA ببینید؛ مشخصات، قیمت و موجودی محصولات را بررسی و انتخاب کنید.',intro:'در این بخش می‌توانید محصولات کیف و اکسسوری فروشگاه AVELORA را همراه با مشخصات و قیمت ثبت‌شده بررسی کنید.'},
  beauty: {title:'خرید لوازم آرایشی و محصولات زیبایی',description:'محصولات آرایشی و زیبایی فروشگاه AVELORA را ببینید؛ توضیحات، قیمت و وضعیت موجودی هر محصول را پیش از خرید بررسی کنید.',intro:'در این بخش، محصولات آرایشی و زیبایی موجود در فروشگاه AVELORA با اطلاعات ثبت‌شده هر کالا نمایش داده می‌شوند.'},
  more: {title:'سایر محصولات فروشگاه AVELORA',description:'سایر محصولات فروشگاه AVELORA را همراه با مشخصات، قیمت و وضعیت موجودی مشاهده کنید.',intro:'محصولات دیگر فروشگاه AVELORA در این صفحه معرفی می‌شوند.'}
};
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function imageUrl(v){try{const u=new URL(String(v||''),SITE);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}}
function json(v){return JSON.stringify(v).replace(/</g,'\\u003c');}
function renderPage(o){
 const img=o.image?'<meta property="og:image" content="'+esc(o.image)+'"><meta name="twitter:card" content="summary_large_image">':'<meta name="twitter:card" content="summary">';
 return '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#3b281f"><title>'+esc(o.title)+'</title><meta name="description" content="'+esc(o.description)+'"><link rel="canonical" href="'+esc(o.canonical)+'"><meta name="robots" content="index,follow,max-image-preview:large"><meta property="og:type" content="website"><meta property="og:site_name" content="AVELORA"><meta property="og:locale" content="fa_IR"><meta property="og:title" content="'+esc(o.title)+'"><meta property="og:description" content="'+esc(o.description)+'"><meta property="og:url" content="'+esc(o.canonical)+'">'+img+'<link rel="stylesheet" href="/style.css?v=20261110-seo-1"><script type="application/ld+json">'+json(o.jsonLd)+'</script><style>.seo-page{max-width:1120px;margin:36px auto;padding:0 18px}.seo-breadcrumb{font-size:.9rem;color:#76675e;margin-bottom:22px}.seo-breadcrumb a,.seo-back{color:#805b48}.seo-intro{line-height:2;color:#62564f;max-width:850px}.seo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:18px;margin:28px 0}.seo-card{display:block;color:inherit;text-decoration:none;border:1px solid #eee5df;border-radius:16px;overflow:hidden;background:#fff}.seo-card img{width:100%;height:220px;object-fit:cover;background:#f7f2ee}.seo-card-copy{padding:14px}.seo-card h2{font-size:1rem;line-height:1.8;margin:0 0 8px}.seo-price{font-weight:700;color:#805b48}.seo-stock{font-size:.85rem;color:#777;margin-top:7px}.seo-product{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:30px;align-items:start}.seo-product img{width:100%;max-height:560px;object-fit:contain;border-radius:18px;background:#faf7f4}.seo-product-copy{line-height:2}.seo-product-copy h1{line-height:1.7}.seo-empty{padding:24px;background:#faf7f4;border-radius:14px}@media(max-width:650px){.seo-product{grid-template-columns:1fr}.seo-product img{max-height:380px}.seo-page{margin:22px auto}.seo-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.seo-card img{height:160px}}</style></head><body><header class="top"><a class="brand" href="/">AVELORA <small>BAGS • BEAUTY • MORE</small></a><div class="top-actions"><a class="account-open" href="/#products">مشاهده فروشگاه</a></div></header>'+o.body+'<footer class="site-footer"><div class="footer-bottom"><span>© تمامی حقوق برای AVELORA محفوظ است.</span><a href="/advertising.html">تبلیغات و همکاری</a></div></footer></body></html>';
}
function createSeoRouter({pool}){
 const router=express.Router();
 router.get('/robots.txt',(_req,res)=>res.type('text/plain').send('User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\nSitemap: https://avelorashop.ir/sitemap.xml\n'));
 router.get('/sitemap.xml',async(_req,res)=>{
  try{
   const [cats,items]=await Promise.all([pool.query('SELECT slug FROM categories WHERE is_active=true ORDER BY id'),pool.query('SELECT id,updated_at FROM products WHERE is_active=true ORDER BY id DESC LIMIT 50000')]);
   const urls=[{loc:SITE+'/',priority:'1.0'},{loc:SITE+'/advertising.html',priority:'0.3'},...cats.rows.map(x=>({loc:SITE+'/category/'+encodeURIComponent(x.slug),priority:'0.8'})),...items.rows.map(x=>({loc:SITE+'/product/'+x.id,lastmod:x.updated_at,priority:'0.7'}))];
   const xml='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+urls.map(x=>'  <url><loc>'+esc(x.loc)+'</loc>'+(x.lastmod?'<lastmod>'+new Date(x.lastmod).toISOString()+'</lastmod>':'')+'<changefreq>weekly</changefreq><priority>'+x.priority+'</priority></url>').join('\n')+'\n</urlset>\n';
   res.type('application/xml').set('Cache-Control','public, max-age=300').send(xml);
  }catch(e){console.error('SEO sitemap generation failed:',e.message);res.status(503).type('text/plain').send('Sitemap temporarily unavailable');}
 });
 router.get('/category/:slug',async(req,res)=>{
  try{
   const cr=await pool.query('SELECT id,name,slug FROM categories WHERE slug=$1 AND is_active=true LIMIT 1',[String(req.params.slug||'')]);
   if(!cr.rowCount)return res.status(404).send('دسته‌بندی پیدا نشد.');
   const c=cr.rows[0],pr=await pool.query('SELECT id,name,description,price_toman,sale_price_toman,stock,image_url FROM products WHERE category_id=$1 AND is_active=true ORDER BY created_at DESC LIMIT 100',[c.id]);
   const copy=CATEGORY_COPY[c.slug]||{title:'خرید '+c.name+' از AVELORA',description:'محصولات '+c.name+' فروشگاه AVELORA را همراه با مشخصات، قیمت و موجودی مشاهده کنید.',intro:'محصولات دسته '+c.name+' در این صفحه معرفی می‌شوند.'};
   const canonical=SITE+'/category/'+encodeURIComponent(c.slug);
   const cards=pr.rows.map((p,i)=>{const im=imageUrl(p.image_url),price=Number(p.sale_price_toman??p.price_toman);return '<a class="seo-card" href="/product/'+p.id+'">'+(im?'<img src="'+esc(im)+'" alt="'+esc(p.name)+'" '+(i<2?'fetchpriority="high"':'loading="lazy">'):'')+'<div class="seo-card-copy"><h2>'+esc(p.name)+'</h2><div class="seo-price">'+new Intl.NumberFormat('fa-IR').format(price)+' تومان</div><div class="seo-stock">'+(Number(p.stock)>0?'موجود در انبار':'ناموجود')+'</div></div></a>';}).join('');
   const body='<main class="seo-page"><nav class="seo-breadcrumb"><a href="/">خانه</a> / '+esc(c.name)+'</nav><h1>'+esc(copy.title)+'</h1><p class="seo-intro">'+esc(copy.intro)+'</p><section class="seo-grid" aria-label="'+esc(c.name)+'">'+(cards||'<p class="seo-empty">در حال حاضر محصول فعالی در این دسته ثبت نشده است.</p>')+'</section><p class="seo-back"><a href="/#products">بازگشت به فروشگاه و مشاهده همه محصولات</a></p></main>';
   const jsonLd={'@context':'https://schema.org','@type':'CollectionPage','name':copy.title,'description':copy.description,'url':canonical,'inLanguage':'fa-IR','mainEntity':{'@type':'ItemList','numberOfItems':pr.rows.length,'itemListElement':pr.rows.map((p,i)=>({'@type':'ListItem','position':i+1,'url':SITE+'/product/'+p.id}))}};
   res.send(renderPage({title:copy.title+' | AVELORA',description:copy.description,canonical,body,jsonLd}));
  }catch(e){console.error('SEO category page failed:',e.message);res.status(503).send('صفحه موقتاً در دسترس نیست.');}
 });
 router.get('/product/:id',async(req,res)=>{
  const id=String(req.params.id||'');if(!/^[1-9][0-9]*$/.test(id))return res.status(404).send('محصول پیدا نشد.');
  try{
   const r=await pool.query('SELECT p.id,p.name,p.description,p.price_toman,p.sale_price_toman,p.stock,p.image_url,c.name AS category_name,c.slug AS category_slug FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=$1 AND p.is_active=true LIMIT 1',[id]);
   if(!r.rowCount)return res.status(404).send('محصول پیدا نشد.');
   const p=r.rows[0],canonical=SITE+'/product/'+p.id,im=imageUrl(p.image_url),price=Number(p.sale_price_toman??p.price_toman),desc=String(p.description||('مشاهده مشخصات و قیمت '+p.name+' در فروشگاه AVELORA.')).slice(0,300);
   const body='<main class="seo-page"><nav class="seo-breadcrumb"><a href="/">خانه</a> / <a href="/category/'+encodeURIComponent(p.category_slug||'more')+'">'+esc(p.category_name||'محصولات')+'</a> / '+esc(p.name)+'</nav><article class="seo-product">'+(im?'<img src="'+esc(im)+'" alt="'+esc(p.name)+'" fetchpriority="high">':'<div class="seo-empty">تصویری برای این محصول ثبت نشده است.</div>')+'<div class="seo-product-copy"><span class="eyebrow">'+esc(p.category_name||'محصول AVELORA')+'</span><h1>'+esc(p.name)+'</h1><p>'+esc(desc)+'</p><h2 class="seo-price">'+new Intl.NumberFormat('fa-IR').format(price)+' تومان</h2><p>'+(Number(p.stock)>0?'موجود در انبار':'در حال حاضر ناموجود')+'</p><a class="primary" href="/#products">مشاهده فروشگاه و ثبت سفارش</a></div></article></main>';
   const jsonLd={'@context':'https://schema.org','@type':'Product','name':p.name,'description':desc,'url':canonical,'inLanguage':'fa-IR',...(im?{'image':[im]}:{}),'offers':{'@type':'Offer','url':canonical,'priceCurrency':'IRR','price':String(Math.round(price*10)),'availability':Number(p.stock)>0?'https://schema.org/InStock':'https://schema.org/OutOfStock','itemCondition':'https://schema.org/NewCondition'}};
   res.send(renderPage({title:'خرید '+p.name+' | AVELORA',description:desc,canonical,image:im,body,jsonLd}));
  }catch(e){console.error('SEO product page failed:',e.message);res.status(503).send('صفحه موقتاً در دسترس نیست.');}
 });
 return router;
}
module.exports={createSeoRouter};