const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {createCloudinaryStorage}=require('../src/cloudinary-storage');

async function main(){
  assert.equal(createCloudinaryStorage({env:{}}).isConfigured,false);
  assert.equal(await createCloudinaryStorage({env:{}}).upload({}),null);

  let request;
  const env={CLOUDINARY_CLOUD_NAME:'demo-cloud',CLOUDINARY_API_KEY:'123456',CLOUDINARY_API_SECRET:'test-secret'};
  const storage=createCloudinaryStorage({
    env,
    now:()=>1700000000000,
    fetchImpl:async(url,options)=>{
      request={url,options};
      return {ok:true,status:200,json:async()=>({secure_url:'https://res.cloudinary.com/demo/image/upload/test.jpg'})};
    }
  });
  assert.equal(storage.isConfigured,true);
  const buffer=Buffer.from([0xff,0xd8,0xff,0x00]);
  const url=await storage.upload({buffer,mime:'image/jpeg',filename:'0123456789abcdef0123456789abcdef.jpg'});
  assert.equal(url,'https://res.cloudinary.com/demo/image/upload/test.jpg');
  assert.equal(request.url,'https://api.cloudinary.com/v1_1/demo-cloud/image/upload');
  const form=request.options.body;
  assert.equal(form.get('api_key'),'123456');
  assert.equal(form.get('timestamp'),'1700000000');
  assert.equal(form.get('folder'),'avelora/products');
  const expected=crypto.createHash('sha1').update('folder=avelora/products&public_id=0123456789abcdef0123456789abcdef&timestamp=1700000000test-secret').digest('hex');
  assert.equal(form.get('signature'),expected);

  const partial=createCloudinaryStorage({env:{CLOUDINARY_CLOUD_NAME:'demo'}});
  assert.equal(partial.isConfigured,false);
  await assert.rejects(()=>storage.upload({buffer,mime:'image/gif',filename:'bad.gif'}));
  console.log('Cloudinary signed upload tests passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
