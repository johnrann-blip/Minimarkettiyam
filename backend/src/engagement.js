const express = require('express');
const crypto = require('crypto');

function validId(value) {
  return /^\\d{1,18}$/.test(String(value || ''));
}
function visitorKey(req) {
  if (req.customer?.id) return 'customer:' + String(req.customer.id);
  const raw = String(req.get('x-avelora-visitor') || '');
  if (!/^[a-f0-9]{32,64}$/i.test(raw)) return null;
  return 'guest:' + crypto.createHash('sha256').update(raw.toLowerCase()).digest('hex');
}
function createEngagementRouter({pool, likeRateLimit, feedbackRateLimit}) {
  const router = express.Router();

  router.get('/reviews', async (_req, res) => {
    try {
      const result = await pool.query(
        `SELECT id,display_name,feedback_type,message,created_at
         FROM customer_feedback WHERE status='approved'
         ORDER BY created_at DESC LIMIT 12`
      );
      res.json(result.rows);
    } catch {
      res.status(503).json({error:'دریافت دیدگاه‌های مشتریان موقتاً انجام نشد.'});
    }
  });

  router.post('/reviews', feedbackRateLimit, async (req, res) => {
    const displayName = String(req.body?.display_name || '').trim().slice(0,80);
    const feedbackType = String(req.body?.feedback_type || 'comment');
    const message = String(req.body?.message || '').trim();
    if (displayName.length < 2 || !['comment','suggestion'].includes(feedbackType) ||
        message.length < 10 || message.length > 1200) {
      return res.status(400).json({error:'نام حداقل ۲ نویسه و متن دیدگاه بین ۱۰ تا ۱۲۰۰ نویسه باشد.'});
    }
    try {
      const result = await pool.query(
        `INSERT INTO customer_feedback (display_name,feedback_type,message)
         VALUES ($1,$2,$3) RETURNING id,created_at`,
        [displayName,feedbackType,message]
      );
      res.status(201).json({
        success:true,
        feedback:{id:result.rows[0].id,status:'pending',created_at:result.rows[0].created_at},
        message:'دیدگاهت ثبت شد و پس از بررسی مدیر در سایت نمایش داده می‌شود.'
      });
    } catch {
      res.status(503).json({error:'ثبت دیدگاه موقتاً انجام نشد. دوباره تلاش کن.'});
    }
  });

  router.post('/products/:id/like', likeRateLimit, async (req, res) => {
    const productId = String(req.params.id || '');
    const key = visitorKey(req);
    if (!validId(productId)) return res.status(400).json({error:'شناسه محصول معتبر نیست.'});
    if (!key) return res.status(400).json({error:'شناسه مرورگر معتبر نیست؛ صفحه را تازه‌سازی کن.'});
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const product = await client.query(
        'SELECT id FROM products WHERE id=$1 AND is_active=true FOR UPDATE',
        [productId]
      );
      if (!product.rowCount) {
        await client.query('ROLLBACK');
        return res.status(404).json({error:'محصول پیدا نشد.'});
      }
      const existing = await client.query(
        'SELECT 1 FROM product_likes WHERE product_id=$1 AND voter_key=$2',
        [productId,key]
      );
      let liked;
      if (existing.rowCount) {
        await client.query('DELETE FROM product_likes WHERE product_id=$1 AND voter_key=$2',[productId,key]);
        liked = false;
      } else {
        await client.query(
          'INSERT INTO product_likes (product_id,voter_key) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [productId,key]
        );
        liked = true;
      }
      const count = await client.query(
        'SELECT COUNT(*)::int AS likes_count FROM product_likes WHERE product_id=$1',
        [productId]
      );
      await client.query('COMMIT');
      res.json({product_id:productId,liked,likes_count:count.rows[0].likes_count});
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(()=>{});
      console.error('Product like failed:',error.message);
      res.status(503).json({error:'ثبت لایک موقتاً انجام نشد.'});
    } finally {
      client?.release();
    }
  });

  return router;
}

function createFeedbackAdminRouter({pool}) {
  const router = express.Router();
  router.get('/', async (req,res) => {
    const status = ['pending','approved','rejected','all'].includes(String(req.query.status || 'pending'))
      ? String(req.query.status || 'pending') : 'pending';
    try {
      const values = [];
      const where = status === 'all' ? '' : (values.push(status), 'WHERE f.status=$1');
      const result = await pool.query(
        `SELECT f.id,f.display_name,f.feedback_type,f.message,f.status,f.created_at,
                f.reviewed_at,a.display_name AS reviewer_name
         FROM customer_feedback f
         LEFT JOIN admin_users a ON a.id=f.reviewed_by
         ${where}
         ORDER BY f.created_at DESC LIMIT 200`, values
      );
      res.json(result.rows);
    } catch {
      res.status(503).json({error:'دریافت دیدگاه‌ها برای مدیریت انجام نشد.'});
    }
  });
  router.patch('/:id', async (req,res) => {
    if (!validId(req.params.id)) return res.status(400).json({error:'شناسه دیدگاه معتبر نیست.'});
    const status = String(req.body?.status || '');
    if (!['approved','rejected'].includes(status)) {
      return res.status(400).json({error:'وضعیت فقط می‌تواند تأیید یا رد باشد.'});
    }
    try {
      const result = await pool.query(
        `UPDATE customer_feedback SET status=$1,reviewed_at=NOW(),reviewed_by=$2
         WHERE id=$3 RETURNING id,status`,
        [status,req.admin?.id || null,req.params.id]
      );
      if (!result.rowCount) return res.status(404).json({error:'دیدگاه پیدا نشد.'});
      res.json({success:true,feedback:result.rows[0]});
    } catch {
      res.status(503).json({error:'تغییر وضعیت دیدگاه انجام نشد.'});
    }
  });
  return router;
}

module.exports = {createEngagementRouter,createFeedbackAdminRouter};
