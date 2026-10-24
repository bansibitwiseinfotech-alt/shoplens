import dotenv from 'dotenv';
dotenv.config({ path: 'd:/shoplens/backend/.env' });
import mongoose from 'mongoose';

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const shop = 'promobile-hub.myshopify.com';

  const baseProd = await mongoose.connection.collection('tbl_products').findOne({
    shopifyProductId: 'gid://shopify/Product/7635360055383'
  });
  console.log('Base product:', JSON.stringify(baseProd, null, 2));

  const bundleProd = await mongoose.connection.collection('tbl_products').findOne({
    shopifyProductId: 'gid://shopify/Product/7738094616663'
  });
  console.log('Bundle product:', JSON.stringify(bundleProd, null, 2));

  process.exit(0);
}
check().catch(console.error);
