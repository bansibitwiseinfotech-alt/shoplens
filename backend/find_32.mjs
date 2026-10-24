import dotenv from 'dotenv';
dotenv.config({ path: 'd:/shoplens/backend/.env' });
import mongoose from 'mongoose';

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const shop = 'promobile-hub.myshopify.com';

  const pid = 'gid://shopify/Product/7635360055383';
  const numId = '7635360055383';
  const ids = [pid, numId];

  const custViews = await mongoose.connection.collection('tbl_customer_discovery_events').countDocuments({
    shopDomain: shop,
    productId: { $in: ids }
  });
  console.log('Cust views for 7635360055383:', custViews);

  const searchViews = await mongoose.connection.collection('tbl_search_events').countDocuments({
    shop,
    productId: { $in: ids }
  });
  console.log('Search views for 7635360055383:', searchViews);

  const prod = await mongoose.connection.collection('tbl_products').findOne({ shopifyProductId: pid });
  console.log('Product:', prod.title, prod.handle);

  const viewsByHandleOrTitle = await mongoose.connection.collection('tbl_customer_discovery_events').find({
    shopDomain: shop,
    $or: [
      { productTitle: prod.title },
      { 'metadata.handle': prod.handle },
      { 'metadata.title': prod.title }
    ]
  }).toArray();
  console.log('Views by handle or title:', viewsByHandleOrTitle.length);

  process.exit(0);
}
check().catch(console.error);
