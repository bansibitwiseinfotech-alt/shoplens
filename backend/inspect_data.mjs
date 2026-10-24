import dotenv from 'dotenv';
dotenv.config({ path: 'd:/shoplens/backend/.env' });
import mongoose from 'mongoose';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const shop = 'promobile-hub.myshopify.com';

  const purchases = await mongoose.connection.collection('tbl_search_events').find({
    shop,
    eventType: 'purchase'
  }).limit(3).toArray();
  console.log('Sample purchase events:', JSON.stringify(purchases, null, 2));

  // Check product_view events
  const views = await mongoose.connection.collection('tbl_search_events').find({
    shop,  
    eventType: { $in: ['product_view', 'view'] }
  }).toArray();
  console.log('Product view events count:', views.length);    

  // Check all collections
  const collections = await mongoose.connection.collection('tbl_collections').find({ shop }).toArray();
  let totalProductIdsInCollections = 0;
  for (const c of collections) {
    if (c.productIds && c.productIds.length > 0) {
      console.log('Collection:', c.title, 'has', c.productIds.length, 'productIds. Sample:', c.productIds.slice(0, 3));
      totalProductIdsInCollections += c.productIds.length;
    }
  }
  console.log('Total collection mappings found:', totalProductIdsInCollections);

  const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const end = new Date();

  const { getVerifiedBaseline } = await import('./services/merchandisingSimulator.service.js');
  console.log('--- getVerifiedBaseline STOREWIDE ---');
  const storeRes = await getVerifiedBaseline({ shop, startDate: start, endDate: end });
  console.log('Storewide metrics:', storeRes.metrics);
  console.log('Storewide dataQuality:', storeRes.dataQuality);

  console.log('--- getVerifiedBaseline PRODUCT (Apple Silicone Case) ---');
  const prodRes = await getVerifiedBaseline({ shop, startDate: start, endDate: end, productId: 'gid://shopify/Product/7635360055383' });
  console.log('Apple Case metrics:', prodRes.metrics);
  console.log('Apple Case dataQuality:', prodRes.dataQuality);

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
