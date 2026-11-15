const crypto = require('crypto');

function createCloudinaryStorage({env=process.env,fetchImpl=global.fetch,now=Date.now}={}) {
  const cloudName=String(env.CLOUDINARY_CLOUD_NAME||'').trim();
  const apiKey=String(env.CLOUDINARY_API_KEY||'').trim();
  const apiSecret=String(env.CLOUDINARY_API_SECRET||'').trim();
  const configured=Boolean(cloudName&&apiKey&&apiSecret);

  async function upload({buffer,mime,filename}) {
    if(!configured) return null;
    if(!Buffer.isBuffer(buffer)||!['image/jpeg','image/png','image/webp'].includes(mime)||!/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(filename)) {
      throw new Error('Invalid Cloudinary upload input.');
    }
    const timestamp=String(Math.floor(now()/1000));
    const folder='avelora/products';
    const signatureBase='folder='+folder+'&public_id='+filename.slice(0,filename.lastIndexOf('.'))+'&timestamp='+timestamp+apiSecret;
    const signature=crypto.createHash('sha1').update(signatureBase).digest('hex');
    const form=new FormData();
    form.set('file',new Blob([buffer],{type:mime}),filename);
    form.set('api_key',apiKey);
    form.set('timestamp',timestamp);
    form.set('folder',folder);
    form.set('public_id',filename.slice(0,filename.lastIndexOf('.')));
    form.set('signature',signature);
    const response=await fetchImpl('https://api.cloudinary.com/v1_1/'+encodeURIComponent(cloudName)+'/image/upload',{method:'POST',body:form});
    let payload={};
    try { payload=await response.json(); } catch {}
    if(!response.ok||typeof payload.secure_url!=='string'||!payload.secure_url.startsWith('https://')) {
      throw new Error('Cloudinary image upload failed with status '+response.status+'.');
    }
    return payload.secure_url;
  }

  return {isConfigured:configured,upload};
}

module.exports={createCloudinaryStorage};
