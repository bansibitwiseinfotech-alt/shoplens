import dotenv from 'dotenv';
dotenv.config({ path: 'd:/shoplens/backend/.env' });
import mongoose from 'mongoose';

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const shop = 'promobile-hub.myshopify.com';

  const prodsWithViews = await mongoose.connection.collection('tbl_customer_discovery_events').distinct('productId', {
    shopDomain: shop,
    eventType: 'product_viewed'
  });

  console.log('Total products with views in cust discovery:', prodsWithViews.length);

  const validProducts = [];

  for (const pid of prodsWithViews) {
    if (!pid) continue;
    const numId = pid.split('/').pop();
    const ids = [pid, numId, 'gid://shopify/Product/' + numId];

    const views = await mongoose.connection.collection('tbl_customer_discovery_events').countDocuments({
      shopDomain: shop,
      eventType: 'product_viewed',
      productId: { $in: ids }
    });

    const clicks = await mongoose.connection.collection('tbl_merchandising_events').countDocuments({
      shop,
      eventType: 'product_click',
      productId: { $in: ids }
    });

    if (views > 0 && clicks <= views) {
      const pDoc = await mongoose.connection.collection('tbl_products').findOne({ shopifyProductId: { $in: ids } });
      validProducts.push({ title: pDoc?.title, pid, views, clicks });
    }
  }

  console.log('Products where views > 0 and clicks <= views:', validProducts.length, validProducts);

  process.exit(0);
}
check().catch(console.error);
