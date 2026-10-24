import dotenv from 'dotenv';
dotenv.config({ path: 'd:/shoplens/backend/.env' });
import mongoose from 'mongoose';

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const shop = 'promobile-hub.myshopify.com';

  const allMerchProds = await mongoose.connection.collection('tbl_merchandising_events').distinct('productId', { shop, eventType: 'product_click' });

  const overlap = await mongoose.connection.collection('tbl_customer_discovery_events').find({
    shopDomain: shop,
    eventType: 'product_viewed',
    productId: { $in: allMerchProds }
  }).toArray();

  for (const o of overlap) {
    const clicks = await mongoose.connection.collection('tbl_merchandising_events').countDocuments({
      shop,
      productId: o.productId,
      eventType: 'product_click'
    });
    console.log('Product:', o.productTitle, o.productId, 'Views in cust:', 1, 'Clicks in merch:', clicks);
  }

  process.exit(0);
}
check().catch(console.error);
