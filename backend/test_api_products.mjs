import dotenv from 'dotenv';
dotenv.config({ path: 'd:/shoplens/backend/.env' });
import crypto from 'crypto';

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function createJwt(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const data = encodedHeader + '.' + encodedPayload;
  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return data + '.' + signature;
}

async function main() {
  const shop = 'promobile-hub.myshopify.com';
  const payload = {
    iss: 'https://' + shop + '/admin',
    dest: 'https://' + shop,
    aud: process.env.SHOPIFY_API_KEY,
    sub: 'mock_user_123',
    exp: Math.floor(Date.now() / 1000) + 3600,
    nbf: Math.floor(Date.now() / 1000) - 60,
    iat: Math.floor(Date.now() / 1000) - 60,
    jti: 'test-jti-123',
    sid: 'test-sid-123'
  };       
  const token = createJwt(payload, process.env.SHOPIFY_API_SECRET);
  const res = await fetch('http://localhost:5000/api/product-discoverability?sort=highest&limit=100&shop=' + shop, {
    headers: { 'Authorization': 'Bearer ' + token, 'x-shopify-shop-domain': shop }
  });
  const json = await res.json();
  const active = (json.data || []).filter(p => p.discoverabilityScore > 0 || p.searchVisibility > 0 || p.clicks > 0 || p.purchases > 0 || p.collectionCount > 0 || p.views > 0);
  console.log('Active products (any metric > 0):', active.length);
  for (const p of active) {
    console.log(p.productTitle, '| Score:', p.discoverabilityScore, '| Status:', p.discoverabilityStatus, '| SV:', p.searchVisibility, '| Views:', p.views, '| Clicks:', p.clicks, '| ATC:', p.addToCart, '| Purchases:', p.purchases, '| Collections:', p.collectionCount);
  }
}

main().catch(console.error);
