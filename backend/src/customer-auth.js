const express = require('express');
const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);
const router = express.Router();
const SESSION_DAYS = 30;
const COOKIE = 'avelora_session';

function normalizeDigits(value) {
  return String(value).replace(/[۰-۹٠-٩]/g, d => {
    const n=d.charCodeAt(0);
    return String(n >= 0x06F0 && n <= 0x06F9 ? n-0x06F0 : n-0x0660);
  });
}
function normalizePhone(value) {
  let phone=normalizeDigits(value).trim().replace(/[\s-]/g,'');
  if(phone.startsWith('+98')) phone='0'+phone.slice(3);
  else if(phone.startsWith('0098')) phone='0'+phone.slice(4);
  return /^09\d{9}$/.test(phone) ? phone : null;
}
function cookieValue(header,name) {
  const entry=String(header||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='));
  if (!entry) return '';
  try { return decodeURIComponent(entry.slice(name.length+1)); } catch { return ''; }
}
function setSessionCookie(res, token) {
  const secure=process.env.NODE_ENV==='production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', COOKIE+'='+encodeURIComponent(token)+'; Path=/; HttpOnly; SameSite=Lax; Max-Age='+(SESSION_DAYS*86400)+secure);
}
function clearSessionCookie(res) {
  const secure=process.env.NODE_ENV==='production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', COOKIE+'=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'+secure);
}
async function createSession(pool, customerId, res) {
  const token=crypto.randomBytes(32).toString('hex');
  const hash=crypto.createHash('sha256').update(token).digest('hex');
  await pool.query(
    'INSERT INTO customer_sessions (customer_id,token_hash,expires_at) VALUES ($1,$2,NOW()+INTERVAL \'30 days\')',
    [customerId,hash]
  );
  setSessionCookie(res,token);
}
function createCustomerAuth({pool, rateLimit}) {
  router.post('/register', rateLimit, async (req,res) => {
    const name=String(req.body?.name||'').trim().slice(0,120);
    const phone=normalizePhone(req.body?.phone||'');
    const password=String(req.body?.password||'');
    if(!name || !phone || password.length<10 || password.length>200) {
      return res.status(400).json({error:'نام، شماره موبایل معتبر و رمز عبور حداقل ۱۰ نویسه‌ای لازم است.'});
    }
    try {
      const salt=crypto.randomBytes(16);
      const hash=await scrypt(password,salt,64);
      const result=await pool.query(
        'INSERT INTO customers (full_name,phone,password_hash,password_salt) VALUES ($1,$2,$3,$4) RETURNING id,full_name,phone',
        [name,phone,hash.toString('hex'),salt.toString('hex')]
      );
      await createSession(pool,result.rows[0].id,res);
      res.status(201).json({customer:result.rows[0],discount_percent:0,message:'حساب عضویت AVELORA ساخته شد.'});
    } catch(error) {
      if(error.code==='23505') return res.status(409).json({error:'این شماره موبایل قبلاً ثبت‌نام کرده است. وارد حساب شو.'});
      console.error('Customer registration failed:',error.message);
      res.status(503).json({error:'ثبت‌نام موقتاً انجام نشد. دوباره تلاش کن.'});
    }
  });
  router.post('/login', rateLimit, async (req,res) => {
    const phone=normalizePhone(req.body?.phone||'');
    const password=String(req.body?.password||'');
    if(!phone || !password) return res.status(400).json({error:'شماره موبایل و رمز عبور را وارد کن.'});
    try {
      const result=await pool.query('SELECT id,full_name,phone,password_hash,password_salt FROM customers WHERE phone=$1 AND is_active=true',[phone]);
      if(!result.rowCount) return res.status(401).json({error:'شماره موبایل یا رمز عبور درست نیست.'});
      const customer=result.rows[0];
      const candidate=await scrypt(password,Buffer.from(customer.password_salt,'hex'),64);
      const expected=Buffer.from(customer.password_hash,'hex');
      if(candidate.length!==expected.length || !crypto.timingSafeEqual(candidate,expected))
        return res.status(401).json({error:'شماره موبایل یا رمز عبور درست نیست.'});
      await createSession(pool,customer.id,res);
      res.json({customer:{id:customer.id,full_name:customer.full_name,phone:customer.phone},discount_percent:0});
    } catch(error) {
      console.error('Customer login failed:',error.message);
      res.status(503).json({error:'ورود موقتاً انجام نشد. دوباره تلاش کن.'});
    }
  });
  router.post('/logout', async (req,res) => {
    const token=cookieValue(req.headers.cookie,COOKIE);
    if(token) {
      const hash=crypto.createHash('sha256').update(token).digest('hex');
      await pool.query('DELETE FROM customer_sessions WHERE token_hash=$1',[hash]).catch(()=>{});
    }
    clearSessionCookie(res);
    res.json({success:true});
  });
  router.get('/me', async (req,res) => {
    res.json({customer:req.customer||null,discount_percent:0});
  });
  async function optionalCustomer(req,res,next) {
    try {
      const token=cookieValue(req.headers.cookie,COOKIE);
      if(!token || !/^[a-f0-9]{64}$/.test(token)) { req.customer=null; return next(); }
      const hash=crypto.createHash('sha256').update(token).digest('hex');
      const result=await pool.query(
        'SELECT c.id,c.full_name,c.phone FROM customer_sessions s JOIN customers c ON c.id=s.customer_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND c.is_active=true',
        [hash]
      );
      req.customer=result.rows[0]||null;
      next();
    } catch(error) {
      next(error);
    }
  }
  return {router,optionalCustomer};
}
module.exports={createCustomerAuth};
