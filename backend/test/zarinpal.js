const assert = require('node:assert/strict');
const { getConfig, tomanToRial, validAuthority } = require('../src/zarinpal');

assert.equal(tomanToRial(100), 1000);
assert.equal(tomanToRial(12500), 125000);
assert.throws(() => tomanToRial(99));
assert.throws(() => tomanToRial('not-a-number'));
assert.equal(validAuthority('A12345678901234567890123456789012345'), true);
assert.equal(validAuthority('bad'), false);

const sandbox = getConfig({
  ZARINPAL_MODE: 'sandbox',
  ZARINPAL_ENABLED: 'true',
  PUBLIC_BASE_URL: 'https://shop.example.test'
});
assert.equal(sandbox.ready, true);
assert.equal(sandbox.mode, 'sandbox');
assert.equal(sandbox.merchantId, '00000000-0000-0000-0000-000000000000');

const noHttps = getConfig({
  ZARINPAL_MODE: 'sandbox',
  ZARINPAL_ENABLED: 'true',
  PUBLIC_BASE_URL: 'http://127.0.0.1:3000'
});
assert.equal(noHttps.ready, false);

const productionWithoutMerchant = getConfig({
  ZARINPAL_MODE: 'production',
  ZARINPAL_ENABLED: 'true',
  PUBLIC_BASE_URL: 'https://shop.example.test'
});
assert.equal(productionWithoutMerchant.ready, false);

const disabled = getConfig({
  ZARINPAL_MODE: 'sandbox',
  ZARINPAL_ENABLED: 'false',
  PUBLIC_BASE_URL: 'https://shop.example.test'
});
assert.equal(disabled.ready, false);

console.log('ALL ZARINPAL UNIT TESTS PASSED');
