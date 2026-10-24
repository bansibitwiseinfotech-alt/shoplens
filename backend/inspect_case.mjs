import dotenv from 'dotenv';
dotenv.config({ path: 'd:/shoplens/backend/.env' });
import mongoose from 'mongoose';

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const shop = 'promobile-hub.myshopify.com';

  const prod = await mongoose.connection.collection('tbl_products').findOne({
    shop,
    title: { $regex: /Apple Silicone Case/i }
  });
  console.log('Product in tbl_products:', prod ? { shopifyProductId: prod.shopifyProductId, title: prod.title, handle: prod.handle } : 'NOT FOUND');

  if (prod) {
    const rawId = prod.shopifyProductId;
    const numId = rawId.split('/').pop();
    const ids = [rawId, numId, 'gid://shopify/Product/' + numId];

    const merchEvents = await mongoose.connection.collection('tbl_merchandising_events').find({
      shop,
      productId: { $in: ids }
    }).toArray();
    console.log('Merch events count:', merchEvents.length);

    const custEvents = await mongoose.connection.collection('tbl_customer_discovery_events').find({
      shopDomain: shop,
      $or: [
        { productId: { $in: ids } },
        { productTitle: { $regex: /Apple Silicone Case/i } }
      ]
    }).toArray();
    console.log('Cust events count:', custEvents.length, JSON.stringify(custEvents, null, 2));

    const searchEvents = await mongoose.connection.collection('tbl_search_events').find({
      shop,
      $or: [
        { productId: { $in: ids } },
        { 'metadata.productTitle': { $regex: /Apple Silicone Case/i } }
      ]
    }).toArray();
    console.log('Search events count:', searchEvents.length);

    // What events exist in ANY table that match this product?
    const allEventsInCust = await mongoose.connection.collection('tbl_customer_discovery_events').find({
      shopDomain: shop
    }).limit(5).toArray();
    console.log('Sample cust events in DB:', allEventsInCust.map(e => ({ title: e.productTitle, pid: e.productId, type: e.eventType })));
  }

  process.exit(0);
}
check().catch(console.error);
