const express = require('express');
const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);
const router = express.Router();
const COOKIE = 'avelora_admin_session';
const PERMISSIONS = ['products.view','products.create','products.update','products.archive','orders.view','orders.update','customers.view','settings.view','settings.update','payments.view','payments.manage','reports.view','audit.view'];

function cookieValue(header,name) {
 const entry=String(header||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='));
 if(!entry) return '';
 try { return decodeURIComponent(entry.slice(name.length+1)); } catch { return ''; }
}
function setCookie(res,token) {
 const secure=process.env.NODE_ENV==='production' ? '; Secure' : '';
 res.setHeader('Set-Cookie',COOKIE+'='+encodeURIComponent(token)+'; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400'+secure);
}
function clearCookie(res) {
 const secure=process.env.NODE_ENV==='production' ? '; Secure' : '';
 res.setHeader('Set-Cookie',COOKIE+'=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'+secure);
}
function safeEqual(a,b) {
 const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));
 return x.length===y.length&&x.length>0&&crypto.timingSafeEqual(x,y);
}
function hashToken(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
function usernameOf(value) { return String(value||'').trim().toLowerCase(); }
function validUsername(value) { return /^[a-z0-9][a-z0-9._-]{2,59}$/.test(value); }
function validPermissions(value) { return Array.isArray(value)&&value.every(x=>PERMISSIONS.includes(x))&&new Set(value).size===value.length; }
async function audit(pool,admin,req,action,resource,status=200,id=null) {
 try {
  await pool.query('INSERT INTO admin_audit_logs(admin_id,username,action,resource,resource_id,request_method,request_path,response_status,ip_address,user_agent) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
   [admin?.id||null,admin?.username||null,action,resource,id,req.method,req.originalUrl||req.path,status,String(req.ip||'').slice(0,64),String(req.get('user-agent')||'').slice(0,300)]);
 } catch(error) { console.error('Admin audit write failed:',error.message); }
}
function requiredPermission(req) {
 const p=req.path.replace(/^\/api\/admin/,'')||'/',m=req.method;
 if(p==='/products') return m==='GET'?'products.view':m==='POST'?'products.create':'products.update';
 if(/^\/products\/[^/]+$/.test(p)) return m==='DELETE'||(m==='PATCH'&&typeof req.body?.is_active==='boolean'&&Object.keys(req.body||{}).every(k=>k==='is_active'))?'products.archive':m==='GET'?'products.view':'products.update';
 if(p==='/uploads/product') return 'products.upload';
 if(p==='/orders') return 'orders.view';
 if(/^\/orders\/[^/]+\/status$/.test(p)) return 'orders.update';
 if(p==='/customers') return 'customers.view';
 if(p==='/store-settings') return m==='GET'?'payments.view':'payments.manage';
 if(p.startsWith('/reports')) return 'reports.view';
 if(p.startsWith('/audit')) return 'audit.view';
 return 'admin.access';
}
function createAdminAuth({pool,rateLimit}) {
 async function createSession(adminId,req,res) {
  const token=crypto.randomBytes(32).toString('hex');
  await pool.query("INSERT INTO admin_sessions(admin_id,token_hash,expires_at,ip_address,user_agent) VALUES($1,$2,NOW()+INTERVAL '1 day',$3,$4)",
   [adminId,hashToken(token),String(req.ip||'').slice(0,64),String(req.get('user-agent')||'').slice(0,300)]);
  setCookie(res,token);
 }
 async function authenticate(req,res,next) {
  try {
   const token=cookieValue(req.headers.cookie,COOKIE);
   if(!/^[a-f0-9]{64}$/.test(token)) return res.status(401).json({error:'برای ادامه وارد حساب مدیریت شو.'});
   const r=await pool.query("SELECT a.id,a.username,a.display_name,a.role,a.permissions FROM admin_sessions s JOIN admin_users a ON a.id=s.admin_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND a.is_active=true",[hashToken(token)]);
   if(!r.rowCount) { clearCookie(res); return res.status(401).json({error:'نشست مدیریت منقضی یا غیرفعال شده است.'}); }
   req.admin=r.rows[0];
   await pool.query('UPDATE admin_sessions SET last_seen_at=NOW() WHERE token_hash=$1',[hashToken(token)]);
   next();
  } catch(error) { next(error); }
 }
 const ownerOnly=(req,res,next)=>{ if(req.method!=='GET'&&req.get('x-admin-request')!=='1') return res.status(403).json({error:'درخواست تغییر اطلاعات معتبر نیست.'}); authenticate(req,res,()=>req.admin.role==='owner'?next():res.status(403).json({error:'این بخش فقط در اختیار مالک فروشگاه است.'})); };
 router.get('/status',async(_req,res)=>{
  try { const r=await pool.query("SELECT COUNT(*)::int AS count FROM admin_users WHERE role='owner'"); res.json({setup_required:r.rows[0].count===0}); }
  catch { res.status(503).json({error:'وضعیت راه‌اندازی مدیریت قابل دریافت نیست.'}); }
 });
 router.post('/bootstrap',rateLimit,async(req,res)=>{
  if(req.get('x-admin-request')!=='1') return res.status(403).json({error:'درخواست معتبر نیست.'});
  if(!process.env.ADMIN_API_KEY||!safeEqual(process.env.ADMIN_API_KEY,req.body?.admin_api_key)) return res.status(401).json({error:'کلید راه‌اندازی مدیریت صحیح نیست.'});
  const username=usernameOf(req.body?.username||'owner'),display=String(req.body?.display_name||'مالک فروشگاه').trim().slice(0,120),password=String(req.body?.password||'');
  if(!validUsername(username)||!display||password.length<12||password.length>200) return res.status(400).json({error:'نام کاربری معتبر و رمز عبور حداقل ۱۲ نویسه‌ای لازم است.'});
  const client=await pool.connect();
  try {
   await client.query('BEGIN'); await client.query('LOCK TABLE admin_users IN EXCLUSIVE MODE');
   const count=await client.query("SELECT COUNT(*)::int AS count FROM admin_users WHERE role='owner'");
   if(count.rows[0].count) { await client.query('ROLLBACK'); return res.status(409).json({error:'حساب مالک قبلاً ساخته شده است؛ از صفحه ورود استفاده کن.'}); }
   const salt=crypto.randomBytes(16),hash=await scrypt(password,salt,64);
   const r=await client.query("INSERT INTO admin_users(username,display_name,password_hash,password_salt,role,permissions) VALUES($1,$2,$3,$4,'owner',$5::jsonb) RETURNING id,username,display_name,role",
    [username,display,hash.toString('hex'),salt.toString('hex'),JSON.stringify(PERMISSIONS)]);
   await client.query('COMMIT'); const admin=r.rows[0]; await createSession(admin.id,req,res);
   await audit(pool,admin,req,'owner.bootstrap','administrators',201); res.status(201).json({admin,permissions:PERMISSIONS});
  } catch(error) { try { await client.query('ROLLBACK'); } catch {} console.error('Admin bootstrap failed:',error.message); res.status(503).json({error:'راه‌اندازی حساب مالک انجام نشد.'}); }
  finally { client.release(); }
 });
 router.post('/login',rateLimit,async(req,res)=>{
  if(req.get('x-admin-request')!=='1') return res.status(403).json({error:'درخواست معتبر نیست.'});
  const username=usernameOf(req.body?.username),password=String(req.body?.password||'');
  if(!validUsername(username)||!password) return res.status(400).json({error:'نام کاربری و رمز عبور را وارد کن.'});
  try {
   const r=await pool.query('SELECT id,username,display_name,password_hash,password_salt,role,permissions FROM admin_users WHERE username=$1 AND is_active=true',[username]);
   if(!r.rowCount) return res.status(401).json({error:'نام کاربری یا رمز عبور صحیح نیست.'});
   const row=r.rows[0],candidate=await scrypt(password,Buffer.from(row.password_salt,'hex'),64),expected=Buffer.from(row.password_hash,'hex');
   if(candidate.length!==expected.length||!crypto.timingSafeEqual(candidate,expected)) return res.status(401).json({error:'نام کاربری یا رمز عبور صحیح نیست.'});
   await createSession(row.id,req,res); await pool.query('UPDATE admin_users SET last_login_at=NOW(),updated_at=NOW() WHERE id=$1',[row.id]);
   const admin={id:row.id,username:row.username,display_name:row.display_name,role:row.role,permissions:row.permissions};
   await audit(pool,admin,req,'admin.login','authentication',200); res.json({admin,permissions:row.role==='owner'?PERMISSIONS:row.permissions});
  } catch(error) { console.error('Admin login failed:',error.message); res.status(503).json({error:'ورود مدیر انجام نشد.'}); }
 });
 router.get('/me',authenticate,(req,res)=>res.json({admin:req.admin,permissions:req.admin.role==='owner'?PERMISSIONS:req.admin.permissions}));
 router.post('/logout',authenticate,async(req,res)=>{
  if(req.get('x-admin-request')!=='1') return res.status(403).json({error:'درخواست معتبر نیست.'});
  const token=cookieValue(req.headers.cookie,COOKIE);
  if(token) await pool.query('DELETE FROM admin_sessions WHERE token_hash=$1',[hashToken(token)]).catch(()=>{});
  await audit(pool,req.admin,req,'admin.logout','authentication',200); clearCookie(res); res.json({success:true});
 });
 router.get('/audit',authenticate,async(req,res)=>{
  if(req.admin.role!=='owner'&&!req.admin.permissions.includes('audit.view')) return res.status(403).json({error:'برای مشاهده گزارش فعالیت‌ها دسترسی نداری.'});
  try {
   const r=await pool.query('SELECT id,admin_id,username,action,resource,resource_id,request_method,request_path,response_status,ip_address,created_at FROM admin_audit_logs ORDER BY created_at DESC LIMIT 300');
   res.json(r.rows);
  } catch { res.status(500).json({error:'گزارش فعالیت مدیران دریافت نشد.'}); }
 });
 router.get('/sessions',ownerOnly,async(_req,res)=>{
  try {
   const r=await pool.query("SELECT s.id,s.admin_id,a.username,a.display_name,s.ip_address,s.user_agent,s.created_at,s.last_seen_at,s.expires_at FROM admin_sessions s JOIN admin_users a ON a.id=s.admin_id WHERE s.expires_at>NOW() ORDER BY s.last_seen_at DESC LIMIT 300");
   res.json(r.rows);
  } catch { res.status(500).json({error:'نشست‌های فعال دریافت نشد.'}); }
 });
 router.get('/managers',ownerOnly,async(_req,res)=>{
  try { const r=await pool.query("SELECT id,username,display_name,permissions,is_active,last_login_at,created_at FROM admin_users WHERE role='manager' ORDER BY created_at DESC"); res.json(r.rows); }
  catch { res.status(500).json({error:'فهرست مدیران دریافت نشد.'}); }
 });
 router.post('/managers',ownerOnly,async(req,res)=>{
  const username=usernameOf(req.body?.username),display=String(req.body?.display_name||'').trim().slice(0,120),password=String(req.body?.password||''),permissions=req.body?.permissions;
  if(!validUsername(username)||!display||password.length<12||password.length>200||!validPermissions(permissions)) return res.status(400).json({error:'نام کاربری، نام نمایشی، رمز حداقل ۱۲ نویسه‌ای و مجوزهای معتبر لازم است.'});
  try {
   const salt=crypto.randomBytes(16),hash=await scrypt(password,salt,64);
   const r=await pool.query("INSERT INTO admin_users(username,display_name,password_hash,password_salt,role,permissions,created_by) VALUES($1,$2,$3,$4,'manager',$5::jsonb,$6) RETURNING id,username,display_name,permissions,is_active,created_at",
    [username,display,hash.toString('hex'),salt.toString('hex'),JSON.stringify(permissions),req.admin.id]);
   await audit(pool,req.admin,req,'manager.create','administrators',201,String(r.rows[0].id)); res.status(201).json(r.rows[0]);
  } catch(error) { if(error.code==='23505') return res.status(409).json({error:'این نام کاربری قبلاً ثبت شده است.'}); res.status(503).json({error:'ساخت حساب مدیر انجام نشد.'}); }
 });
 router.patch('/managers/:id',ownerOnly,async(req,res)=>{
  const id=String(req.params.id||''),permissions=req.body?.permissions,active=req.body?.is_active,password=req.body?.password;
  if(!/^[1-9][0-9]*$/.test(id)) return res.status(400).json({error:'شناسه مدیر معتبر نیست.'});
  if(permissions!==undefined&&!validPermissions(permissions)) return res.status(400).json({error:'فهرست مجوزها معتبر نیست.'});
  if(active!==undefined&&typeof active!=='boolean') return res.status(400).json({error:'وضعیت مدیر معتبر نیست.'});
  if(password!==undefined&&(String(password).length<12||String(password).length>200)) return res.status(400).json({error:'رمز جدید باید حداقل ۱۲ نویسه داشته باشد.'});
  if(permissions===undefined&&active===undefined&&password===undefined) return res.status(400).json({error:'تغییری برای ذخیره ارسال نشده است.'});
  try {
   const found=await pool.query("SELECT id,role FROM admin_users WHERE id=$1",[id]);
   if(!found.rowCount||found.rows[0].role!=='manager') return res.status(404).json({error:'مدیر پیدا نشد.'});
   let passwordHash=null,passwordSalt=null;
   if(password!==undefined) { const salt=crypto.randomBytes(16),hash=await scrypt(String(password),salt,64); passwordHash=hash.toString('hex'); passwordSalt=salt.toString('hex'); }
   const r=await pool.query('UPDATE admin_users SET permissions=COALESCE($1::jsonb,permissions),is_active=COALESCE($2,is_active),password_hash=COALESCE($3,password_hash),password_salt=COALESCE($4,password_salt),updated_at=NOW() WHERE id=$5 RETURNING id,username,display_name,permissions,is_active,last_login_at,created_at',
    [permissions===undefined?null:JSON.stringify(permissions),active===undefined?null:active,passwordHash,passwordSalt,id]);
   if(active===false||password!==undefined) await pool.query('DELETE FROM admin_sessions WHERE admin_id=$1',[id]);
   await audit(pool,req.admin,req,'manager.update','administrators',200,id); res.json(r.rows[0]);
  } catch { res.status(503).json({error:'به‌روزرسانی مدیر انجام نشد.'}); }
 });
 function requireAdmin(req,res,next) {
  if(req.method!=='GET'&&req.get('x-admin-request')!=='1') return res.status(403).json({error:'درخواست تغییر اطلاعات معتبر نیست.'});
  authenticate(req,res,()=>{
   const needed=requiredPermission(req);
   const permissions=req.admin.permissions||[];
   const implied=needed.endsWith('.view')&&[needed.replace('.view','.update'),needed.replace('.view','.create'),needed.replace('.view','.archive')].some(x=>permissions.includes(x));
   const uploadAllowed=needed==='products.upload'&&(permissions.includes('products.create')||permissions.includes('products.update'));
   if(req.admin.role!=='owner'&&!permissions.includes(needed)&&!implied&&!uploadAllowed) return res.status(403).json({error:'برای این عملیات دسترسی لازم را نداری.'});
   res.on('finish',()=>{ if(req.method!=='GET') audit(pool,req.admin,req,'admin.'+(req.method==='POST'?'create':req.method==='DELETE'?'archive':'update'),needed.split('.')[0],res.statusCode,req.params?.id||null); });
   next();
  });
 }
 return {router,requireAdmin,permissions:PERMISSIONS};
}
module.exports={createAdminAuth};