import dotenv from 'dotenv';
dotenv.config({ path: 'd:/shoplens/backend/.env' });
import mongoose from 'mongoose';

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const shop = 'promobile-hub.myshopify.com';

  console.log('--- Checking all collections for views ---');
  for (const collName of ['tbl_search_events', 'tbl_customer_discovery_events', 'tbl_merchandising_events']) {
    const types = await mongoose.connection.collection(collName).aggregate([
      { $match: { $or: [{ shop }, { shopDomain: shop }] } },
      { $group: { _id: { eventType: '$eventType', eventName: '$eventName' }, count: { $sum: 1 } } }
    ]).toArray();
    console.log(collName, ':', types);
  }

  // Check product IDs in tbl_customer_discovery_events
  const custProds = await mongoose.connection.collection('tbl_customer_discovery_events').aggregate([
    { $match: { shopDomain: shop, eventType: 'product_viewed' } },
    { $group: { _id: '$productId', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 }
  ]).toArray();
  console.log('Top products in cust discovery views:', custProds);

  // Check if any product in tbl_products has views AND clicks
  const allMerchProds = await mongoose.connection.collection('tbl_merchandising_events').distinct('productId', { shop, eventType: 'product_click' });
  console.log('All merch products with clicks:', allMerchProds.length);

  const overlap = await mongoose.connection.collection('tbl_customer_discovery_events').find({
    shopDomain: shop,
    eventType: 'product_viewed',
    productId: { $in: allMerchProds }
  }).toArray();
  console.log('Overlap between merch click productIds and cust view productIds:', overlap.length);

  process.exit(0);
}
check().catch(console.error);
