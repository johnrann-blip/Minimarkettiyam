const express = require('express');
const crypto = require('crypto');

const PLACEMENTS = new Set(['home_banner','product_feed','category_banner']);
const PRICING_MODELS = new Set(['daily','cpm','cpc','custom']);
const REQUEST_STATUSES = new Set(['pending','quoted','approved','rejected']);
const CAMPAIGN_STATUSES = new Set(['scheduled','active','paused','completed']);

function text(value, max) {
  return String(value ?? '').trim().slice(0, max);
}
function safeUrl(value, optional = true) {
  const raw = text(value, 1000);
  if (!raw && optional) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
    return url.toString();
  } catch { return null; }
}
function safeInteger(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : undefined;
}
function requestCode() {
  return 'ADV-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}
function estimate(packageRow, days, impressions, clicks) {
  if (packageRow.rate_toman === null || packageRow.rate_toman === undefined) return null;
  const rate = Number(packageRow.rate_toman);
  if (!Number.isSafeInteger(rate) || rate < 0) return null;
  if (packageRow.pricing_model === 'daily') { const value=rate*days; return Number.isSafeInteger(value)?value:null; }
  if (packageRow.pricing_model === 'cpm' && impressions) { const value=rate*Math.ceil(impressions/1000); return Number.isSafeInteger(value)?value:null; }
  if (packageRow.pricing_model === 'cpc' && clicks) { const value=rate*clicks; return Number.isSafeInteger(value)?value:null; }
  return null;
}

function createAdvertisingRouter({pool, rateLimit}) {
  const router = express.Router();

  router.get('/packages', async (_req,res) => {
    try {
      const result = await pool.query(
        'SELECT id,code,title,description,placement,pricing_model,rate_toman FROM advertising_packages WHERE is_active=true ORDER BY display_order,id'
      );
      res.json(result.rows.map(row => ({
        ...row,
        rate_toman: row.rate_toman === null ? null : Number(row.rate_toman)
      })));
    } catch {
      res.status(503).json({error:'دریافت جایگاه‌های تبلیغاتی موقتاً ممکن نیست.'});
    }
  });

  router.post('/requests', rateLimit, async (req,res) => {
    const body = req.body || {};
    const advertiserName = text(body.advertiser_name,120);
    const businessName = text(body.business_name,160);
    const phone = text(body.phone,24).replace(/[\s()-]/g,'');
    const email = text(body.email,254);
    const website = safeUrl(body.website_url);
    const creative = safeUrl(body.creative_url);
    const target = safeUrl(body.target_url);
    const industry = text(body.industry,100);
    const message = text(body.message,3000);
    const packageId = safeInteger(body.package_id,1);
    const duration = safeInteger(body.duration_days,1,90);
    const impressions = safeInteger(body.target_impressions,1,100000000);
    const clicks = safeInteger(body.target_clicks,1,10000000);
    const budget = safeInteger(body.budget_toman,0);
    if (!advertiserName || !businessName || !/^\+?[0-9۰-۹٠-٩]{8,20}$/.test(phone) ||
        !packageId || !duration || website === null || creative === null || target === null ||
        impressions === undefined || clicks === undefined || budget === undefined ||
        (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      return res.status(400).json({error:'اطلاعات تماس، جایگاه، مدت یا لینک‌های واردشده معتبر نیستند. لینک‌ها باید HTTPS باشند.'});
    }
    try {
      const selected = await pool.query('SELECT * FROM advertising_packages WHERE id=$1 AND is_active=true',[packageId]);
      if (!selected.rowCount) return res.status(400).json({error:'جایگاه تبلیغ انتخاب‌شده فعال نیست.'});
      const pkg = selected.rows[0];
      const quote = estimate(pkg,duration,impressions,clicks);
      const code = requestCode();
      const result = await pool.query(
        `INSERT INTO advertising_requests
         (request_code,advertiser_name,business_name,phone,email,website_url,industry,package_id,duration_days,
          target_impressions,target_clicks,budget_toman,creative_url,target_url,message,quote_toman,status)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         RETURNING id,request_code,status,quote_toman,created_at`,
        [code,advertiserName,businessName,phone,email,website,industry,packageId,duration,
         impressions,clicks,budget,creative,target,message,quote,quote===null?'pending':'quoted']
      );
      res.status(201).json({
        success:true,
        request: {...result.rows[0],quote_toman:result.rows[0].quote_toman===null?null:Number(result.rows[0].quote_toman)},
        message:'درخواست شما ثبت شد. پس از بررسی، نتیجه و مبلغ نهایی از طریق اطلاعات تماس اعلام می‌شود.'
      });
    } catch {
      res.status(503).json({error:'ثبت درخواست تبلیغات انجام نشد. لطفاً کمی بعد دوباره تلاش کنید.'});
    }
  });

  router.get('/campaigns/:placement', async (req,res) => {
    const placement = String(req.params.placement || '');
    if (!PLACEMENTS.has(placement)) return res.status(400).json({error:'جایگاه تبلیغاتی نامعتبر است.'});
    try {
      const found = await pool.query(
        `SELECT c.id,c.title,c.image_url,p.placement
         FROM advertising_campaigns c
         JOIN advertising_packages p ON p.id=c.package_id
         JOIN advertising_requests r ON r.id=c.request_id
         WHERE p.placement=$1 AND p.is_active=true AND r.payment_status='paid'
           AND c.status IN ('active','scheduled') AND c.starts_at<=NOW() AND c.ends_at>NOW()
         ORDER BY c.created_at DESC LIMIT 5`,
        [placement]
      );
      for (const campaign of found.rows) {
        await pool.query('UPDATE advertising_campaigns SET impressions=impressions+1 WHERE id=$1',[campaign.id]);
        await pool.query("INSERT INTO advertising_events(campaign_id,event_type) VALUES($1,'impression')",[campaign.id]);
      }
      res.set('Cache-Control','no-store');
      res.json(found.rows);
    } catch {
      res.status(503).json({error:'نمایش تبلیغات موقتاً ممکن نیست.'});
    }
  });

  router.get('/click/:id', async (req,res) => {
    const id = safeInteger(req.params.id,1);
    if (!id) return res.status(404).send('تبلیغ پیدا نشد.');
    try {
      const result = await pool.query(
        `UPDATE advertising_campaigns c SET clicks=clicks+1,updated_at=NOW()
         FROM advertising_requests r
         WHERE c.id=$1 AND r.id=c.request_id AND r.payment_status='paid'
           AND c.status IN ('active','scheduled') AND c.starts_at<=NOW() AND c.ends_at>NOW()
         RETURNING c.target_url`,
        [id]
      );
      if (!result.rowCount) return res.status(404).send('تبلیغ در دسترس نیست.');
      await pool.query("INSERT INTO advertising_events(campaign_id,event_type) VALUES($1,'click')",[id]);
      res.redirect(302,result.rows[0].target_url);
    } catch {
      res.status(503).send('ثبت کلیک تبلیغ انجام نشد.');
    }
  });

  return router;
}

function createAdvertisingAdminRouter({pool}) {
  const router = express.Router();

  router.get('/packages', async (_req,res) => {
    try {
      const r = await pool.query('SELECT * FROM advertising_packages ORDER BY display_order,id');
      res.json(r.rows.map(x=>({...x,rate_toman:x.rate_toman===null?null:Number(x.rate_toman)})));
    } catch { res.status(503).json({error:'دریافت تعرفه‌ها انجام نشد.'}); }
  });

  router.patch('/packages/:id', async (req,res) => {
    const id=safeInteger(req.params.id,1);
    const body=req.body||{};
    const model=String(body.pricing_model||'');
    const rate=safeInteger(body.rate_toman,0);
    const active=body.is_active;
    if(!id||!PRICING_MODELS.has(model)||rate===undefined||typeof active!=='boolean')
      return res.status(400).json({error:'مدل قیمت‌گذاری، مبلغ یا وضعیت جایگاه معتبر نیست.'});
    try {
      const r=await pool.query(
        'UPDATE advertising_packages SET pricing_model=$1,rate_toman=$2,is_active=$3,updated_at=NOW() WHERE id=$4 RETURNING *',
        [model,rate,active,id]
      );
      if(!r.rowCount)return res.status(404).json({error:'جایگاه پیدا نشد.'});
      res.json({...r.rows[0],rate_toman:r.rows[0].rate_toman===null?null:Number(r.rows[0].rate_toman)});
    } catch { res.status(503).json({error:'ذخیره تعرفه انجام نشد.'}); }
  });

  router.get('/requests', async (_req,res) => {
    try {
      const r=await pool.query(
        `SELECT r.*,p.title AS package_title,p.placement,p.pricing_model,p.rate_toman,
                c.id AS campaign_id,c.status AS campaign_status,c.impressions,c.clicks
         FROM advertising_requests r JOIN advertising_packages p ON p.id=r.package_id
         LEFT JOIN advertising_campaigns c ON c.request_id=r.id
         ORDER BY r.created_at DESC LIMIT 300`
      );
      res.json(r.rows.map(x=>({...x,quote_toman:x.quote_toman===null?null:Number(x.quote_toman),
        budget_toman:x.budget_toman===null?null:Number(x.budget_toman),
        rate_toman:x.rate_toman===null?null:Number(x.rate_toman)})));
    } catch { res.status(503).json({error:'دریافت درخواست‌های تبلیغاتی انجام نشد.'}); }
  });

  router.patch('/requests/:id', async (req,res) => {
    const id=safeInteger(req.params.id,1), body=req.body||{};
    const status=String(body.status||'');
    const payment=String(body.payment_status||'');
    const quote=safeInteger(body.quote_toman,0);
    const notes=text(body.admin_notes,3000);
    if(!id||!REQUEST_STATUSES.has(status)||!['unpaid','paid'].includes(payment)||quote===undefined)
      return res.status(400).json({error:'وضعیت یا مبلغ پیشنهادی معتبر نیست.'});
    if(payment==='paid'&&status!=='approved')
      return res.status(400).json({error:'ابتدا درخواست را تأیید کنید؛ سپس پرداخت را ثبت کنید.'});
    try {
      const r=await pool.query(
        `UPDATE advertising_requests SET status=$1,payment_status=$2,quote_toman=$3,admin_notes=$4,updated_at=NOW()
         WHERE id=$5 RETURNING id,request_code,status,payment_status,quote_toman,admin_notes`,
        [status,payment,quote,notes,id]
      );
      if(!r.rowCount)return res.status(404).json({error:'درخواست پیدا نشد.'});
      res.json({...r.rows[0],quote_toman:r.rows[0].quote_toman===null?null:Number(r.rows[0].quote_toman)});
    } catch { res.status(503).json({error:'ذخیره درخواست تبلیغاتی انجام نشد.'}); }
  });

  router.post('/requests/:id/campaign', async (req,res) => {
    const id=safeInteger(req.params.id,1), body=req.body||{};
    const title=text(body.title,160);
    const image=safeUrl(body.image_url,false);
    const target=safeUrl(body.target_url,false);
    const starts=new Date(body.starts_at), ends=new Date(body.ends_at);
    if(!id||!title||!image||!target||!Number.isFinite(starts.getTime())||!Number.isFinite(ends.getTime())||ends<=starts)
      return res.status(400).json({error:'عنوان، لینک تصویر، لینک مقصد و بازه زمانی معتبر الزامی است. لینک‌ها باید HTTPS باشند.'});
    try {
      const r=await pool.query('SELECT id,package_id,status,payment_status FROM advertising_requests WHERE id=$1',[id]);
      if(!r.rowCount)return res.status(404).json({error:'درخواست پیدا نشد.'});
      if(r.rows[0].status!=='approved'||r.rows[0].payment_status!=='paid')
        return res.status(409).json({error:'برای انتشار، درخواست باید تأیید و پرداخت آن پس از بررسی واقعی وجه ثبت شده باشد.'});
      const campaign=await pool.query(
        `INSERT INTO advertising_campaigns(request_id,package_id,title,image_url,target_url,starts_at,ends_at,status)
         VALUES($1,$2,$3,$4,$5,$6,$7,CASE WHEN $6::timestamptz>NOW() THEN 'scheduled' ELSE 'active' END)
         ON CONFLICT(request_id) DO UPDATE SET title=EXCLUDED.title,image_url=EXCLUDED.image_url,target_url=EXCLUDED.target_url,
           starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,status=EXCLUDED.status,updated_at=NOW()
         RETURNING *`,
        [id,r.rows[0].package_id,title,image,target,starts.toISOString(),ends.toISOString()]
      );
      res.status(201).json(campaign.rows[0]);
    } catch { res.status(503).json({error:'ساخت یا به‌روزرسانی کمپین انجام نشد.'}); }
  });

  router.get('/campaigns', async (_req,res) => {
    try {
      await pool.query("UPDATE advertising_campaigns SET status='completed',updated_at=NOW() WHERE status IN ('active','scheduled') AND ends_at<=NOW()");
      await pool.query("UPDATE advertising_campaigns SET status='active',updated_at=NOW() WHERE status='scheduled' AND starts_at<=NOW() AND ends_at>NOW()");
      const r=await pool.query(
        `SELECT c.*,r.request_code,r.business_name,r.payment_status,p.title AS package_title,p.placement
         FROM advertising_campaigns c JOIN advertising_requests r ON r.id=c.request_id
         JOIN advertising_packages p ON p.id=c.package_id ORDER BY c.created_at DESC LIMIT 300`
      );
      res.json(r.rows);
    } catch { res.status(503).json({error:'دریافت کمپین‌ها انجام نشد.'}); }
  });

  router.patch('/campaigns/:id', async (req,res) => {
    const id=safeInteger(req.params.id,1), status=String(req.body?.status||'');
    if(!id||!CAMPAIGN_STATUSES.has(status))return res.status(400).json({error:'وضعیت کمپین معتبر نیست.'});
    try {
      const r=await pool.query(
        `UPDATE advertising_campaigns c SET status=$1,updated_at=NOW()
         FROM advertising_requests a WHERE c.id=$2 AND a.id=c.request_id
           AND ($1<>'active' OR a.payment_status='paid') RETURNING c.id,c.status`,[status,id]);
      if(!r.rowCount){
        const exists=await pool.query('SELECT id FROM advertising_campaigns WHERE id=$1',[id]);
        if(!exists.rowCount)return res.status(404).json({error:'کمپین پیدا نشد.'});
        return res.status(409).json({error:'کمپین بدون تأیید دریافت وجه قابل فعال‌سازی نیست.'});
      }
      res.json(r.rows[0]);
    } catch { res.status(503).json({error:'به‌روزرسانی کمپین انجام نشد.'}); }
  });

  return router;
}

module.exports={createAdvertisingRouter,createAdvertisingAdminRouter};
