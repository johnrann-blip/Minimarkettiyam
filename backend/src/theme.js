'use strict';
const express = require('express');

const DEFAULT_THEME = Object.freeze({
  colors: { background:'#fbf9f5', surface:'#ffffff', text:'#29221e', primary:'#3b281f', navBackground:'#3b281f', navText:'#ffffff', accent:'#b68a4c' },
  font: 'Vazirmatn',
  logoUrl: '',
  heroImageUrl: '',
  sections: [
    { id:'hero', type:'hero', enabled:true, title:'استایل خاص، با AVELORA', text:'کیف، اکسسوری و زیبایی؛ انتخاب‌هایی برای درخشش هر روز تو' },
    { id:'products', type:'products', enabled:true, title:'محصولات' },
    { id:'feedback', type:'feedback', enabled:true, title:'نظرت برای ما ارزشمنده' },
    { id:'footer', type:'footer', enabled:true, title:'ارتباط با ما' }
  ],
  promo: { enabled:false, title:'', text:'', imageUrl:'', linkUrl:'', buttonText:'مشاهده' }
});
const COLOR_KEYS = ['background','surface','text','primary','navBackground','navText','accent'];
const FONTS = ['Vazirmatn','Tahoma','Arial','Georgia'];
const SECTION_TYPES = ['hero','products','feedback','footer'];
function safeUrl(value) {
  const s=String(value||'').trim();
  if(!s) return '';
  if(s.length>1000) throw new Error('نشانی تصویر بیش از حد طولانی است.');
  if(s.startsWith('/uploads/')) return s;
  let u; try { u=new URL(s); } catch { throw new Error('نشانی تصویر معتبر نیست.'); }
  if(u.protocol!=='https:') throw new Error('نشانی تصاویر باید HTTPS باشد.');
  return s;
}
function normalizeConfig(input) {
  if(!input||typeof input!=='object'||Array.isArray(input)) throw new Error('تنظیمات قالب معتبر نیست.');
  const c=input.colors&&typeof input.colors==='object'?input.colors:{};
  const colors={};
  for(const key of COLOR_KEYS) {
    const value=String(c[key]??DEFAULT_THEME.colors[key]);
    if(!/^#[0-9a-fA-F]{6}$/.test(value)) throw new Error('یکی از رنگ‌های انتخاب‌شده معتبر نیست.');
    colors[key]=value.toLowerCase();
  }
  const font=FONTS.includes(input.font)?input.font:DEFAULT_THEME.font;
  const sections=Array.isArray(input.sections)?input.sections:[];
  if(sections.length<2||sections.length>12) throw new Error('چیدمان باید حداقل ۲ و حداکثر ۱۲ بخش داشته باشد.');
  const seen=new Set();
  const normalized=sections.map((s,i)=>{
    const type=String(s?.type||'');
    if(!SECTION_TYPES.includes(type)) throw new Error('نوع یکی از بخش‌های صفحه پشتیبانی نمی‌شود.');
    const id=String(s.id||type).replace(/[^a-z0-9_-]/gi,'').slice(0,40)||type;
    if(seen.has(id)) throw new Error('شناسه بخش‌ها باید یکتا باشد.');
    seen.add(id);
    return {id,type,enabled:s.enabled!==false,title:String(s.title||'').slice(0,100)};
  });
  const promo=input.promo&&typeof input.promo==='object'?input.promo:{};
  return {
    colors,font,logoUrl:safeUrl(input.logoUrl),heroImageUrl:safeUrl(input.heroImageUrl),
    sections:normalized,
    promo:{enabled:promo.enabled===true,title:String(promo.title||'').slice(0,120),text:String(promo.text||'').slice(0,600),imageUrl:safeUrl(promo.imageUrl),linkUrl:safeUrl(promo.linkUrl),buttonText:String(promo.buttonText||'مشاهده').slice(0,40)}
  };
}
function ownerOnly(req,res,next) {
  if(req.admin?.role!=='owner') return res.status(403).json({error:'مدیریت ظاهر فروشگاه فقط در اختیار مالک است.'});
  next();
}
function createThemePublicRouter({pool}) {
  const router=express.Router();
  router.get('/',async(_req,res)=>{
    try { const r=await pool.query('SELECT published_config FROM store_theme_settings WHERE id=1'); res.set('Cache-Control','no-store'); res.json(r.rows[0]?.published_config||DEFAULT_THEME); }
    catch { res.status(503).json({error:'قالب فروشگاه فعلاً در دسترس نیست.'}); }
  });
  return router;
}
function createThemeAdminRouter({pool}) {
  const router=express.Router();
  router.use(ownerOnly);
  router.get('/',async(_req,res)=>{
    try { const r=await pool.query('SELECT draft_config,published_config,published_at,updated_at FROM store_theme_settings WHERE id=1'); res.json(r.rows[0]||{draft_config:DEFAULT_THEME,published_config:DEFAULT_THEME}); }
    catch { res.status(503).json({error:'تنظیمات ظاهر فروشگاه دریافت نشد.'}); }
  });
  router.put('/draft',async(req,res)=>{
    try {
      const config=normalizeConfig(req.body);
      await pool.query('UPDATE store_theme_settings SET draft_config=$1::jsonb,updated_by=$2,updated_at=NOW() WHERE id=1',[JSON.stringify(config),req.admin.id]);
      res.json({success:true,draft_config:config});
    } catch(e) { res.status(400).json({error:e.message||'ذخیره پیش‌نویس انجام نشد.'}); }
  });
  router.post('/publish',async(req,res)=>{
    try {
      const r=await pool.query('UPDATE store_theme_settings SET published_config=draft_config,published_at=NOW(),updated_by=$1,updated_at=NOW() WHERE id=1 RETURNING published_config,published_at',[req.admin.id]);
      res.json({success:true,...r.rows[0]});
    } catch { res.status(500).json({error:'انتشار قالب انجام نشد.'}); }
  });
  router.post('/reset',async(req,res)=>{
    try {
      await pool.query('UPDATE store_theme_settings SET draft_config=$1::jsonb,updated_by=$2,updated_at=NOW() WHERE id=1',[JSON.stringify(DEFAULT_THEME),req.admin.id]);
      res.json({success:true,draft_config:DEFAULT_THEME});
    } catch { res.status(500).json({error:'بازنشانی پیش‌نویس انجام نشد.'}); }
  });
  return router;
}
module.exports={createThemePublicRouter,createThemeAdminRouter,DEFAULT_THEME};
