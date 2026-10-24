import dotenv from 'dotenv';
dotenv.config({ path: 'd:/shoplens/backend/.env' });
import mongoose from 'mongoose';
import http from 'http';
import crypto from 'crypto';
import app from '../app.js';

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function createJwt(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${data}.${signature}`;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const server = http.createServer(app);

  server.listen(0, async () => {
    const port = server.address().port;
    const shop = 'promobile-hub.myshopify.com';
    const payload = {
      iss: `https://${shop}/admin`,
      dest: `https://${shop}`,
      aud: process.env.SHOPIFY_API_KEY,
      sub: 'mock_user_123',
      exp: Math.floor(Date.now() / 1000) + 3600,
      nbf: Math.floor(Date.now() / 1000) - 60,
      iat: Math.floor(Date.now() / 1000) - 60,
      jti: 'test-jti-123',
      sid: 'test-sid-123'
    };

    const token = createJwt(payload, process.env.SHOPIFY_API_SECRET);
    const headers = {
      'Authorization': `Bearer ${token}`,
      'x-shopify-shop-domain': shop
    };

    // 1. Summary
    const sumRes = await fetch(`http://localhost:${port}/api/search-intelligence/summary?shop=${shop}`, { headers });
    console.log('1. Summary endpoint status:', sumRes.status);
    const sumData = await sumRes.json();
    console.log('   Searches:', sumData.data?.totalSearches, 'Terms:', sumData.data?.uniqueSearchTerms);

    // 2. Queries
    const qRes = await fetch(`http://localhost:${port}/api/search-intelligence/queries?shop=${shop}`, { headers });
    console.log('2. Queries endpoint status:', qRes.status);
    const qData = await qRes.json();
    console.log('   Queries count:', qData.data?.length, 'Top query:', qData.data?.[0]?.query);

    // 3. Trends
    const tRes = await fetch(`http://localhost:${port}/api/search-intelligence/trends?shop=${shop}`, { headers });
    console.log('3. Trends endpoint status:', tRes.status);
    const tData = await tRes.json();
    console.log('   Trends count:', tData.data?.length);

    // 4. Products
    const pRes = await fetch(`http://localhost:${port}/api/search-intelligence/products?shop=${shop}`, { headers });
    console.log('4. Products endpoint status:', pRes.status);
    const pData = await pRes.json();
    console.log('   Products count:', pData.data?.length);

    server.close();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
